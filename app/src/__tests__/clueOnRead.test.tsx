import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { CATEGORIES } from '../data/questions';
import { REVEAL_MS } from '../game/useRound';
import { SETTINGS_KEY } from '../store/settings';
import { audio, CLIP_MS, FakePlayer, speech } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { CLIPS } from '../voice/clips.generated';
import { host, listener, SESSION_SETTLE_MS, sounds } from '../voice/engine';
import { clueLine, host as hostLine } from '../voice/lines';
import { SETTLE_MS } from '../voice/listener';

// #359: the clue was on screen seconds before the host read it (the mic's
// settle and "İşte sağ cepten sorular çıkıyor efendim" came first). Now, with
// the voice on, the clue area waits in a neutral state and the clue text and
// the active letter appear in the same frame its clip starts (or the phone
// voice starts reading it). Typed (voice off), the clue is there at once.
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
const step = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

// Every host line that starts sounding, with what the screen showed at that
// very moment (before React has re-rendered for it).
type Start = { line: string; t: number; clue: boolean; waiting: boolean };
let starts: Start[];

beforeEach(async () => {
  jest.useFakeTimers();
  host.cancel();
  listener.release();
  rec.reset();
  host.said.length = 0;
  sounds.played.length = 0;
  audio.log.length = 0;
  starts = [];
  const play = FakePlayer.prototype.play;
  jest.spyOn(FakePlayer.prototype, 'play').mockImplementation(function (this: FakePlayer) {
    const at = host.said.length;
    play.call(this);
    // Host.playClip records the line right after play(); hostStarts() pairs the two up.
    try {
      pending.push({ at, t: Date.now(), clue: !!screen.queryByTestId('clue'), waiting: !!screen.queryByTestId('clue-waiting') });
    } catch { /* a line finishing after the test's screen went */ }
  });
  pending = [];
  await AsyncStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

let pending: { at: number; t: number; clue: boolean; waiting: boolean }[];
// The plays that were host lines, matched to the line host.said recorded for them.
function hostStarts(): Start[] {
  for (const p of pending.splice(0)) {
    const line = host.said[p.at];
    if (line !== undefined && host.said.length > p.at) starts.push({ line, t: p.t, clue: p.clue, waiting: p.waiting });
  }
  return starts;
}

async function startVoiceRound(rand = 0.99) {
  jest.spyOn(Math, 'random').mockReturnValue(rand);
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
}

// Steps the clock until a host line with this key starts; returns that start.
async function untilLine(key: string, maxMs = 15_000): Promise<Start> {
  for (let t = 0; t < maxMs; t += 10) {
    const s = hostStarts().find((x) => x.line === `clip:${key}`);
    if (s) return s;
    await step(10);
  }
  throw new Error(`the host never started ${key}; said ${host.said.join(', ')}`);
}

test('the first clue: a neutral clue area through the settle and the intro line, the clue in the same frame its clip starts; the settle measured', async () => {
  await startVoiceRound();
  const t0 = Date.now();
  await fireEvent.press(screen.getByText('Başla'));

  // From Başla on, until the clue clip starts: no clue, no letter, no active bubble; "Hazır olun…".
  let goStart: Start | undefined;
  for (let t = 0; t < 10_000; t += 10) {
    hostStarts();
    if (starts.some((s) => s.line !== 'clip:go')) break;
    goStart ??= starts.find((s) => s.line === 'clip:go');
    expect(screen.queryByTestId('clue')).toBeNull();
    expect(screen.queryByTestId('clue-letter')).toBeNull();
    expect(screen.getByTestId('clue-waiting')).toHaveTextContent(/Hazır olun…$/);
    expect(screen.queryByLabelText('A harfi, sırada')).toBeNull();
    expect(screen.getByLabelText('A harfi, bekliyor')).toBeOnTheScreen();
    expect(screen.getByTestId('clock')).toHaveTextContent('03:00');
    await step(10);
  }
  expect(goStart).toBeDefined();
  const clueStart = starts.find((s) => s.line !== 'clip:go')!;

  // The clue's clip started with the waiting state still on screen, and the
  // render that followed it (same act, no timer in between) shows the clue.
  expect(clueStart.clue).toBe(false);
  expect(clueStart.waiting).toBe(true);
  const a = question(clueText());
  expect(clueStart.line).toBe(`clip:${clueLine(a).key}`);
  expect(screen.queryByTestId('clue-waiting')).toBeNull();
  expect(screen.getByTestId('clue-letter')).toHaveTextContent('A');
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  expect(host.said).toEqual([`clip:${hostLine('go').key}`, `clip:${a.id}`]);

  // The settle (#355's order kept: the session, the mic up, SESSION_SETTLE_MS, then the host).
  const up = audio.log.find((l) => l.e === 'rec:up')!.t;
  const micUp = up - t0;
  const settle = goStart!.t - up;
  const firstLine = goStart!.t - t0;
  const clueAfter = clueStart.t - t0;
  expect(audio.log.findIndex((l) => l.e === 'active')).toBeLessThan(audio.log.findIndex((l) => l.e === 'rec:start'));
  expect(settle).toBe(SESSION_SETTLE_MS);
  // Nothing is waited for beyond the mic: Başla → host = the mic coming up + SESSION_SETTLE_MS,
  // and the clue follows the intro line at once (one clip, CLIP_MS on the fake player).
  expect(firstLine).toBe(micUp + SESSION_SETTLE_MS);
  expect(clueAfter).toBe(firstLine + CLIP_MS);
  // Recorded for the report: in the fake-audio run the mic is up at once (micUp 0 ms),
  // the first line 300 ms after Başla, the clue CLIP_MS after that.
  expect({ micUp, settle, firstLine, clueAfter }).toEqual({ micUp: 0, settle: 300, firstLine: 300, clueAfter: 300 + CLIP_MS });
});

test('every next question: the clue and the active letter switch when its reading starts (after "Doğru.", after a wrong answer); the clock runs only after the reading', async () => {
  await startVoiceRound(0.1);  // the host says "Doğru." before the next clue
  await fireEvent.press(screen.getByText('Başla'));
  await untilLine('go');
  const a = question(await stepUntilClue());
  await untilQuiet();

  // Right: A goes green, B is not shown until its clip starts, "Doğru." comes first.
  await act(() => rec.hear(a.answers[0]));
  await step(SETTLE_MS + 20);
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
  const seen = hostStarts().length;
  for (let t = 0; t < 10_000 && !clueStartAfter(seen); t += 10) {
    expect(screen.queryByTestId('clue')).toBeNull();
    expect(screen.getByTestId('clue-waiting')).toHaveTextContent(/Sıradaki soru geliyor…$/);
    expect(screen.queryByLabelText('B harfi, sırada')).toBeNull();
    await step(10);
    hostStarts();
  }
  expect(host.said).toContain(`clip:${hostLine('correct1').key}`);
  const bStart = clueStartAfter(seen)!;
  expect(bStart.clue).toBe(false);
  expect(bStart.waiting).toBe(true);
  expect(`clip:${question(clueText()).id}`).toBe(bStart.line);
  expect(screen.getByTestId('clue-letter')).toHaveTextContent('B');
  expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();

  // The clock stays while B is read and runs once the reading is over.
  const clock = String(screen.getByTestId('clock').props.children);
  await step(CLIP_MS - 100);
  expect(host.speaking).toBe(true);
  expect(screen.getByTestId('clock')).toHaveTextContent(clock);
  await untilQuiet();
  await step(2000);
  expect(screen.getByTestId('clock')).not.toHaveTextContent(clock);

  // Wrong: the reveal, then C appears when its clip starts, not when the reveal ends.
  await act(() => rec.hear('bambaşka'));
  await step(SETTLE_MS + 20);
  expect(screen.getByTestId('reveal')).toBeOnTheScreen();
  const seen2 = hostStarts().length;
  for (let t = 0; t < 20_000 && !clueStartAfter(seen2); t += 10) {
    expect(screen.queryByTestId('clue')).toBeNull();
    expect(screen.queryByLabelText('C harfi, sırada')).toBeNull();
    await step(10);
    hostStarts();
  }
  const cStart = clueStartAfter(seen2)!;
  expect(cStart.clue).toBe(false);
  expect(`clip:${question(clueText()).id}`).toBe(cStart.line);
  expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();
  expect(sounds.played).toEqual(expect.arrayContaining(['correct', 'wrong']));
});

test('no clip for the clue: it appears when the phone voice starts reading it', async () => {
  await startVoiceRound();
  // Every tarih clue without its recording, so the host reads them with expo-speech.
  const removed: [string, number][] = [];
  for (const k of Object.keys(CLIPS)) if (/^tarih-1-[^-]+-\d+$/.test(k)) { removed.push([k, CLIPS[k]]); delete CLIPS[k]; }
  try {
    const spoke = jest.fn();
    const before = speech.spoken.length;
    await fireEvent.press(screen.getByText('Başla'));
    for (let t = 0; t < 10_000 && speech.spoken.length === before; t += 10) {
      expect(screen.queryByTestId('clue')).toBeNull();
      await step(10);
      if (speech.spoken.length > before) spoke();
    }
    expect(spoke).toHaveBeenCalled();
    // The speech started in this step and the screen followed it in the same render.
    const a = question(clueText());
    expect(speech.spoken.at(-1)!.text).toBe(clueLine(a).text);
    expect(host.said.at(-1)).toBe(`tts:${clueLine(a).text}`);
    expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  } finally {
    for (const [k, v] of removed) CLIPS[k] = v;
  }
});

test('typed (voice off): the clue is there as soon as the round starts and the next one at once after an answer', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  // Even under the "Hazır mısın?" card the clue is drawn, as before.
  expect(screen.getByTestId('clue')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Başla'));
  expect(screen.queryByTestId('clue-waiting')).toBeNull();
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  const a = question(clueText());
  await fireEvent.changeText(screen.getByTestId('answer'), a.answers[0]);
  await fireEvent(screen.getByTestId('answer'), 'submitEditing');
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
  expect(question(clueText()).letter).toBe('B');
  expect(host.said).toEqual([]);
});

// The first clue clip (not a host line, not a "... olacaktı.") started after the first `from` starts.
function clueStartAfter(from: number): Start | undefined {
  return hostStarts().slice(from).find((x) => /^clip:(tarih|spor)-1-[^-]+-\d+$/.test(x.line));
}

async function stepUntilClue(): Promise<string> {
  for (let t = 0; t < 10_000 && !screen.queryByTestId('clue'); t += 10) await step(10);
  return clueText();
}
async function untilQuiet() {
  for (let i = 0; i < 400 && host.speaking; i++) await step(50);
  expect(host.speaking).toBe(false);
}
