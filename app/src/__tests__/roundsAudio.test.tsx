import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { audio, type FakeSession } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { pressStart } from '../test-utils/round';
import { host, listener, sounds } from '../voice/engine';
import { RECOGNITION_OPTIONS } from '../voice/recognizer';
import { roundAudio, roundLine } from '../voice/roundAudio';

// #361: the sound was right in the first round and broke again from the
// second on. Round 1 -> result screen -> round 2 -> result -> round 3 on the
// fake audio and recognizer: every round finds the same session (category,
// mode, options, active) and starts the recognizer with the same options,
// voice processing on and its ducking switched off, and nothing makes the
// session inactive between or during the rounds.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);
// The session as the fakes leave it, read the way the diagnostic reads the real one.
jest.mock('../voice/sessionInfo', () => ({
  readAudioSession: () => {
    const { audio: a } = require('../test-utils/fakeAudio');
    return { category: a.session.category, options: a.session.options, mode: a.session.mode, outputs: ['Speaker'], inputs: ['MicrophoneBuiltIn'], outputVolume: 0.5, sampleRate: 48000, otherAudioPlaying: false };
  },
}));

jest.setTimeout(300_000);

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

// The session each recognizer start found, before the start set it.
let found: FakeSession[];

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  host.cancel();
  listener.release();
  rec.reset();
  found = [];
  const orig = rec.module.start;
  jest.spyOn(rec.module, 'start').mockImplementation((options: any) => {
    found.push({ ...audio.session, options: [...audio.session.options] });
    return orig(options);
  });
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// A round: Başla, one Pas by voice (a cue), then the clock runs out.
async function playRound(n: number) {
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  await pressStart();
  expect(rec.starts).toBe(n);  // one request per round
  for (let i = 0; i < 20 && host.speaking; i++) await wait(250);
  await act(async () => { rec.hear('pas'); });
  await wait(1500);
  for (let i = 0; i < 400 && !screen.queryByTestId('result-title'); i++) await wait(1000);
  expect(screen.getByTestId('result-title')).toBeOnTheScreen();
  // The host's last line ends on the result screen, and the mic closes after it.
  await wait(8000);
  expect(listener.listening).toBe(false);
  expect(rec.vp.running).toBe(false);
}

test('round 1 -> result -> round 2 -> result -> round 3: the same session and recognizer options at every round start, and the session never deactivated', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await playRound(1);
  expect(screen.getByTestId('diag-tur-1')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Tekrar oyna'));
  await playRound(2);
  expect(screen.getByTestId('diag-tur-2')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Tekrar oyna'));
  await playRound(3);
  expect(screen.getByTestId('diag-tur-3')).toBeOnTheScreen();

  // Every round found the session as the first one set it up: in the
  // recognizer's category and mode, and active.
  const first: FakeSession = { category: 'playAndRecord', mode: 'default', options: ['allowBluetooth', 'defaultToSpeaker', 'mixWithOthers'], active: true };
  expect(found).toEqual([first, first, first]);

  // The recognizer was started with the first round's options every round
  // (only the words to expect are the round's own), voice processing on.
  expect(rec.startOptions).toHaveLength(3);
  const audioOptions = (o: any) => { const { contextualStrings, ...rest } = o; return rest; };
  const [o1, o2, o3] = rec.startOptions.map(audioOptions);
  expect(o2).toEqual(o1);
  expect(o3).toEqual(o1);
  expect(o1).toMatchObject({ ...RECOGNITION_OPTIONS, iosVoiceProcessingEnabled: true, iosCategory: RECOGNITION_OPTIONS.iosCategory });

  // Nothing made the session inactive: not the app (setIsAudioActiveAsync(false)),
  // not expo-audio letting players go; and it was set up once, in round 1.
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(audio.log.filter((e) => e.e === 'deactivated' || e.e === 'inactive')).toEqual([]);
  expect(audio.session.active).toBe(true);
  expect(audio.keepers.size).toBeGreaterThan(0);
  expect(rec.categories).toHaveLength(1);

  // At each round start (its mic up and settled): voice processing on in the
  // engine, the patched ducking configuration on it (no advanced ducking, min).
  const rounds = roundAudio();
  expect(rounds.map((r) => r.round)).toEqual([1, 2, 3]);
  for (const r of rounds) {
    expect(r.session).toMatchObject({ category: 'playAndRecord', mode: 'default', options: first.options, outputVolume: 0.5 });
    expect(r.vp).toMatchObject({ running: true, enabled: true, advancedDucking: false, duckingLevel: 'min', rebuilds: 0 });
    expect(r.asked).toEqual({ voiceProcessing: true, category: RECOGNITION_OPTIONS.iosCategory });
  }
  // One line per round in SES OTURUMU, identical for the three rounds.
  const lines = rounds.map(roundLine);
  expect(lines[0]).toBe('playAndRecord (allowBluetooth, defaultToSpeaker, mixWithOthers), mod default, telefon sesi %50; yankı önleme açık, kısma min');
  expect(lines).toEqual([lines[0], lines[0], lines[0]]);
  expect(screen.getByTestId('diag-tur-3')).toHaveTextContent(`Tur 3: ${lines[0]}`);
});
