import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { CATEGORIES } from '../data/questions';
import { REVEAL_MS } from '../game/useRound';
import { SETTINGS_KEY } from '../store/settings';
import { audio, mockAudio, speech } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { pressStart } from '../test-utils/round';
import { host, listener, sounds } from '../voice/engine';
import { ECHO_TAIL_MS, QUIET_POLL_MS, SETTLE_MS } from '../voice/listener';
import { CUE_VOLUME, DEFAULT_GAIN } from '../voice/sounds';

// #357: every start (and stop) of expo-speech-recognition tears down and
// rebuilds its audio engine with voice processing and sets the session
// category again. Done at every new question (#351), right while the answer's
// cue played, it raised the level question after question and swallowed the
// cues. Here, ten questions with the fake recognizer and fake audio: one cue
// per verdict, and nothing touches the recognizer or the session while a cue
// or a host clip sounds.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(600_000);  // room for a loaded machine (the full suite runs its files in parallel)

function question(clue: string) {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q;
  throw new Error('no question with clue ' + clue);
}
function clueText(): string {
  const kids = screen.getByTestId('clue').props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids);
}

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
async function untilHostQuiet() {
  for (let i = 0; i < 40 && host.speaking; i++) await wait(250);
  expect(host.speaking).toBe(false);
}

// Something the player hears: a cue, the theme or a host clip (the looping
// bed does not count), or the host's synthesized speech.
const sounding = () => audio.players.some((p) => p.playing && !p.loop) || !!speech.current;

// Every call into the recognizer and the iOS audio session, and those made while something sounded.
let calls: { name: string; t: number }[];
let whileSounding: string[];
function guard(name: string, obj: any, key: string) {
  const orig = obj[key];
  jest.spyOn(obj, key).mockImplementation((...args: unknown[]) => {
    calls.push({ name, t: Date.now() });
    if (sounding()) whileSounding.push(`${name} at ${Date.now()}`);
    return orig(...args);
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0.99);  // no "Doğru." before the next clue
  host.cancel();
  listener.release();  // a mic still closing after the last test's screen went
  rec.reset();
  listener.renewals = 0;
  sounds.played.length = 0;
  sounds.started.length = 0;
  host.said.length = 0;
  calls = [];
  whileSounding = [];
  guard('rec.start', rec.module, 'start');
  guard('rec.stop', rec.module, 'stop');
  guard('rec.abort', rec.module, 'abort');
  guard('category', rec.module, 'setCategoryIOS');
  guard('mode', mockAudio, 'setAudioModeAsync');
  guard('active', mockAudio, 'setIsAudioActiveAsync');
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function startRound() {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  await pressStart();
  expect(rec.starts).toBe(1);
  expect(host.speaking).toBe(true);  // the first clue
}

const VERDICTS = ['correct', 'wrong', 'pas'] as const;
const CUES = new Set(['correct', 'wrong', 'pas']);

test('ten questions: every verdict plays exactly one cue, at full level and from its start; the recognizer and the session are never touched after the round started', async () => {
  await startRound();
  const atStart = calls.length;
  expect(calls.map((c) => c.name)).toEqual(['mode', 'category', 'active', 'rec.start']);

  for (let i = 0; i < 10; i++) {
    const verdict = VERDICTS[i % 3];
    await untilHostQuiet();
    await wait(ECHO_TAIL_MS + 100);
    const q = question(clueText());
    const played = sounds.played.length;
    const started = sounds.started.length;
    await act(() => rec.hear(verdict === 'correct' ? q.answers[0] : verdict === 'pas' ? 'pas' : 'bambaşka'));
    await wait(SETTLE_MS + 20);
    // The cue is sounding now, the recognizer left alone.
    const cuePlayer = (sounds as any).players[verdict];
    expect(cuePlayer.playing).toBe(true);
    await wait(verdict === 'wrong' ? REVEAL_MS + 3000 : 1500);
    expect(sounds.played.slice(played).filter((c) => CUES.has(c))).toEqual([verdict]);
    expect(sounds.started.slice(started).filter((s) => CUES.has(s.cue))).toEqual([{ cue: verdict, volume: CUE_VOLUME * DEFAULT_GAIN, fromStart: true }]);
  }
  expect(screen.getByLabelText('4 doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('3 yanlış')).toBeOnTheScreen();
  expect(screen.getByLabelText('3 pas')).toBeOnTheScreen();

  // One request for the whole round: no start, stop, category, mode or
  // activation (each a voice-processing / output-level change) since the start.
  expect(calls.slice(atStart)).toEqual([]);
  expect(rec.starts).toBe(1);
  expect(rec.aborts).toBe(0);
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.categories.length).toBe(1);
  expect(whileSounding).toEqual([]);

  // Time up: the warnings, the host's last lines, and only after them the mic closes.
  const left = () => { const [m, sec] = String(screen.getByTestId('clock').props.children).split(':'); return Number(m) * 60 + Number(sec); };
  while (left() > 20) await wait(10_000);
  for (let i = 0; i < 30 && !screen.queryByText('Az kaldı!'); i++) await wait(1000);
  expect(await screen.findByText('Az kaldı!')).toBeOnTheScreen();
  await untilHostQuiet();
  await wait(QUIET_POLL_MS * 3);
  expect(rec.aborts).toBe(1);
  expect(calls.slice(atStart).map((c) => c.name)).toEqual(['rec.abort']);
  expect(whileSounding).toEqual([]);
});

test("iOS ends the request on its own while a cue plays: the new one starts only after the cue and the host's next clue", async () => {
  await startRound();
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 100);
  await wait(3000);  // well past the opening, so this 'end' is the request's own
  const q = question(clueText());
  await act(() => rec.hear(q.answers[0]));
  expect((sounds as any).players.correct.playing).toBe(true);
  // The request ends (the server's minute, an interruption) right then.
  await act(async () => { rec.running = false; rec.emit('end'); });
  await wait(400);
  expect(host.speaking).toBe(true);  // the next clue, after the cue
  expect(rec.starts).toBe(1);
  await untilHostQuiet();
  await wait(QUIET_POLL_MS * 3);
  expect(rec.starts).toBe(2);
  expect(whileSounding).toEqual([]);
  // The new request expects the round's answers as the first did, and the next answer is heard.
  expect(rec.startOptions[1].contextualStrings).toEqual(rec.startOptions[0].contextualStrings);
  await wait(ECHO_TAIL_MS + 100);
  const next = question(clueText());
  await act(() => rec.hear(next.answers[0]));
  await wait(1500);
  expect(screen.getByLabelText('2 doğru')).toBeOnTheScreen();
});
