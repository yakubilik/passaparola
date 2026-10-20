import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { CATEGORIES } from '../data/questions';
import { REVEAL_MS } from '../game/useRound';
import { PROGRESS_KEY } from '../store/progress';
import { SETTINGS_KEY } from '../store/settings';

// Pass and play driven through the screens: three people on one phone.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1, 2], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

function answerFor(clue: string): string {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q.answers[0];
  throw new Error('no question with clue ' + clue);
}

function clueText(): string {
  const kids = screen.getByTestId('clue').props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids);
}

async function type(text: string) {
  const input = screen.getByTestId('answer');
  await fireEvent.changeText(input, text);
  await fireEvent(input, 'submitEditing');
}

jest.setTimeout(600_000);  // room for a loaded machine (the full suite runs its files in parallel)

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  // The typed game (voice.test.tsx plays the spoken one).
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
});

// The clock counts wall time between its 200 ms ticks: jump it past the
// round's 3 minutes and let one tick see that.
async function timeUp() {
  await act(() => {
    jest.setSystemTime(Date.now() + 181_000);
    jest.advanceTimersByTime(250);
  });
}

// Every turn starts on the "Sıra" screen; the names seen there, in order.
const turns: string[] = [];
const clues: Record<string, string[]> = {};

// After a Pas or a wrong answer: the result card, which waits for its button.
async function resultCard(result: string, next: string) {
  expect(await screen.findByTestId('turn-result')).toHaveTextContent(result);
  expect(screen.queryByTestId('handover')).toBeNull();
  await act(() => jest.advanceTimersByTime(30_000));
  expect(screen.getByTestId('turn-result')).toHaveTextContent(result);
  await fireEvent.press(screen.getByText(`Sıradaki oyuncu: ${next}`));
}

async function startTurn(name: string, note?: string) {
  expect(await screen.findByTestId('handover')).toHaveTextContent(`Sıra: ${name}`);
  if (note) expect(screen.getByTestId('handover-note')).toHaveTextContent(note);
  // Nothing of the round is on screen while the phone changes hands.
  expect(screen.queryByTestId('clue')).toBeNull();
  turns.push(name);
  await fireEvent.press(screen.getByText('Başla'));
  expect(screen.getByTestId('turn-player')).toHaveTextContent(name.toLocaleUpperCase('tr-TR'));
  (clues[name] ??= []).push(clueText());
}

