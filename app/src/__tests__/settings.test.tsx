import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { visionCamera } from '../test-utils/visionCamera';
import { pressStart } from '../test-utils/round';
import { host, sounds } from '../voice/engine';
import { CUE_VOLUME, FADE_IN_MS, HOST_VOLUME, masterGain } from '../voice/sounds';

jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(600_000);  // room for a loaded machine (the full suite runs its files in parallel)

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
  await pressStart();
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

test('Ayarlar has no Müzik; settings saved with the old music keys still load, and the game plays no theme and no bed', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ micChecked: true, music: true, musicLevel: 3, volume: 40 }));
  await renderRouter('./src/app', { initialUrl: '/menu' });
  await fireEvent.press(await screen.findByText('Ayarlar'));
  expect(await screen.findByTestId('setting-volume')).toBeOnTheScreen();
  expect(screen.getByTestId('volume-value')).toHaveTextContent('%40');
  expect(screen.queryByTestId('setting-music')).toBeNull();
  expect(screen.queryByText('Müzik')).toBeNull();

  await fireEvent.press(screen.getByText('‹ Geri'));
  await quickGame();
  await act(async () => { jest.advanceTimersByTime(3000); });
  await pressStart();
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.getByTestId('clue')).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(sounds.played).toContain('pas');
  expect(sounds.played).not.toContain('theme');
  expect(sounds.played).not.toContain('bg');
  expect(sounds.bgPlaying).toBe(false);
});

test('Ayarlar: Ses is at 70% unless changed; the slider sets it, it is remembered, and the host and the cues follow', async () => {
  await renderRouter('./src/app', { initialUrl: '/menu' });
  await fireEvent.press(await screen.findByText('Ayarlar'));
  const slider = await screen.findByTestId('setting-volume');
  expect(slider.props.accessibilityValue).toMatchObject({ now: 70 });
  expect(screen.getByTestId('volume-value')).toHaveTextContent('%70');
  expect(masterGain()).toBeCloseTo(0.7);

  // Dragged to 40% of the track, then one step down by VoiceOver.
  await fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 300, height: 32, x: 0, y: 0 } } });
  await fireEvent(screen.getByTestId('setting-volume'), 'responderGrant', { nativeEvent: { locationX: 120 } });
  await act(async () => {});
  expect(screen.getByTestId('volume-value')).toHaveTextContent('%40');
  await fireEvent(screen.getByTestId('setting-volume'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  await act(async () => {});
  expect(screen.getByTestId('volume-value')).toHaveTextContent('%30');
  expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toMatchObject({ volume: 30 });
  expect(masterGain()).toBeCloseTo(0.3);

  // In the game: the host's line and a cue, both at 30% of their level.
  await fireEvent.press(screen.getByText('‹ Geri'));
  await quickGame();
  await pressStart();
  await act(async () => { jest.advanceTimersByTime(FADE_IN_MS); });
  expect(host.speaking).toBe(true);
  expect(host.volume).toBeCloseTo(HOST_VOLUME * 0.3);
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(sounds.started.at(-1)).toMatchObject({ cue: 'pas' });
  expect(sounds.started.at(-1)!.volume).toBeCloseTo(CUE_VOLUME * 0.3);

  // And after a restart.
  await renderRouter('./src/app', { initialUrl: '/settings' });
  expect((await screen.findByTestId('setting-volume')).props.accessibilityValue).toMatchObject({ now: 30 });
});
