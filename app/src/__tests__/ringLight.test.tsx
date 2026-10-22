import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import { SETTINGS_KEY } from '../store/settings';
import { visionCamera } from '../test-utils/visionCamera';

// Node's fs, typed here: the app has no Node type definitions.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{ readFileSync: (file: string, enc: 'utf8') => string }>('fs');

// #438 (Yakup, 22 Oct 2026): the blue light inside the letter ring is gone.
// #363 had added rays behind the camera square, a blue halo and a dashed
// circle over it, and the square itself had a blue glow; none of it remains:
// the ring's area holds only the ring, the ring's middle only the picture, and
// the square has a thin edge, no coloured glow. Its images are deleted.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(600_000);  // room for a loaded machine (the full suite runs its files in parallel)

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
  visionCamera.reset();
});
afterEach(() => {
  jest.useRealTimers();
});

const STAGE = { width: 440, height: 700 };

async function startGame() {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await fireEvent.press(await screen.findByText('Başla'));
  await act(() => fireEvent(screen.getByTestId('stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...STAGE } } }));
}

type Node = ReturnType<typeof screen.getByTestId>;
const style = (n: Node) => StyleSheet.flatten(n.props.style);
const ids = (n: Node) => n.children.map((c) => (typeof c === 'string' ? c : c.props.testID));

function expectNoLight(camera: 'face-camera' | 'face-placeholder') {
  expect(ids(screen.getByTestId('ring-area'))).toEqual(['ring']);
  const [middle, ...letters] = screen.getByTestId('ring').children as Node[];
  expect(ids(middle)).toEqual(['face']);
  expect(within(middle).getByTestId(camera)).toBeOnTheScreen();
  expect(letters.every((l) => /^letter-/.test(l.props.testID))).toBe(true);
  for (const id of ['ring-rays', 'ring-glow', 'ring-dash']) expect(screen.queryByTestId(id)).toBeNull();
  // The square: a thin white edge, no blue glow.
  expect(style(screen.getByTestId('face')).boxShadow).toBe('0 0 0 1px rgba(255,255,255,0.12)');
  if (camera === 'face-placeholder') expect(style(screen.getByTestId('face-placeholder')).backgroundImage).toBeUndefined();
}

test('camera off (placeholder): no light around or over the ring', async () => {
  await startGame();
  expectNoLight('face-placeholder');
});

test('camera on: no light around the live picture either', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'authorized';
  await startGame();
  expect(screen.getByTestId('camera-preview')).toBeOnTheScreen();
  expectNoLight('face-camera');
});

test('keyboard up (smaller ring): still no light', async () => {
  await startGame();
  await act(() => fireEvent(screen.getByTestId('stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 440, height: 398 } } }));
  expectNoLight('face-placeholder');
});

test('the light is gone from the source: no RingLight component, no ring-rays / ring-glow images', () => {
  const exists = (f: string) => { try { readFileSync(f, 'utf8'); return true; } catch { return false; } };
  expect(exists(`${__dirname}/../ui/RingLight.tsx`)).toBe(false);
  expect(exists(`${__dirname}/../../assets/ring-rays.png`)).toBe(false);
  expect(exists(`${__dirname}/../../assets/ring-glow.png`)).toBe(false);
  expect(readFileSync(`${__dirname}/../app/game.tsx`, 'utf8')).not.toMatch(/RingGlow|RingRays|RingLight/);
});
