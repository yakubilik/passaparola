import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { CATEGORIES } from '../data/questions';
import { REVEAL_MS } from '../game/useRound';
import { SETTINGS_KEY } from '../store/settings';
import { C } from '../ui/theme';

// Drives the app the way a player does, from the intro to the round end,
// with the real question files cut down to a fixed shape: tarih and spor
// have level 1 only, the other three categories nothing yet.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
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

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await fireEvent.press(el);
}

jest.setTimeout(180_000);

// These walk the typed game: voice off (voice.test.tsx plays the spoken one).
beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
});

test('intro → menu → category → level map → game: right, wrong and Pas; finishing shows the round end', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });

  // 1d intro
  expect(screen.getByText('HARFİYEN')).toBeOnTheScreen();
  await press(screen.getByText('Misafir olarak oyna'));

  // 1e main menu
  expect(await screen.findByText('Hızlı oyun')).toBeOnTheScreen();
  await press(screen.getByText('Kategoriler'));

  // 1f category choice: empty categories are "yakında" and can not be picked
  expect(await screen.findByText('Kategori seç')).toBeOnTheScreen();
  expect(screen.getByTestId('cat-cografya')).toBeDisabled();
  expect(screen.getAllByText('Yakında')).toHaveLength(3);
  expect(screen.getByText('Bölümlere git')).toBeOnTheScreen();
  await press(screen.getByTestId('cat-tarih'));
  expect(screen.getByTestId('cat-tarih')).toBeChecked();
  expect(screen.getByText('1 kategori seçildi')).toBeOnTheScreen();
  await press(screen.getByText('Bölümlere git'));

  // Level map: level 1 open, level 2 has no questions yet
  expect(await screen.findByText('BÖLÜM HARİTASI')).toBeOnTheScreen();
  expect(screen.getByLabelText('Bölüm 1, açık')).toBeOnTheScreen();
  expect(screen.getByLabelText('Bölüm 2, yakında')).toBeDisabled();
  await press(screen.getByLabelText('Bölüm 1, açık'));

  // Game
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await press(screen.getByText('Başla'));
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');
  expect(screen.getByLabelText('A harfi, sırada')).toHaveStyle({ backgroundColor: '#ffffff' });
  expect(screen.getByTestId('prompt')).toHaveTextContent('A HARFİYLE BAŞLIYOR');

  // right: A turns green, B is next
  await type(answerFor(clueText()).toLocaleLowerCase('tr-TR'));
  expect(screen.getByLabelText('A harfi, doğru')).toHaveStyle({ backgroundColor: C.green });
  expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
  expect(screen.getByTestId('prompt')).toHaveTextContent('B HARFİYLE BAŞLIYOR');

  // wrong: B turns red, the right answer is shown, then C is next
  const bAnswer = answerFor(clueText());
  await type('bambaşka bir şey');
  expect(screen.getByLabelText('B harfi, yanlış')).toHaveStyle({ backgroundColor: C.red });
  expect(screen.getByText(bAnswer)).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(REVEAL_MS + 50));
  expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();

  // Pas: C turns yellow, Ç is next
  await press(screen.getByLabelText('Pas'));
  expect(screen.getByLabelText('C harfi, pas')).toHaveStyle({ backgroundColor: C.yellow });
  expect(screen.getByLabelText('Ç harfi, sırada')).toBeOnTheScreen();
  expect(screen.getByLabelText('1 doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('1 pas')).toBeOnTheScreen();
  expect(screen.getByLabelText('1 yanlış')).toBeOnTheScreen();

  // The rest right: the passed C comes back after Z
  for (let i = 0; i < 25; i++) await type(answerFor(clueText()));
  expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();
  await type(answerFor(clueText()));

  // Round end
  expect(await screen.findByText('Bölüm 1 geçildi!')).toBeOnTheScreen();
  expect(screen.getByTestId('score')).toHaveTextContent('27');
  expect(screen.getByText('Bölüm 2 açıldı, soruları yakında.')).toBeOnTheScreen();
  expect(screen.getByText(bAnswer)).toBeOnTheScreen();
});

test('time up ends the round with the letters left empty', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1' });
  await press(await screen.findByText('Başla'));
  await type(answerFor(clueText()));
  await act(() => jest.advanceTimersByTime(181_000));
  expect(await screen.findByText('Az kaldı!')).toBeOnTheScreen();
  expect(screen.getByTestId('score')).toHaveTextContent('1');
  expect(screen.getByText('boş')).toBeOnTheScreen();
  expect(screen.getByText('Sonraki bölüm için en az 18 doğru gerekiyor.')).toBeOnTheScreen();
});

test('a level without questions shows "yakında" instead of crashing', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=2' });
  expect(await screen.findByText('Bu bölüm yakında')).toBeOnTheScreen();
});

test('a category without questions shows "yakında" on its map', async () => {
  await renderRouter('./src/app', { initialUrl: '/levels?cats=cografya' });
  expect(await screen.findByLabelText('Bölüm 1, yakında')).toBeDisabled();
});

test('karışık: every category with questions, each letter from one of them', async () => {
  await renderRouter('./src/app', { initialUrl: '/category' });
  await press(await screen.findByTestId('cat-tarih'));
  await press(screen.getByTestId('cat-karisik'));
  expect(screen.getByTestId('cat-karisik')).toBeChecked();
  // Karışık replaces a hand-picked choice and checks every playable category.
  expect(screen.getByTestId('cat-tarih')).toBeChecked();
  expect(screen.getByTestId('cat-spor')).toBeChecked();
  expect(screen.getByTestId('cat-cografya')).not.toBeChecked();
  await press(screen.getByText('Bölümlere git'));
  expect(await screen.findByText('Karışık')).toBeOnTheScreen();
  await press(screen.getByLabelText('Bölüm 1, açık'));
  await press(await screen.findByText('Başla'));
  expect(screen.getByTestId('prompt')).toHaveTextContent('A HARFİYLE BAŞLIYOR');
  await type(answerFor(clueText()));
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
});