test('menu → setup → 3 players: right then Pas, wrong, time up; turn order and ranking', async () => {
  await renderRouter('./src/app', { initialUrl: '/menu' });
  await fireEvent.press(await screen.findByText('Çok oyunculu'));

  // Setup: two name fields to start with, up to four.
  expect(await screen.findByTestId('name-1')).toBeOnTheScreen();
  expect(screen.queryByTestId('name-2')).toBeNull();
  await fireEvent.press(screen.getByText('+ Oyuncu ekle'));
  await fireEvent.changeText(screen.getByTestId('name-0'), 'Ayşe');
  await fireEvent.changeText(screen.getByTestId('name-1'), 'Bora');
  await fireEvent.changeText(screen.getByTestId('name-2'), 'Cem');
  expect(screen.getByTestId('match-start')).toBeDisabled();
  expect(screen.getByTestId('mcat-cografya')).toBeDisabled();
  await fireEvent.press(screen.getByTestId('mcat-tarih'));
  // Every written level can be played, locked or not: no career needed.
  expect(screen.getByTestId('mlevel-2')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('mlevel-1'));
  await fireEvent.press(screen.getByTestId('match-start'));

  // Ayşe: A right, then Pas on B.
  await startTurn('Ayşe');
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');
  expect(screen.getByTestId('prompt')).toHaveTextContent('A İLE BAŞLIYOR');
  await type(answerFor(clueText()));
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(10_000));
  await fireEvent.press(screen.getByLabelText('Pas'));
  await resultCard('Pas', 'Bora');
  expect(screen.queryByTestId('turn-score')).toBeNull();

  // Bora: own ring and clock, wrong on A; the right answer shows, then the turn moves on.
  await startTurn('Bora', 'Ayşe: pas');
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  const boraA = answerFor(clueText());
  await type('bambaşka bir şey');
  expect(screen.getByText(boraA)).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(REVEAL_MS + 50));
  await resultCard(`Yanlış — doğru cevap: ${boraA}`, 'Cem');

  // Cem: runs out of time; no result card for that.
  await startTurn('Cem', 'Bora: yanlış cevap');
  await timeUp();

  // Ayşe again, where she left off: C, with A right and B passed on her ring, her clock as it was.
  await startTurn('Ayşe', 'Cem: süre doldu');
  expect(screen.getByTestId('clock')).toHaveTextContent(/^02:5[01]$/);
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('B harfi, pas')).toBeOnTheScreen();
  expect(screen.getByTestId('prompt')).toHaveTextContent('C İLE BAŞLIYOR');
  await type(answerFor(clueText()));
  const ayseD = answerFor(clueText());
  await type('bambaşka bir şey');
  await act(() => jest.advanceTimersByTime(REVEAL_MS + 50));
  expect(screen.getByTestId('turn-score')).toHaveProp('accessibilityLabel', 'Ayşe: 2 doğru, 1 yanlış, 1 pas');
  await resultCard(`Yanlış — doğru cevap: ${ayseD}`, 'Bora');

  // Cem is out of time, so Bora is next: B, with A wrong.
  await startTurn('Bora', 'Ayşe: yanlış cevap');
  expect(screen.getByLabelText('A harfi, yanlış')).toBeOnTheScreen();
  expect(screen.getByTestId('prompt')).toHaveTextContent('B İLE BAŞLIYOR');
  await fireEvent.press(screen.getByLabelText('Pas'));
  await resultCard('Pas', 'Ayşe');

  // Ayşe runs out of time; Bora is left alone and a Pas no longer hands the turn over.
  await startTurn('Ayşe', 'Bora: pas');
  await timeUp();
  await startTurn('Bora', 'Ayşe: süre doldu');
  expect(screen.getByTestId('prompt')).toHaveTextContent('C İLE BAŞLIYOR');
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(screen.queryByTestId('handover')).toBeNull();
  expect(screen.getByTestId('prompt')).toHaveTextContent('Ç İLE BAŞLIYOR');
  await timeUp();

  expect(turns).toEqual(['Ayşe', 'Bora', 'Cem', 'Ayşe', 'Bora', 'Ayşe', 'Bora']);

  // Every player had their own questions: no clue seen by two players.
  const seen = Object.values(clues).map((cs) => new Set(cs));
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
    expect([...seen[i]].filter((c) => seen[j].has(c))).toEqual([]);
  }

  // Ayşe 2 right 1 wrong; Cem 0 right 0 wrong; Bora 0 right 1 wrong.
  expect(await screen.findByTestId('match-title')).toHaveTextContent('Ayşe kazandı!');
  expect(screen.getByTestId('rank-1')).toHaveProp('accessibilityLabel', '1. Ayşe, 2 doğru, 1 yanlış');
  expect(screen.getByTestId('rank-2')).toHaveProp('accessibilityLabel', '2. Cem, 0 doğru, 0 yanlış');
  expect(screen.getByTestId('rank-3')).toHaveProp('accessibilityLabel', '3. Bora, 0 doğru, 1 yanlış');

  // A multiplayer game records no progress and unlocks nothing.
  expect(await AsyncStorage.getItem(PROGRESS_KEY)).toBeNull();
});

test('a tie on correct, wrong and time says so', async () => {
  await renderRouter('./src/app', { initialUrl: `/match?names=${encodeURIComponent(JSON.stringify(['Ece', 'Fırat']))}&cats=karisik&level=1&seed=5` });
  await startTurn('Ece');
  await timeUp();
  await startTurn('Fırat', 'Ece: süre doldu');
  await timeUp();
  expect(await screen.findByTestId('match-title')).toHaveTextContent('Berabere!');
  expect(screen.getByText('Ece ve Fırat eşit: aynı doğru, yanlış ve süre.')).toBeOnTheScreen();
  expect(screen.getByTestId('rank-1')).toHaveProp('accessibilityLabel', '1. Ece, 0 doğru, 0 yanlış');
  expect(screen.getByTestId('rank-2')).toHaveProp('accessibilityLabel', '1. Fırat, 0 doğru, 0 yanlış');
});

test('a level without enough questions for everyone shows "yakında"', async () => {
  await renderRouter('./src/app', { initialUrl: `/match?names=${encodeURIComponent(JSON.stringify(['Ece', 'Fırat']))}&cats=tarih&level=3` });
  expect(await screen.findByText('Bu bölüm yakında')).toBeOnTheScreen();
});
