import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { audio } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { host, SESSION_SETTLE_MS, sounds } from '../voice/engine';
import { RECOGNITION_OPTIONS } from '../voice/recognizer';
import { CUE_VOLUME, DEFAULT_GAIN, FADE_IN_MS, HOST_VOLUME } from '../voice/sounds';

// No volume blast when the app opens: the iOS audio session is left alone at
// launch and on every menu, and set up once, when a round opens, with the
// first sound fading in.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(60_000);

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const themePlayer = () => audio.players.find((p) => p.source === require('../../assets/sounds/theme.mp3'));

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
});

test('launch, menu, Ayarlar, categories and the level map: no sound and no audio session; the round sets it up once, fading in', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(screen.getByText('HARFİYEN')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('intro-start'));
  expect(await screen.findByText('Hızlı oyun')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Ayarlar'));
  expect(await screen.findByText('Müzik')).toBeOnTheScreen();
  await act(() => router.back());
  await fireEvent.press(await screen.findByText('Kategoriler'));
  await fireEvent.press(await screen.findByTestId('cat-tarih'));
  await fireEvent.press(screen.getByText('Bölümlere git'));
  expect(await screen.findByText('BÖLÜM HARİTASI')).toBeOnTheScreen();
  await wait(2000);

  // Nothing so far: setAudioModeAsync / setIsAudioActiveAsync / setCategoryIOS never called, nothing played.
  expect(audio.sessionCalls).toEqual([]);
  expect(rec.categories).toEqual([]);
  expect(audio.plays).toBe(0);
  expect(audio.players).toEqual([]);
  expect(host.said).toEqual([]);

  // The round opens: the session is set once, category and mode before it is made active.
  await fireEvent.press(screen.getByLabelText('Bölüm 1, açık'));
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.events.filter((e) => e === 'category')).toEqual(['category']);
  expect(rec.categories).toEqual([RECOGNITION_OPTIONS.iosCategory]);

  // The first sound (the theme) rises from silence over FADE_IN_MS.
  const theme = themePlayer()!;
  expect(theme.playing).toBe(true);
  expect(theme.volume).toBe(0);
  await wait(FADE_IN_MS / 2);
  expect(theme.volume).toBeGreaterThan(0);
  expect(theme.volume).toBeLessThan(CUE_VOLUME);
  await wait(FADE_IN_MS / 2);
  expect(theme.volume).toBeCloseTo(CUE_VOLUME * DEFAULT_GAIN);

  // Starting the round and the mic changes nothing more, and later sounds start at their level at once.
  await fireEvent.press(screen.getByText('Başla'));
  await wait(10);
  expect(rec.starts).toBe(1);  // the first question's request
  await wait(SESSION_SETTLE_MS + 10);
  await act(async () => {});
  await wait(FADE_IN_MS);
  expect(host.speaking).toBe(true);
  expect(host.volume).toBeCloseTo(HOST_VOLUME * DEFAULT_GAIN);
  await fireEvent.press(screen.getByLabelText('Pas'));
  const pas = (sounds as any).players.pas;
  expect(pas.playing).toBe(true);
  expect(pas.volume).toBeCloseTo(CUE_VOLUME * DEFAULT_GAIN);
  await wait(3000);
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.categories.length).toBe(1);
  expect(sounds.played).toContain('pas');
});

test('the session mode is not voiceChat: the loudspeaker is not driven to call loudness, echo cancellation stays on', () => {
  expect(RECOGNITION_OPTIONS.iosCategory).toEqual({
    category: 'playAndRecord',
    categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'],
    mode: 'default',
  });
  expect(RECOGNITION_OPTIONS.iosVoiceProcessingEnabled).toBe(false);
});
