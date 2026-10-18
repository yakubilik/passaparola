import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { CATEGORIES } from '../data/questions';
import { PROGRESS_KEY } from '../store/progress';
import { SETTINGS_KEY } from '../store/settings';

// Tarih with two levels, so the map has exactly one level to unlock.
jest.mock('../data/questions', () => require('../test-utils/mockQuestions').mockQuestions({ tarih: [1, 2] }));

jest.setTimeout(180_000);

let saved = '';

function answerFor(clue: string): string {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q.answers[0];
  throw new Error('no question with clue ' + clue);
}

async function playRound(rightAnswers: number) {
  await fireEvent.press(await screen.findByText('Başla'));
  for (let i = 0; i < 28; i++) {
    const kids = screen.getByTestId('clue').props.children;
    const clue = Array.isArray(kids) ? kids.join('') : String(kids);
    const input = screen.getByTestId('answer');
    if (i < rightAnswers) {
      await fireEvent.changeText(input, answerFor(clue));
      await fireEvent(input, 'submitEditing');
    } else {
      await fireEvent.changeText(input, 'yanlış');
      await fireEvent(input, 'submitEditing');
      await fireEvent.press(screen.getByTestId('reveal'));
    }
  }
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
});

test('17 correct keeps level 2 locked', async () => {
  await renderRouter('./src/app', { initialUrl: '/levels?cats=tarih' });
  expect(await screen.findByLabelText('Bölüm 2, kilitli')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Bölüm 1, açık'));
  await playRound(17);
  expect(await screen.findByText('Az kaldı!')).toBeOnTheScreen();
  expect(screen.getByTestId('score')).toHaveTextContent('17');
  await fireEvent.press(screen.getByText('Bölüm haritası'));
  expect(await screen.findByLabelText('Bölüm 2, kilitli')).toBeOnTheScreen();
  expect(screen.getByText('Kolay · En iyi: 17 / 28')).toBeOnTheScreen();
});

test('a passing round unlocks level 2 on the map, and it stays unlocked after a restart', async () => {
  await renderRouter('./src/app', { initialUrl: '/levels?cats=tarih' });
  expect(await screen.findByLabelText('Bölüm 2, kilitli')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Bölüm 1, açık'));
  await playRound(18);
  expect(await screen.findByText('Bölüm 1 geçildi!')).toBeOnTheScreen();
  expect(screen.getByText('Bölüm 2 açıldı.')).toBeOnTheScreen();
  expect(screen.getByText('Sonraki bölüm')).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Bölüm haritası'));
  expect(await screen.findByLabelText('Bölüm 1, geçildi')).toBeOnTheScreen();
  expect(screen.getByLabelText('Bölüm 2, açık')).toBeEnabled();

  saved = (await AsyncStorage.getItem(PROGRESS_KEY))!;
  expect(JSON.parse(saved).unlocked).toEqual({ tarih: 2 });
});

test('after a restart the saved progress is read back: menu continues at level 2', async () => {
  // A fresh app over the storage the previous test left behind.
  await AsyncStorage.setItem(PROGRESS_KEY, saved);
  await renderRouter('./src/app', { initialUrl: '/menu' });
  expect(await screen.findByText('Bölüm 2')).toBeOnTheScreen();
  expect(screen.getByText('Tarih · Orta')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Devam et'));
  expect(await screen.findByLabelText('Bölüm 2, açık')).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Bölüm 2, açık'));
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
});
