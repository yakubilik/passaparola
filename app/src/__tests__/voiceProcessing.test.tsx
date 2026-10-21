import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { CATEGORIES } from '../data/questions';
import { SETTINGS_KEY } from '../store/settings';
import { audio, type FakeSession } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { pressStart, untilClue } from '../test-utils/round';
import { host, listener, sounds } from '../voice/engine';
import { ECHO_TAIL_MS, QUIET_POLL_MS } from '../voice/listener';
import { RECOGNITION_OPTIONS } from '../voice/recognizer';
import { startTrace, stopTrace, TRACE_LOG, traceEvents } from '../voice/trace';

// #438 (the echo-cancellation part, after #439): voice processing on for the
// whole life of the app's rounds, with the session in the mode voice
// processing uses set once before any sound. Three rounds back to back, many
// questions each, a server request renewed, route changes and an interruption:
// the recognizer is started once per round (plus what iOS forces), always
// with the same audio options, never while the game sounds; the session's
// category and mode are set once and never again.
// Fake recognizer and fake audio: this proves what the JS side asks for and
// when, not what iOS does with it. The native route-change policy is modelled
// by FakeRecognizer.routeChange; the Swift itself is only compiled on a real
// build (docs/speech.md, "Echo cancellation and a steady volume").
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [], cografya: [], bilim: [], sanat: [] }),
);
jest.mock('../voice/sessionInfo', () => ({
  readAudioSession: () => {
    const { audio: a } = require('../test-utils/fakeAudio');
    return { category: a.session.category, options: a.session.options, mode: a.session.mode, outputs: ['Speaker'], inputs: ['MicrophoneBuiltIn'], outputVolume: 0.5, sampleRate: 48000, otherAudioPlaying: false };
  },
}));
jest.setTimeout(600_000);

// The evidence file's native calls: build identity and writing to Documents.
const written: Record<string, string> = {};
const g = globalThis as any;
g.expo = g.expo ?? {};
g.expo.modules = {
  ...(g.expo.modules ?? {}),
  AudioSessionInfo: {
    selfTest: () => null,
    build: () => ({ version: '1.0.0', build: '2', bundle: 'com.skolalabs.harfiyen' }),
    writeDocument: (name: string, text: string) => { written[name] = text; return `/Documents/${name}`; },
  },
};

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const answerOf = (clue: string) => {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q.answers[0];
  throw new Error('no question with clue ' + clue);
};
const clueText = () => { const k = screen.getByTestId('clue').props.children; return Array.isArray(k) ? k.join('') : String(k); };
const sounding = () => host.speaking || sounds.cuePlaying;
const audioOptions = (o: any) => { const { contextualStrings, requiresOnDeviceRecognition, ...rest } = o; return rest; };

let found: (FakeSession & { sounding: boolean })[];

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  host.cancel();
  listener.release();
  listener.onDevice = true;
  rec.reset();
  found = [];
  const orig = rec.module.start;
  jest.spyOn(rec.module, 'start').mockImplementation((options: any) => {
    found.push({ ...audio.session, options: [...audio.session.options], sounding: sounding() });
    return orig(options);
  });
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  stopTrace();
  listener.onDevice = true;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function untilQuiet() {
  for (let i = 0; i < 200 && sounding(); i++) await wait(50);
  await wait(ECHO_TAIL_MS + 100);
}

// Answers `n` questions by voice, right and Pas in turn, each once its clue has been read.
async function answer(n: number) {
  for (let i = 0; i < n; i++) {
    await untilClue();
    await untilQuiet();
    const said = i % 2 ? 'pas' : answerOf(clueText());
    await act(async () => { rec.hear(said); });
    await wait(1500);
  }
}

async function finishRound() {
  for (let i = 0; i < 400 && !screen.queryByTestId('result-title'); i++) await wait(1000);
  expect(screen.getByTestId('result-title')).toBeOnTheScreen();
  await wait(8000);
  expect(listener.listening).toBe(false);
}

