import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { CATEGORIES } from '../data/questions';
import { speech } from '../test-utils/fakeAudio';
import { host } from '../voice/engine';
import { clueLine } from '../voice/lines';
import { SELF_TEST_LOG, SPEECH_TEST_LEVEL, selfTestLevels, selfTestSamples } from '../voice/selfTest';

// #362: launched with -harfiyenSelfTest speech the app plays tarih level 2 by
// itself with every clue recording of that level withheld: each clue is read
// by the phone voice in the round's own session (mic open), its clue appears
// when that speech starts, and the game screen says so (speech-state), which
// e2e/speech.yaml checks on the simulator.

jest.setTimeout(600_000);

const written: Record<string, string> = {};
const g = globalThis as any;
g.expo = g.expo ?? {};
g.expo.modules = {
  ...(g.expo.modules ?? {}),
  AudioSessionInfo: {
    selfTest: () => 'speech',
    writeDocument: (name: string, text: string) => { written[name] = text; return `/Documents/${name}`; },
    get: () => ({ category: 'AVAudioSessionCategoryPlayAndRecord', mode: 'AVAudioSessionModeDefault', categoryOptions: 0, outputs: [], inputs: [], outputVolume: 0.5, sampleRate: 48000, otherAudioPlaying: false }),
  },
};

const level2 = CATEGORIES.find((c) => c.category === 'tarih')!.levels.find((l) => l.level === SPEECH_TEST_LEVEL)!.questions;
const byClue = (clue: string) => level2.find((q) => q.clue === clue)!;

beforeEach(async () => {
  jest.useFakeTimers();
  speech.reset();
  await AsyncStorage.clear();
});
afterEach(() => jest.useRealTimers());

test('plays tarih level 2 with every clue read by the phone voice; each clue appears as its speech starts', async () => {
  expect(selfTestLevels()).toEqual([2]);
  await renderRouter('./src/app', { initialUrl: '/' });
  const seen: string[] = [];
  let firstLine = '';
  for (let i = 0; i < 4000 && !selfTestSamples().some((s) => s.event === 'result'); i++) {
    await act(async () => { jest.advanceTimersByTime(100); });
    const clue = screen.queryByTestId('clue');
    if (!clue) continue;
    const text = String(clue.props.children);
    if (seen[seen.length - 1] === text) continue;
    // The clue on screen is the one whose speech has started, at that moment.
    expect(speech.started.at(-1)).toBe(clueLine(byClue(text)).text);
    seen.push(text);
    if (!firstLine) firstLine = String(screen.getByTestId('speech-state').props.children);
  }
  expect(seen.length).toBeGreaterThanOrEqual(28);
  // The first clue (A) has a recording, withheld: read by the phone voice, and the diagnostic says it started.
  const a = byClue(seen[0]);
  expect(a.letter).toBe('A');
  expect(host.hasClip(a.id)).toBe(false);
  expect(firstLine).toMatch(new RegExp(`^TELEFON SESİ · ${a.id}: başladı \\(1\\. deneme\\) · başlayan 1 · sessiz 0$`));
  expect(host.speechLog.filter((e) => e.state === 'silent')).toEqual([]);
  // The log written for the simulator run carries the speech events.
  const file = JSON.parse(written[SELF_TEST_LOG]);
  expect(file.mode).toBe('speech');
  expect(file.speech.some((e: { state: string }) => e.state === 'started')).toBe(true);
});
