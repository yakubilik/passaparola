import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Keyboard, StyleSheet, type Animated } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { SETTINGS_KEY } from '../store/settings';
import { F } from '../ui/theme';
import { visionCamera } from '../test-utils/visionCamera';

// The game screen must hold still: clock ticks (every 200 ms) and the active
// letter moving on may not change the size of the ring or the question block.
// On the iPhone the ring size used to come from the measured ring area, and the
// ring size switched the question block between two heights, which in turn
// changed the ring area: with the keyboard up it never settled.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

// Counts how often the ring's letters are rendered.
let mockBubbleRenders = 0;
jest.mock('../ui/Bubble', () => {
  const actual = jest.requireActual('../ui/Bubble');
  return {
    Bubble: (p: Parameters<typeof actual.Bubble>[0]) => {
      mockBubbleRenders++;
      return actual.Bubble(p);
    },
  };
});

jest.setTimeout(240_000);

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  // The typed game (voice.test.tsx plays the spoken one).
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
  visionCamera.reset();
  mockBubbleRenders = 0;
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function answerFor(clue: string): string {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q.answers[0];
  throw new Error('no question with clue ' + clue);
}

function clueText(): string {
  const kids = screen.getByTestId('clue').props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids);
}

// What the native layout would report for the stage between the top bar and
// the answer row (iPhone 17 Pro Max: keyboard up, keyboard down).
const KEYBOARD_UP = { width: 440, height: 398 };
const KEYBOARD_DOWN = { width: 440, height: 700 };