test('three rounds, many questions, route changes, an interruption: one session mode, voice processing on, no engine per question', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });

  // Round 1: six questions, then route changes and an interruption mid-round.
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  await pressStart();
  expect(rec.starts).toBe(1);
  await answer(6);
  expect(rec.starts).toBe(1);
  expect(rec.vp).toMatchObject({ running: true, enabled: true, engines: 1, rebuilds: 0 });

  // Voice processing's own mode switch, a category set again: same ports, the engine runs on.
  for (let i = 0; i < 3; i++) rec.routeChange(false);
  expect(rec.vp).toMatchObject({ engines: 1, rebuilds: 0, routeChanges: 3, routeChangesIgnored: 3 });
  // Headphones plugged in: a rebuilt engine, with voice processing.
  rec.routeChange(true, 1);
  expect(rec.vp).toMatchObject({ engines: 2, rebuilds: 1, enabled: true });
  expect(rec.starts).toBe(1);

  // A call or Siri interrupts the request: the mic opens again once the game is quiet, same options.
  await untilClue();
  await act(async () => { rec.interrupt(); });
  for (let i = 0; i < 100 && rec.starts < 2; i++) await wait(QUIET_POLL_MS);
  expect(rec.starts).toBe(2);
  await answer(2);
  await finishRound();

  // Rounds 2 and 3.
  for (const n of [3, 4]) {
    await fireEvent.press(screen.getByText('Tekrar oyna'));
    expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
    await act(async () => {});
    await pressStart();
    expect(rec.starts).toBe(n);
    await answer(4);
    expect(rec.starts).toBe(n);
    await finishRound();
  }

  // The session: set up once, before any sound, in voiceChat; every start found it so.
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.categories).toEqual([RECOGNITION_OPTIONS.iosCategory]);
  expect(rec.categoryAfterPlays).toEqual([0]);
  expect(found).toHaveLength(4);
  for (const s of found) expect(s).toMatchObject({ category: 'playAndRecord', mode: 'voiceChat', active: true, sounding: false });
  // Every start: voice processing on, the same audio options.
  for (const o of rec.startOptions) expect(o).toMatchObject({ iosVoiceProcessingEnabled: true, iosCategory: RECOGNITION_OPTIONS.iosCategory });
  const first = audioOptions(rec.startOptions[0]);
  for (const o of rec.startOptions) expect(audioOptions(o)).toEqual(first);
  // Aborted only to close the mic at the end of each round, never renewed.
  expect(rec.aborts).toBe(3);
  expect(listener.renewals).toBe(0);
});

test("on Apple's servers: requests renewed ahead of the limit keep the same options, never while the game sounds, no session call", async () => {
  listener.onDevice = false;
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  await pressStart();
  await answer(3);
  // Quiet: the round's clock runs on with nobody talking.
  for (let i = 0; i < 120 && listener.renewals < 2; i++) await wait(1000);
  expect(listener.renewals).toBeGreaterThanOrEqual(2);
  await answer(2);
  expect(rec.starts).toBe(1 + listener.renewals);
  for (const s of found) expect(s).toMatchObject({ mode: 'voiceChat', sounding: false });
  for (const o of rec.startOptions) expect(o).toMatchObject({ iosVoiceProcessingEnabled: true, requiresOnDeviceRecognition: false, iosCategory: RECOGNITION_OPTIONS.iosCategory });
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.categories).toHaveLength(1);
});

test('the voice evidence file: build and patch identity, raw results, decisions, verdicts, the game\'s own sound and the audio state', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  // As on the phone, once the app is up (renderRouter installs its own fake timers).
  startTrace('trace');
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  await pressStart();
  await untilClue();
  await untilQuiet();
  // A lone letter first, then the right answer.
  const said = answerOf(clueText());
  await act(async () => { rec.hear(said[0]); });
  await wait(300);
  await act(async () => { rec.endUtterance(); });
  await wait(500);
  await act(async () => { rec.hear(said); });
  await wait(2000);

  const ev = traceEvents();
  const kinds = new Set(ev.map((e) => e.e));
  for (const k of ['trace-start', 'request', 'host', 'host-done', 'clue-starts', 'result', 'incomplete', 'attempt', 'verdict', 'judged', 'cue', 'audio']) expect([k, kinds.has(k)]).toEqual([k, true]);
  expect(ev[0]).toMatchObject({ e: 'trace-start', schema: 'harfiyen-voicetrace/1', build: { version: '1.0.0', build: '2', bundle: 'com.skolalabs.harfiyen' }, nativePatch: 'harfiyen-438-route', recognition: { voiceProcessing: true, mode: 'voiceChat' } });
  expect(ev.find((e) => e.e === 'incomplete')).toMatchObject({ text: said[0].toLowerCase() });
  expect(ev.filter((e) => e.e === 'verdict')).toEqual([expect.objectContaining({ source: 'voice', verdict: 'correct' })]);
  // The latest sample, in the round (the first is from before the round set the session up).
  expect([...ev].reverse().find((e) => e.e === 'audio')).toMatchObject({ session: { mode: 'voiceChat' }, vp: { enabled: true, patch: 'harfiyen-438-route' }, micOpen: true });
  for (const e of ev) expect(typeof e.t === 'number' && typeof e.at === 'number').toBe(true);
  // Written to Documents once a second.
  await wait(1100);
  const file = JSON.parse(written[TRACE_LOG]);
  expect(file).toMatchObject({ schema: 'harfiyen-voicetrace/1', nativePatch: 'harfiyen-438-route' });
  expect(file.events.length).toBeGreaterThan(10);
});
