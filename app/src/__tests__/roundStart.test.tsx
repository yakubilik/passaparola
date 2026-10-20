import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { audio } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { host, listener, SESSION_SETTLE_MS, sounds } from '../voice/engine';
import { CUE_VOLUME, DEFAULT_GAIN, FADE_IN_MS, HOST_VOLUME, setMasterVolume } from '../voice/sounds';

// The first host line of a round ("İşte sağ cepten sorular çıkıyor efendim")
// was louder than the rest and deaf to the volume buttons: it played while
// the recognizer's audio engine was bringing up voice processing. Now the
// session is set, the mic starts, the route settles, and only then the host
// speaks, fading in. The first test must run first: it sees the session set up.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(600_000);  // room for a loaded machine (the full suite runs its files in parallel)

const wait = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });
const themePlayer = () => audio.players.find((p) => p.source === require('../../assets/sounds/theme.mp3'));

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
});

const at = (e: string) => audio.log.findIndex((l) => l.e === e);
const timeOf = (e: string) => audio.log.find((l) => l.e === e)!.t;

test('the first host line of a round plays only after the session is set and the mic has really started, on a player made after that, fading in', async () => {
  audio.log.length = 0;
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  // The theme is still sounding when Başla is pressed: it stops before the mic starts.
  const theme = themePlayer()!;
  expect(theme.playing).toBe(true);
  const before = host.said.length;
  await fireEvent.press(screen.getByText('Başla'));
  await act(async () => {});
  expect(theme.playing).toBe(false);
  expect(rec.starts).toBe(1);
  expect(rec.categories).toHaveLength(1);
  expect(listener.micUp).toBe(true);

  // Up to SESSION_SETTLE_MS after the mic came up: nothing from the host, no bed.
  await wait(SESSION_SETTLE_MS - 10);
  expect(host.said.length).toBe(before);
  expect(sounds.bgPlaying).toBe(false);
  await wait(20);
  expect(host.said.slice(before)[0]).toBe('clip:go');
  expect(sounds.bgPlaying).toBe(true);

  // The order: session (mode, category, active), recognizer started, it reported 'start', then the host's player is made and plays.
  const hostIndex = audio.players.indexOf((host as any).player);
  expect(hostIndex).toBeGreaterThanOrEqual(0);
  const order = ['mode', 'category', 'active', 'rec:start', 'rec:up', `create#${hostIndex}`, `play#${hostIndex}`].map(at);
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(timeOf(`play#${hostIndex}`) - timeOf('rec:up')).toBeGreaterThanOrEqual(SESSION_SETTLE_MS);
  // No sound at all is playing while the recognizer's audio engine comes up.
  expect(audio.log.slice(at('rec:start'), at('rec:up')).filter((l) => l.e.startsWith('play#'))).toEqual([]);
  expect(audio.players.filter((p, i) => p.playing && i !== hostIndex && p !== (sounds.player('bg') as unknown))).toEqual([]);

  // The line fades in to the host's level under the Ses gain.
  const go = audio.players[hostIndex];
  expect(go.volume).toBeLessThan(HOST_VOLUME * DEFAULT_GAIN);
  await wait(FADE_IN_MS);
  expect(go.volume).toBeCloseTo(HOST_VOLUME * DEFAULT_GAIN);
});

test('the Ses setting is the gain over the host, the cues and the bed, and moves a line already playing', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true, volume: 30 }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  await fireEvent.press(screen.getByText('Başla'));
  await act(async () => {});
  await wait(SESSION_SETTLE_MS + 20);
  await wait(FADE_IN_MS);
  expect(host.speaking).toBe(true);
  expect(host.volume).toBeCloseTo(HOST_VOLUME * 0.3);
  expect(sounds.bgVolume).toBeGreaterThan(0);
  const bed = sounds.bgVolume;
  // Changed in Ayarlar while the host talks: the line follows at once, the bed too.
  act(() => setMasterVolume(60));
  expect(host.volume).toBeCloseTo(HOST_VOLUME * 0.6);
  expect(sounds.bgVolume).toBeCloseTo(bed * 2);
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(sounds.started.at(-1)).toMatchObject({ cue: 'pas' });
  expect(sounds.started.at(-1)!.volume).toBeCloseTo(CUE_VOLUME * 0.6);
});
