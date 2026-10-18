import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, renderHook, screen } from '@testing-library/react-native';
import type { Animated } from 'react-native';

import { LOST_MS } from '../../camera/faceCrop';
import { SETTINGS_KEY } from '../../store/settings';
import { SettingsProvider } from '../../store/SettingsContext';
import { visionCamera } from '../../test-utils/visionCamera';
import { Face, useFaceCrop } from '../Face';

const SIZE = 240;

async function show() {
  await render(<SettingsProvider><Face size={SIZE} /></SettingsProvider>);
  await act(async () => {}); // settings load
}

// Faces in preview coordinates: a 90 px face around (cx, cy), wobbling by up to 4 px.
async function feed(n: number, cx: number, cy: number, onFaces: (b: { x: number; y: number; width: number; height: number }[]) => void) {
  for (let i = 0; i < n; i++) {
    const wob = ((i * 7919) % 9) - 4;
    await act(() => {
      onFaces([{ x: cx - 45 + wob, y: cy - 45 - wob, width: 90 + wob, height: 90 + wob }]);
      jest.advanceTimersByTime(33);
    });
  }
}

jest.setTimeout(60_000);

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

test('no front camera (the simulator): placeholder, no permission asked', async () => {
  await show();
  expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();
  expect(screen.queryByTestId('camera-preview')).toBeNull();
  expect(visionCamera.requested).toBe(0);
});

test('front camera, permission not asked yet: asks once, placeholder meanwhile', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  await show();
  expect(visionCamera.requested).toBe(1);
  expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();
  expect(screen.queryByTestId('camera-preview')).toBeNull();
});

test('permission denied: placeholder', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'denied';
  await show();
  expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();
  expect(screen.queryByTestId('camera-preview')).toBeNull();
});

test('camera switched off in settings: no camera at all, placeholder', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ camera: false, micChecked: true }));
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'authorized';
  await show();
  expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();
  expect(screen.queryByTestId('camera-preview')).toBeNull();
  expect(visionCamera.requested).toBe(0);
});

test('camera on: placeholder until a face is seen, then the picture; placeholder again when the face is gone', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'authorized';
  await show();
  expect(screen.getByTestId('camera-preview')).toBeOnTheScreen();
  expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();

  await feed(10, 130, 110, (b) => visionCamera.onObjectsScanned!(b.map((boundingBox) => ({ type: 'face', boundingBox }))));
  expect(screen.queryByTestId('face-placeholder')).toBeNull();

  await act(() => { jest.advanceTimersByTime(LOST_MS + 50); });
  expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();
});

type T = { translateX: Animated.Value; translateY: Animated.Value; scale: Animated.Value }[];
const read = (style: { transform: unknown }) => {
  const t = style.transform as T;
  const v = (a: Animated.Value) => (a as unknown as { __getValue(): number }).__getValue();
  return { x: v(t[0].translateX), y: v(t[1].translateY), scale: v(t[2].scale) };
};

test('the picture is moved and zoomed so the face sits in the centre, and holds still', async () => {
  const setFound = jest.fn();
  const { result } = await renderHook(() => useFaceCrop(SIZE, setFound));
  expect(read(result.current.style)).toEqual({ x: 0, y: 0, scale: 1 });

  await feed(150, 130, 110, result.current.onFaces);
  expect(setFound).toHaveBeenLastCalledWith(true);
  const a = read(result.current.style);
  // The face centre (130, 110) lands in the middle of the circle...
  expect(Math.abs(SIZE / 2 + a.scale * (130 - SIZE / 2) + a.x - SIZE / 2)).toBeLessThan(6);
  expect(Math.abs(SIZE / 2 + a.scale * (110 - SIZE / 2) + a.y - SIZE / 2)).toBeLessThan(6);
  // ...at about two thirds of it.
  expect((90 * a.scale) / SIZE).toBeGreaterThan(0.6);
  expect((90 * a.scale) / SIZE).toBeLessThan(0.75);

  // More wobbly readings of the same face: the picture does not move.
  await feed(60, 130, 110, result.current.onFaces);
  const b = read(result.current.style);
  expect(Math.abs(b.x - a.x)).toBeLessThan(0.5);
  expect(Math.abs(b.y - a.y)).toBeLessThan(0.5);
  expect(Math.abs(b.scale - a.scale)).toBeLessThan(0.01);
});
