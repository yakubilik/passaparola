import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { LETTERS } from '../game/letters';
import { SETTINGS_KEY } from '../store/settings';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { pressStart, untilClue } from '../test-utils/round';
import { host, listener } from '../voice/engine';
import { ECHO_TAIL_MS, LATE_MS, SETTLE_MS } from '../voice/listener';
import { CUE_LEAD_MS } from '../voice/sounds';

// #362: "I have to say 'pas' at least twice before it passes." A single "pas"
// passes the current letter, exactly once, on a recognizer that behaves like
// iOS 18+ in continuous mode: one growing result per utterance, a final-like
// result when the utterance ends, the next one starting afresh (with the
// library's leading space), and a short word said alone often held back
// until the utterance ends (no interim for it at all).
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);
jest.setTimeout(60_000);

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
function question(clue: string) {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q;
  throw new Error('no question with clue ' + clue);
}
const clueText = () => { const k = screen.getByTestId('clue').props.children; return Array.isArray(k) ? k.join('') : String(k); };
const passes = () => Number(/^(\d+) pas$/.exec(screen.getByLabelText(/^\d+ pas$/).props.accessibilityLabel)![1]);
const status = (letter: string) => screen.getByLabelText(new RegExp(`^${letter} harfi, `)).props.accessibilityLabel.replace(/^.* harfi, /, '');

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => {} }) as ReturnType<typeof AppState.addEventListener>);
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  host.cancel();
  listener.release();
  rec.reset();
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
}
async function untilHostQuiet() {
  for (let i = 0; i < 60 && host.speaking; i++) await wait(250);
  expect(host.speaking).toBe(false);
}
// One "pas": the letter passes, the count goes up by one, the next letter stays open.
function passedOnce(letter: string, before: number) {
  expect(status(letter)).toBe('pas');
  expect(passes()).toBe(before + 1);
  // The next letter is not passed with it (it shows 'sırada' once its clue is read, #359).
  expect(status(LETTERS[(LETTERS as readonly string[]).indexOf(letter) + 1])).toMatch(/^(bekliyor|sırada)$/);
}

test("'pas' alone after the reading, held back by iOS until the utterance ends: passes once", async () => {
  await startRound();
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 500);
  await act(() => rec.holdBack('pas'));
  await wait(800);
  expect(passes()).toBe(0);
  await act(() => rec.endUtterance());
  passedOnce('A', 0);
  // And with an interim for it, then its final: still once.
  await untilClue();
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 500);
  await act(() => rec.hear('pas'));
  passedOnce('B', 1);
  await wait(600);
  await act(() => rec.endUtterance());
  await wait(SETTLE_MS * 3);
  expect(passes()).toBe(2);
  expect(status('Ç')).toMatch(/^(bekliyor|sırada)$/);
});

test("'pas' right after the clue ends, in the same utterance as the host's last words: passes once", async () => {
  await startRound();
  const a = question(clueText());
  // The mic hears the end of the reading ("... A ile başlıyor") and the player right after it.
  await act(() => rec.hear('a ile başlıyor'));
  await untilHostQuiet();
  await wait(100);  // well inside ECHO_TAIL_MS
  await act(() => rec.hear('pas'));
  passedOnce('A', 0);
  await wait(500);
  await act(() => rec.endUtterance());
  await wait(SETTLE_MS * 3);
  expect(passes()).toBe(1);
  expect(a.letter).toBe('A');
});

test("'pas' during the clue, over the host's words the mic picks up: passes once", async () => {
  await startRound();
  expect(host.speaking).toBe(true);
  const a = question(clueText());
  const firstWords = a.clue.split(' ').slice(0, 3).join(' ');
  await act(() => rec.hear(firstWords));
  await wait(300);
  await act(() => rec.hear('pas'));
  passedOnce('A', 0);
  // Its final, with the host's words: nothing more.
  await act(() => rec.endUtterance());
  await wait(SETTLE_MS);
  expect(passes()).toBe(1);
  // B, while its clue is read: a "pas" iOS holds back until the utterance ends.
  await untilClue();
  expect(host.speaking).toBe(true);
  await act(() => rec.holdBack('pas'));
  await wait(500);
  await act(() => rec.endUtterance());
  passedOnce('B', 1);
});

test("'pas' after a previous verdict's tail: the next Pas, said after a pause, passes once", async () => {
  await startRound();
  // A passed; B's clue starts; "pas" again a second later, before iOS ended the
  // utterance (so in the same growing result, within LATE_MS of A's verdict).
  await act(() => rec.hear('pas'));
  passedOnce('A', 0);
  await wait(SETTLE_MS + 300);
  expect(SETTLE_MS + 300).toBeLessThan(LATE_MS);
  await act(() => rec.hear('pas'));
  passedOnce('B', 1);
  // Their final ("pas pas") passes nothing more.
  await wait(400);
  await act(() => rec.endUtterance());
  await wait(SETTLE_MS * 3);
  expect(passes()).toBe(2);
  expect(status('C')).toMatch(/^(bekliyor|sırada)$/);
});

test("'pas' after a right answer's tail: a held-back 'pas' that only comes in the answer's final passes once", async () => {
  await startRound();
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 200);
  const a = question(clueText());
  await act(() => rec.hear(a.answers[0]));
  expect(status('A')).toBe('doğru');
  await untilClue();
  await wait(800);
  // Said before iOS closed the answer's utterance, and given only in its final.
  await act(() => rec.holdBack('pas'));
  await wait(300);
  await act(() => rec.endUtterance());
  passedOnce('B', 0);
  await wait(SETTLE_MS * 3);
  expect(passes()).toBe(1);
});

test("'pas pas' in one breath is one Pas, and 'pas geçiyorum' too", async () => {
  await startRound();
  await act(() => rec.hear('pas'));
  await wait(200);
  await act(() => rec.hear('pas'));
  await wait(SETTLE_MS * 3);
  expect(passes()).toBe(1);
  await act(() => rec.endUtterance());
  await wait(SETTLE_MS + 500);
  await act(() => rec.hear('pas'));
  await wait(300);
  await act(() => rec.hear('geçiyorum'));
  await act(() => rec.endUtterance());
  await wait(SETTLE_MS * 3);
  expect(passes()).toBe(2);
  expect(status('C')).toMatch(/^(bekliyor|sırada)$/);
});

test("'pas' at the end of misheard host words (no echo cancellation): passes once", async () => {
  await startRound();
  expect(host.speaking).toBe(true);
  // Voice processing is off (ea5bc9c): the mic hears the reading, and iOS writes
  // some of it wrong, so the echo filter does not know those words.
  await act(() => rec.hear('zırhlı bulvar kıyısında'));
  await wait(300);
  await act(() => rec.hear('dördüncü pas'));
  await wait(SETTLE_MS * 2);
  passedOnce('A', 0);
});
