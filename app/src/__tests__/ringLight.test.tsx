import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import { SETTINGS_KEY } from '../store/settings';
import { visionCamera } from '../test-utils/visionCamera';
import { ringRadius } from '../ui/Ring';

// Node's fs, typed here: the app has no Node type definitions.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{ readFileSync: (file: string, enc: 'utf8') => string }>('fs');

// The light around the letter ring (design 1b, docs/design/reference/
// ring-light-rays.png): rays behind the camera square, the halo and the dashed
// circle over the square and under the letters, sized in units of the ring
// radius, static.
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

function geometry() {
  const size = style(screen.getByTestId('ring')).width as number;
  const radius = ringRadius(size, Math.round(size * 0.079));
  return { size, radius };
}

function expectLight(camera: 'face-camera' | 'face-placeholder') {
  const { size, radius } = geometry();
  const area = screen.getByTestId('ring-area');

  // Behind: the rays come before the ring in its area, so the square and the
  // letters are painted over them; clipped to the area, untouchable.
  expect(ids(area)).toEqual(['ring-rays', 'ring']);
  const rays = screen.getByTestId('ring-rays');
  expect(rays.props.pointerEvents).toBe('none');
  expect(style(rays)).toMatchObject({ position: 'absolute', overflow: 'hidden' });
  const raysImg = style(rays.children[0] as Node);
  expect(raysImg.width).toBe(Math.round(2 * 1.94 * radius));
  expect(raysImg.width).toBeGreaterThan(size);

  // Over the square, under the letters: the ring's first child holds the
  // square and then the glow; every letter comes after it.
  const ring = screen.getByTestId('ring');
  const [middle, ...letters] = ring.children as Node[];
  expect(ids(middle)).toEqual(['face', 'ring-glow']);
  expect(within(middle).getByTestId(camera)).toBeOnTheScreen();
  expect(letters.every((l) => /^letter-/.test(l.props.testID))).toBe(true);

  const glow = screen.getByTestId('ring-glow');
  expect(glow.props.pointerEvents).toBe('none');
  // Clipped to the square, with the square's corners.
  expect(style(glow)).toMatchObject({ width: size, height: size, overflow: 'hidden', borderRadius: Math.round(size * 0.04) });
  const [innerRays, halo] = glow.children as Node[];
  expect(style(innerRays).opacity).toBeLessThan(1);
  expect(style(halo).width).toBe(Math.round(2 * 1.19 * radius));

  // The thin dashed circle inside the letters, centred on the ring.
  const dash = style(screen.getByTestId('ring-dash'));
  expect(dash).toMatchObject({ borderStyle: 'dashed', borderWidth: 2 });
  const d = Math.round(2 * 0.85 * radius);
  expect(dash.width).toBe(d);
  expect(dash.left).toBe((size - d) / 2);
  expect(dash.top).toBe((size - d) / 2);
}

test('camera off (placeholder): rays behind the square, halo and dashed circle between it and the letters', async () => {
  await startGame();
  expectLight('face-placeholder');
});

test('camera on: the same light around the live picture', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'authorized';
  await startGame();
  expect(screen.getByTestId('camera-preview')).toBeOnTheScreen();
  expectLight('face-camera');
});

test('the light follows the ring size (keyboard up) without changing it', async () => {
  await startGame();
  const down = geometry();
  await act(() => fireEvent(screen.getByTestId('stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 440, height: 398 } } }));
  const up = geometry();
  expect(up.size).toBeLessThan(down.size);
  expect(style(screen.getByTestId('ring-rays').children[0] as Node).width).toBe(Math.round(2 * 1.94 * up.radius));
  expect(style(screen.getByTestId('ring-dash')).width).toBe(Math.round(2 * 0.85 * up.radius));
});

test('static: plain images, no animation or frame loop', () => {
  const src = readFileSync(`${__dirname}/../ui/RingLight.tsx`, 'utf8');
  expect(src).not.toMatch(/Animated|requestAnimationFrame|setInterval|setTimeout|useEffect/);
  expect(src).toMatch(/ring-rays\.png/);
  expect(src).toMatch(/ring-glow\.png/);
});
