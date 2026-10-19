import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { roundAudio, roundLine } from '../voice/roundAudio';
import { RESULT_DWELL_MS, SELF_TEST_LEVELS, SELF_TEST_LOG, selfTestSamples } from '../voice/selfTest';

// The hidden self-test (#361): launched with -harfiyenSelfTest 1 the app plays
// levels 1, 2 and 3 by itself, voice on, and writes the native audio state
// every second and at every round start to Documents.

jest.setTimeout(600_000);

const written: Record<string, string> = {};
const g = globalThis as any;
g.expo = g.expo ?? {};
g.expo.modules = {
  ...(g.expo.modules ?? {}),
  AudioSessionInfo: {
    selfTest: () => '1',
    writeDocument: (name: string, text: string) => { written[name] = text; return `/Documents/${name}`; },
    get: () => ({
      category: 'AVAudioSessionCategoryPlayAndRecord', mode: 'AVAudioSessionModeDefault', categoryOptions: 0x1 | 0x4 | 0x8,
      outputs: ['Speaker (Hoparlör)'], inputs: ['MicrophoneBuiltIn (iPhone Mikrofonu)'], outputVolume: 0.5, sampleRate: 48000, otherAudioPlaying: false,
    }),
  },
};

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

test('plays three levels back to back by itself and logs the audio every second and at each round start', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  const results: string[] = [];
  for (let i = 0; i < 2000 && !selfTestSamples().some((s) => s.event === 'done'); i++) {
    await act(async () => { jest.advanceTimersByTime(500); });
    // The mic hears something else now and then (on the simulator: the Mac's speakers): never judged.
    if (i % 20 === 10) await act(async () => { rec.hear('kırmızı balon'); });
    const title = screen.queryByTestId('result-title');
    if (title) {
      const t = String(title.props.children);
      if (results[results.length - 1] !== t) results.push(t);
    }
  }
  const samples = selfTestSamples();
  expect(samples.map((s) => s.event).filter((e) => e !== 'tick')).toEqual(
    ['launch', 'round-start', 'result', 'round-start', 'result', 'round-start', 'result', 'done'],
  );
  // Every clue answered right in every level, whatever the mic heard.
  expect(results).toEqual(['HARFİYEN!']);
  expect(rec.starts).toBe(SELF_TEST_LEVELS);
  expect(samples.filter((s) => s.event === 'round-start').map((s) => s.round)).toEqual([1, 2, 3]);
  // A sample about every second, with the session, the engine and the players.
  const ticks = samples.filter((s) => s.event === 'tick');
  expect(ticks.length).toBeGreaterThan(3 * RESULT_DWELL_MS / 1000);
  const starts = samples.filter((s) => s.event === 'round-start');
  for (const s of starts) {
    expect(s.session).toMatchObject({ category: 'playAndRecord', mode: 'default', outputVolume: 0.5 });
    expect(s.vp).toMatchObject({ running: true, enabled: true, advancedDucking: false, duckingLevel: 'min' });
    expect(s.micOpen).toBe(true);
  }
  expect(starts[1].session).toEqual(starts[0].session);
  expect(starts[2].session).toEqual(starts[0].session);
  expect(ticks.some((s) => s.players.some((p) => p.name === 'host' && p.playing))).toBe(true);
  // The same log, written out as JSON to Documents.
  const file = JSON.parse(written[SELF_TEST_LOG]);
  expect(file.samples).toHaveLength(samples.length);
  // And the per-round lines match.
  const lines = roundAudio().map(roundLine);
  expect(lines).toHaveLength(3);
  expect(new Set(lines).size).toBe(1);
});
