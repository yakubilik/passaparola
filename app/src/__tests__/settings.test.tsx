import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { visionCamera } from '../test-utils/visionCamera';
import { sounds } from '../voice/engine';
import { BG_VOLUME, DUCK, musicVolume } from '../voice/sounds';

jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(180_000);

beforeEach(async () => {
  jest.useFakeTimers();
  visionCamera.reset();
  await AsyncStorage.clear();
  // Past the mic check that comes before the first voice game.
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
});

async function quickGame() {
  await fireEvent.press(screen.getByText('Hızlı oyun'));
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
}

test('with the camera on, the game shows the front camera in the ring', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'authorized';
  await renderRouter('./src/app', { initialUrl: '/menu' });
  expect(await screen.findByText('Hızlı oyun')).toBeOnTheScreen();
  await quickGame();
  expect(screen.getByTestId('camera-preview')).toBeOnTheScreen();
});

test('menu → Ayarlar: the camera is switched off, remembered, and the game shows the placeholder', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'authorized';
  await renderRouter('./src/app', { initialUrl: '/menu' });
  await fireEvent.press(await screen.findByText('Ayarlar'));

  const toggle = await screen.findByTestId('setting-camera');
  expect(toggle.props.value).toBe(true);
  await fireEvent(toggle, 'valueChange', false);
  await act(async () => {});
  expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toMatchObject({ camera: false });
  expect(screen.getByTestId('setting-camera').props.value).toBe(false);

  await fireEvent.press(screen.getByText('‹ Geri'));
  await quickGame();
  expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();
  expect(screen.queryByTestId('camera-preview')).toBeNull();
  // The round goes on as usual.
  await fireEvent.press(screen.getByText('Başla'));
  expect(screen.getByTestId('clue')).toBeOnTheScreen();
});

test('no permission: the settings say so', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'denied';
  await renderRouter('./src/app', { initialUrl: '/settings' });
  expect(await screen.findByText(/Kamera izni kapalı/)).toBeOnTheScreen();
});

test('Ayarlar: the voice game is on by default and can be switched off', async () => {
  await renderRouter('./src/app', { initialUrl: '/settings' });
  const toggle = await screen.findByTestId('setting-voice');
  expect(toggle.props.value).toBe(true);
  await fireEvent(toggle, 'valueChange', false);
  await act(async () => {});
  expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toMatchObject({ voice: false });
  expect(screen.getByText('Mikrofonu dene ›')).toBeOnTheScreen();
});

test('Ayarlar: Müzik is on at a quarter of the old volume; quieter, then off, both remembered and heard in the game', async () => {
  await renderRouter('./src/app', { initialUrl: '/menu' });
  await fireEvent.press(await screen.findByText('Ayarlar'));
  const toggle = await screen.findByTestId('setting-music');
  expect(toggle.props.value).toBe(true);
  expect(screen.getByTestId('music-level').props.accessibilityLabel).toBe('Müzik sesi 5 / 10');
  expect(BG_VOLUME).toBeCloseTo(0.17 / 4, 2);

  // Two steps quieter: saved, and the bed follows.
  await fireEvent.press(screen.getByTestId('music-down'));
  await fireEvent.press(screen.getByTestId('music-down'));
  await act(async () => {});
  expect(screen.getByTestId('music-level').props.accessibilityLabel).toBe('Müzik sesi 3 / 10');
  expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toMatchObject({ music: true, musicLevel: 3 });

  await fireEvent.press(screen.getByText('‹ Geri'));
  await quickGame();
  await fireEvent.press(screen.getByText('Başla'));
  expect(sounds.bgPlaying).toBe(true);
  // The host is reading the first clue: the bed is at level 3, ducked under it.
  expect(sounds.bgVolume).toBeCloseTo(musicVolume(3) * DUCK, 5);
});

test('Ayarlar: with Müzik off the round has no bed, and that is remembered', async () => {
  await renderRouter('./src/app', { initialUrl: '/settings' });
  await fireEvent(await screen.findByTestId('setting-music'), 'valueChange', false);
  await act(async () => {});
  expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toMatchObject({ music: false });
  expect(screen.getByTestId('music-up').props.accessibilityState).toMatchObject({ disabled: true });

  await renderRouter('./src/app', { initialUrl: '/menu' });
  await quickGame();
  await fireEvent.press(screen.getByText('Başla'));
  expect(sounds.bgPlaying).toBe(false);
  expect(sounds.bgVolume).toBe(0);
  expect(screen.getByTestId('clue')).toBeOnTheScreen();
});