async function layoutStage(l: { width: number; height: number }) {
  await act(() => fireEvent(screen.getByTestId('stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...l } } }));
}

function sizes() {
  const ring = StyleSheet.flatten(screen.getByTestId('ring').props.style);
  const question = StyleSheet.flatten(screen.getByTestId('question').props.style);
  const active = screen.getByLabelText(/harfi, sırada$/);
  const a = StyleSheet.flatten(active.props.style);
  const face = StyleSheet.flatten(screen.getByTestId('face').props.style);
  const area = StyleSheet.flatten(screen.getByTestId('ring-area').props.style);
  return {
    ring: [ring.width, ring.height],
    // The camera square under the ring and the area that centres both.
    square: [face.width, face.height],
    area: area.height,
    question: question.height,
    questionMin: question.minHeight,
    active: [a.width, a.height, a.backgroundColor, a.borderColor],
  };
}

async function startGame() {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await fireEvent.press(await screen.findByText('Başla'));
}

test.each([
  ['keyboard up', KEYBOARD_UP],
  ['keyboard down', KEYBOARD_DOWN],
])('%s: 10 clock ticks change neither the layout nor the ring', async (_, stage) => {
  await startGame();
  await layoutStage(stage);
  const before = sizes();
  const renders = mockBubbleRenders;
  const clock = screen.getByTestId('clock').props.children;

  for (let i = 0; i < 10; i++) {
    await act(() => jest.advanceTimersByTime(200));
    // Native layout reports the same stage again; that must not re-render anything either.
    await layoutStage(stage);
    expect(sizes()).toEqual(before);
  }

  expect(screen.getByTestId('clock').props.children).not.toEqual(clock);
  expect(mockBubbleRenders).toBe(renders);
});

test('the active letter moving on keeps the ring and the question block the same size, and stays a white disc with a dark rim', async () => {
  await startGame();
  await layoutStage(KEYBOARD_UP);
  const before = sizes();
  expect(before.active.slice(2)).toEqual(['#ffffff', '#0a0d1f']);

  for (let i = 0; i < 5; i++) {
    await fireEvent(screen.getByTestId('answer'), 'changeText', answerFor(clueText()));
    await fireEvent(screen.getByTestId('answer'), 'submitEditing');
    await act(() => jest.advanceTimersByTime(200));
    expect(sizes()).toEqual(before);
  }
});

test('the question block has a fixed height and the ring always fits beside it, for any stage height', async () => {
  await startGame();
  // Downwards: the screen keeps the smallest stage it has seen, so each step is a new layout.
  for (let h = 760; h >= 330; h -= 30) {
    await layoutStage({ width: 440, height: h });
    const s = sizes();
    // A fixed height, not a minimum: longer clues can not grow it and shrink the ring.
    expect(s.questionMin).toBeUndefined();
    expect(typeof s.question).toBe('number');
    expect(s.ring[0]).toBe(s.ring[1]);
    // The picture is a square as wide as the ring, under its letters.
    expect(s.square).toEqual(s.ring);
    expect(s.ring[0] + s.question).toBeLessThanOrEqual(h);
  }
});

type V = Animated.Value | number;
type T = { translateX: V; translateY: V; scale: V }[];
function cameraView() {
  // The rendered view carries plain numbers; an Animated.Value would need reading.
  const v = (a: Animated.Value | number) => (typeof a === 'number' ? a : (a as unknown as { __getValue(): number }).__getValue());
  const wrap = StyleSheet.flatten(screen.getByTestId('face-camera').props.style);
  const t = wrap.transform as unknown as T;
  const preview = StyleSheet.flatten(screen.getByTestId('camera-preview').props.style);
  const face = StyleSheet.flatten(screen.getByTestId('face').props.style);
  return {
    face: [face.width, face.height],
    preview: [preview.width, preview.height],
    crop: { x: v(t[0].translateX), y: v(t[1].translateY), scale: v(t[2].scale) },
  };
}

async function faceInView(frames: number) {
  for (let i = 0; i < frames; i++) {
    await act(() => {
      visionCamera.onObjectsScanned!([{ type: 'face', boundingBox: { x: 80, y: 60, width: 90, height: 90 } }]);
      jest.advanceTimersByTime(33);
    });
  }
  await act(() => jest.advanceTimersByTime(600));
}

test('keyboard up and down, camera on: the keyboard-down layout comes back exactly, ring, camera square, face crop and question block', async () => {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'authorized';
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await layoutStage(KEYBOARD_DOWN);
  await fireEvent.press(await screen.findByText('Başla'));

  // A steady face in view, then let the crop settle.
  await faceInView(30);
  expect(screen.queryByTestId('face-placeholder')).toBeNull();
  const down = sizes();
  const cam = cameraView();
  expect(cam.crop.scale).toBeGreaterThan(1);

  await layoutStage(KEYBOARD_UP);
  await faceInView(30);
  const up = sizes();
  // The keyboard takes room: the ring and the square get smaller, the block keeps a fixed height.
  expect(up.ring[0]).toBeLessThan(down.ring[0] as number);
  expect(up.square).toEqual(up.ring);

  for (let i = 0; i < 4; i++) {
    await layoutStage(i % 2 ? KEYBOARD_UP : KEYBOARD_DOWN);
    await faceInView(30);
    expect(sizes()).toEqual(i % 2 ? up : down);
    if (i % 2) continue;
    // Keyboard down again: the camera square and its face crop are back as they were.
    const now = cameraView();
    expect(now.face).toEqual(cam.face);
    expect(now.preview).toEqual(cam.preview);
    expect(Math.abs(now.crop.x - cam.crop.x)).toBeLessThan(0.5);
    expect(Math.abs(now.crop.y - cam.crop.y)).toBeLessThan(0.5);
    expect(Math.abs(now.crop.scale - cam.crop.scale)).toBeLessThan(0.01);
  }
});

// The iOS keyboard events, driven by the test (the KeyboardAvoidingView listens to them).
const keyboard = new Map<string, Set<(e: unknown) => void>>();
function emitKeyboard(name: string, e: unknown) {
  return act(async () => {
    keyboard.get(name)?.forEach((h) => h(e));
    await Promise.resolve();
  });
}
const SCREEN_H = 956;
const keyboardEvent = (height: number) => ({
  duration: 250, easing: 'keyboard',
  startCoordinates: { screenX: 0, screenY: SCREEN_H, width: 440, height },
  endCoordinates: { screenX: 0, screenY: SCREEN_H - height, width: 440, height },
});
const padding = () => StyleSheet.flatten(screen.getByTestId('game-keyboard').props.style).paddingBottom;

test('keyboard show -> hide: the keyboard height is dropped on hide and the measured keyboard-down sizes come back', async () => {
  keyboard.clear();
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, h: (e: unknown) => void) => {
    if (!keyboard.has(name)) keyboard.set(name, new Set());
    keyboard.get(name)!.add(h);
    return { remove: () => keyboard.get(name)?.delete(h) };
  }) as unknown as typeof Keyboard.addListener);
  await startGame();
  // The avoiding view spans the screen under the status bar; the stage reports the space left.
  await act(() => fireEvent(screen.getByTestId('game-keyboard'), 'layout', { persist() {}, nativeEvent: { layout: { x: 0, y: 0, width: 440, height: SCREEN_H } } }));
  await layoutStage(KEYBOARD_DOWN);
  const down = sizes();
  expect(padding()).toBe(0);

  for (const height of [336, 290]) {
    await emitKeyboard('keyboardWillShow', keyboardEvent(height));
    // This keyboard's own height, never the one before it.
    expect(padding()).toBe(height);
    await layoutStage({ width: 440, height: KEYBOARD_DOWN.height - height });
    const up = sizes();
    expect(up.ring[0]).toBeLessThan(down.ring[0] as number);

    await emitKeyboard('keyboardWillHide', keyboardEvent(height));
    expect(padding()).toBe(0);
    await layoutStage(KEYBOARD_DOWN);
    expect(sizes()).toEqual(down);
  }
  // After submitting an answer the layout stays where the keyboard puts it.
  await emitKeyboard('keyboardWillShow', keyboardEvent(336));
  await layoutStage({ width: 440, height: KEYBOARD_DOWN.height - 336 });
  await fireEvent(screen.getByTestId('answer'), 'changeText', answerFor(clueText()));
  await fireEvent(screen.getByTestId('answer'), 'submitEditing');
  await emitKeyboard('keyboardWillHide', keyboardEvent(336));
  expect(padding()).toBe(0);
  await layoutStage(KEYBOARD_DOWN);
  expect({ ...sizes(), active: null }).toEqual({ ...down, active: null });
});

