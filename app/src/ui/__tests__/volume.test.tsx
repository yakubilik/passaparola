import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { DEFAULT_SETTINGS, DEFAULT_VOLUME, loadSettings, SETTINGS_KEY } from '../../store/settings';
import { AudioDiagnostic } from '../AudioDiagnostic';
import { Slider } from '../Slider';

// Room for a loaded machine: the full suite runs its files in parallel.
jest.setTimeout(60_000);

// The Ses slider of Ayarlar and the audio session diagnostic of the mic check.
beforeEach(() => AsyncStorage.clear());

test('Ses is 70% unless changed, kept between 0 and 100 in steps of ten', async () => {
  expect(DEFAULT_SETTINGS.volume).toBe(70);
  expect(DEFAULT_VOLUME).toBe(70);
  expect((await loadSettings()).volume).toBe(70);
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ volume: 43 }));
  expect((await loadSettings()).volume).toBe(40);
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ volume: 400 }));
  expect((await loadSettings()).volume).toBe(100);
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ volume: 'x' }));
  expect((await loadSettings()).volume).toBe(70);
});

test('the slider moves by dragging along the track and by VoiceOver, one step at a time', async () => {
  const seen: number[] = [];
  let value = 70;
  const ui = () => <Slider testID="s" label="Ses" value={value} step={10} onChange={(v) => { seen.push(v); value = v; }} />;
  await render(ui());
  const s = screen.getByTestId('s');
  expect(s.props.accessibilityRole).toBe('adjustable');
  expect(s.props.accessibilityValue).toMatchObject({ now: 70, text: '%70' });
  await fireEvent(s, 'layout', { nativeEvent: { layout: { width: 200, height: 32, x: 0, y: 0 } } });
  await fireEvent(s, 'responderGrant', { nativeEvent: { locationX: 41 } });
  await fireEvent(s, 'responderMove', { nativeEvent: { locationX: 43 } });  // still 20%: no second change
  await fireEvent(s, 'responderMove', { nativeEvent: { locationX: 260 } });  // past the end: 100%
  expect(seen).toEqual([20, 100]);
  await screen.rerender(ui());
  await fireEvent(screen.getByTestId('s'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(seen).toEqual([20, 100, 90]);
});

const fakeSession = (outputVolume: number) => ({
  get: () => ({
    category: 'AVAudioSessionCategoryPlayAndRecord', mode: 'AVAudioSessionModeDefault', categoryOptions: 0x1 | 0x4 | 0x8,
    outputs: ['Speaker (Speaker)'], inputs: ['MicrophoneBuiltIn (iPhone Microphone)'], outputVolume, sampleRate: 48000, otherAudioPlaying: false,
  }),
});

test('the diagnostic shows the session category, mode, route and the phone volume, and follows the volume buttons', async () => {
  jest.useFakeTimers();
  const g = globalThis as any;
  const saved = g.expo;
  let vol = 0.5;
  g.expo = { ...(saved ?? {}), modules: { ...(saved?.modules ?? {}), AudioSessionInfo: { get: () => fakeSession(vol).get() } } };
  try {
    await render(<AudioDiagnostic />);
    expect(screen.getByTestId('diag-Kategori')).toHaveTextContent('Kategori: playAndRecord (mixWithOthers, allowBluetooth, defaultToSpeaker)');
    expect(screen.getByTestId('diag-Mod')).toHaveTextContent('Mod: default');
    expect(screen.getByTestId('diag-Çıkış')).toHaveTextContent('Çıkış: Speaker (Speaker)');
    expect(screen.getByTestId('diag-Telefon sesi')).toHaveTextContent('Telefon sesi: %50');
    expect(screen.getByTestId('diag-Oyun sesi')).toHaveTextContent('Oyun sesi: %70');
    vol = 0.25;
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(screen.getByTestId('diag-Telefon sesi')).toHaveTextContent('Telefon sesi: %25');
  } finally {
    g.expo = saved;
    jest.useRealTimers();
  }
});

test('without the native module (an older build) the diagnostic says so instead of failing', async () => {
  await render(<AudioDiagnostic />);
  expect(screen.getByTestId('diag-Ses oturumu')).toHaveTextContent('Ses oturumu: bu sürümde okunamıyor');
});
