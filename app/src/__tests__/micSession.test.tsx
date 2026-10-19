import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { audio } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { RECOGNITION_OPTIONS } from '../voice/recognizer';

// The mic check from the menu: opening it touches nothing; the audio session
// is set up, once, when the player taps "Mikrofonu dene", before the mic opens.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(180_000);

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
});

test('the mic check sets the session up on the tap, not when its screen opens', async () => {
  await renderRouter('./src/app', { initialUrl: '/mic' });
  expect(await screen.findByText('Sesli cevap verelim')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(1000));
  expect(audio.sessionCalls).toEqual([]);
  expect(rec.categories).toEqual([]);

  await fireEvent.press(screen.getByText('Mikrofonu dene'));
  await act(async () => {});
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.events).toEqual(['category', 'start']);
  expect(rec.lastOptions).toMatchObject({ iosVoiceProcessingEnabled: true, iosCategory: RECOGNITION_OPTIONS.iosCategory });
  expect(audio.plays).toBe(0);
});
