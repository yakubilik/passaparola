import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { visionCamera } from '../test-utils/visionCamera';

jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(30_000);

beforeEach(async () => {
  jest.useFakeTimers();
  visionCamera.reset();
  await AsyncStorage.clear();
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
  expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toEqual({ camera: false });
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
