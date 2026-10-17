import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

import { CATEGORIES } from '../data/questions';

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
  mockBubbleRenders = 0;
});
afterEach(() => {
  jest.useRealTimers();
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
  return {
    ring: [ring.width, ring.height],
    question: question.height,
    questionMin: question.minHeight,
    active: [a.width, a.height, a.boxShadow],
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

test('the active letter moving on keeps the ring and the question block the same size, and keeps its glow', async () => {
  await startGame();
  await layoutStage(KEYBOARD_UP);
  const before = sizes();
  expect(before.active[2]).toContain('rgba(160,190,255,0.95)');

  for (let i = 0; i < 5; i++) {
    await fireEvent(screen.getByTestId('answer'), 'changeText', answerFor(clueText()));
    await fireEvent(screen.getByTestId('answer'), 'submitEditing');
    await act(() => jest.advanceTimersByTime(200));
    expect(sizes()).toEqual(before);
  }
});

test('the question block has a fixed height and the ring always fits beside it, keyboard up or down', async () => {
  await startGame();
  for (let h = 330; h <= 760; h += 30) {
    await layoutStage({ width: 440, height: h });
    const s = sizes();
    // A fixed height, not a minimum: longer clues can not grow it and shrink the ring.
    expect(s.questionMin).toBeUndefined();
    expect(typeof s.question).toBe('number');
    expect(s.ring[0]).toBe(s.ring[1]);
    expect(s.ring[0] + s.question).toBeLessThanOrEqual(h);
  }
});
