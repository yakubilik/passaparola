import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Keyboard } from 'react-native';

import { SETTINGS_KEY } from '../store/settings';

// Once the keyboard is up in a round, a tap anywhere off the answer field puts it away.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(120_000);

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('game: tapping the ring, the clue or the empty space closes the keyboard; the buttons still work in one tap', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1' });
  await fireEvent.press(await screen.findByText('Başla'));
  await fireEvent(screen.getByTestId('answer'), 'focus');
  dismiss.mockClear();

  await fireEvent.press(screen.getByTestId('ring-area'));
  expect(dismiss).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('clue'));
  expect(dismiss).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByTestId('clock'));
  expect(dismiss).toHaveBeenCalledTimes(3);

  // Pas is its own button: it passes the letter without going through the background.
  dismiss.mockClear();
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(screen.getByLabelText('A harfi, pas')).toBeOnTheScreen();
  expect(dismiss).not.toHaveBeenCalled();
});

test('Çok oyunculu: tapping off the name fields closes the keyboard; the choices still work', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await renderRouter('./src/app', { initialUrl: '/multi' });
  await fireEvent(await screen.findByTestId('name-0'), 'focus');
  await fireEvent.changeText(screen.getByTestId('name-0'), 'Ayşe');
  dismiss.mockClear();
  await fireEvent.press(screen.getByText('Çok oyunculu'));
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('name-0').props.value).toBe('Ayşe');
});