test('the letters are drawn over the camera square as flat discs, without a shadow', async () => {
  await startGame();
  await layoutStage(KEYBOARD_UP);
  const ring = screen.getByTestId('ring');
  // The square comes first in the ring, so every letter is painted over it.
  const [under, ...over] = ring.children;
  expect(typeof under).not.toBe('string');
  expect(within(under as Exclude<typeof under, string>).getByTestId('face')).toBeOnTheScreen();
  expect(over.map((c) => (typeof c === 'string' ? c : c.props.testID))).toContain('letter-A');
  expect(over).toHaveLength(screen.getAllByLabelText(/ harfi, /).length);
  for (const l of ['A', 'B', 'Z']) {
    const st = StyleSheet.flatten(screen.getByTestId(`letter-${l}`).props.style);
    expect(st.boxShadow).toBeUndefined();
    expect(st.backgroundImage).toBeUndefined();
  }
  // Letters along the bottom sit over the lower part of the square (the shoulders).
  const size = sizes().ring[0] as number;
  const tops = ['K', 'L', 'M', 'N'].map((l) => StyleSheet.flatten(screen.getByTestId(`letter-${l}`).props.style).top as number);
  for (const t of tops) expect(t / size).toBeGreaterThan(0.75);
});

test('multiplayer: every turn shows the same square and ring, and the keyboard-down layout comes back', async () => {
  await renderRouter('./src/app', { initialUrl: `/match?names=${encodeURIComponent(JSON.stringify(['Ayşe', 'Bora']))}&cats=tarih&level=1&seed=7` });
  let first: { down: ReturnType<typeof sizes>; up: ReturnType<typeof sizes> } | null = null;
  const plain = (s: ReturnType<typeof sizes>) => ({ ...s, active: null });
  for (const name of ['Ayşe', 'Bora', 'Ayşe']) {
    expect(await screen.findByTestId('handover')).toHaveTextContent(`Sıra: ${name}`);
    await fireEvent.press(screen.getByText('Başla'));
    await layoutStage(KEYBOARD_DOWN);
    const down = sizes();
    await layoutStage(KEYBOARD_UP);
    const up = sizes();
    expect(up.ring[0]).toBeLessThan(down.ring[0] as number);
    expect(down.square).toEqual(down.ring);
    expect(up.square).toEqual(up.ring);
    if (first) {
      expect(plain(down)).toEqual(plain(first.down));
      expect(plain(up)).toEqual(plain(first.up));
    } else first = { down, up };
    for (let i = 0; i < 3; i++) {
      await layoutStage(i % 2 ? KEYBOARD_UP : KEYBOARD_DOWN);
      await act(() => jest.advanceTimersByTime(200));
      expect(plain(sizes())).toEqual(plain(i % 2 ? first.up : first.down));
    }
    await fireEvent.press(screen.getByLabelText('Pas'));
    await fireEvent.press(await screen.findByTestId('next-player'));
  }
});

test('a big letter in the display font starts the clue block, follows each question and leaves the block height alone', async () => {
  await startGame();
  for (const stage of [KEYBOARD_DOWN, KEYBOARD_UP]) {
    await layoutStage(stage);
    const height = sizes().question;
    for (let i = 0; i < 3; i++) {
      const letter = screen.getByTestId('clue-letter');
      const active = screen.getByLabelText(/harfi, sırada$/).props.accessibilityLabel.split(' ')[0];
      expect(letter).toHaveTextContent(active);
      const big = StyleSheet.flatten(letter.props.style);
      const clue = StyleSheet.flatten(screen.getByTestId('clue').props.style);
      expect(big.fontFamily).toBe(F.display);
      expect(big.fontSize).toBeGreaterThanOrEqual(2.5 * (clue.fontSize as number));
      // Inside the question block, in front of the clue.
      expect(within(screen.getByTestId('question')).getByTestId('clue-letter')).toBe(letter);
      expect(sizes().question).toBe(height);
      await fireEvent(screen.getByTestId('answer'), 'changeText', answerFor(clueText()));
      await fireEvent(screen.getByTestId('answer'), 'submitEditing');
    }
  }
});
