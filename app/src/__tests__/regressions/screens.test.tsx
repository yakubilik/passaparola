import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { AppState, Keyboard, StyleSheet, type Animated, type AppStateStatus } from 'react-native';

import { CATEGORIES, type Question } from '../../data/questions';
import { EMPTY_PROGRESS, PROGRESS_KEY, recordRound } from '../../store/progress';
import { SETTINGS_KEY } from '../../store/settings';
import { fakeRecognizer as rec } from '../../test-utils/fakeRecognizer';
import { pressStart, settle } from '../../test-utils/round';
import { visionCamera } from '../../test-utils/visionCamera';
import { ringRadius } from '../../ui/Ring';
import { F } from '../../ui/theme';
import { host, listener, sounds } from '../../voice/engine';
import { clueLine, type Line } from '../../voice/lines';

// Every screen and game-flow complaint Yakup made across the Harfiyen tickets
// (#312-#391), one test each, titled with the ticket and his words. Fixes kept
// undoing each other because each ticket only tested its own symptom; here
// they all have to hold at once, in one file, against one build of the app.
jest.mock('../../data/questions', () =>
  require('../../test-utils/mockQuestions').mockQuestions({ tarih: [1, 2], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

// Counts how often the ring's letters are rendered (#329).
let mockBubbleRenders = 0;
jest.mock('../../ui/Bubble', () => {
  const actual = jest.requireActual('../../ui/Bubble');
  return {
    Bubble: (p: Parameters<typeof actual.Bubble>[0]) => {
      mockBubbleRenders++;
      return actual.Bubble(p);
    },
  };
});

jest.setTimeout(300_000);  // room for a loaded machine (the full suite runs its files in parallel)

// ---------------------------------------------------------------- helpers

const appState = new Set<(s: AppStateStatus) => void>();
async function goTo(state: AppStateStatus) {
  await act(() => appState.forEach((h) => h(state)));
}

// The iOS keyboard events, driven by the test (the KeyboardAvoidingView listens to them).
const keyboard = new Map<string, Set<(e: unknown) => void>>();
function emitKeyboard(name: string, e: unknown) {
  return act(async () => {
    keyboard.get(name)?.forEach((h) => h(e));
    await Promise.resolve();
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  appState.clear();
  keyboard.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
    appState.add(h as (s: AppStateStatus) => void);
    return { remove: () => appState.delete(h as (s: AppStateStatus) => void) } as ReturnType<typeof AppState.addEventListener>;
  });
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, h: (e: unknown) => void) => {
    if (!keyboard.has(name)) keyboard.set(name, new Set());
    keyboard.get(name)!.add(h);
    return { remove: () => keyboard.get(name)?.delete(h) };
  }) as unknown as typeof Keyboard.addListener);
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  host.cancel();
  listener.release();  // a mic still closing after the last test's screen went
  rec.reset();
  sounds.played.length = 0;
  host.said.length = 0;
  visionCamera.reset();
  mockBubbleRenders = 0;
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function question(clue: string): Question {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q;
  throw new Error('no question with clue ' + clue);
}
function clueText(): string {
  const kids = screen.getByTestId('clue').props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids);
}
const answerNow = () => question(clueText()).answers[0];
const wait = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });
const said = (l: Line) => (host.hasClip(l.key!) ? `clip:${l.key}` : `tts:${l.text}`);
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

async function type(text: string) {
  const input = screen.getByTestId('answer');
  await fireEvent.changeText(input, text);
  await fireEvent(input, 'submitEditing');
}

async function untilRevealEnds(max = 15_000) {
  for (let t = 0; t < max && screen.queryByTestId('reveal'); t += 250) await wait(250);
}

async function setSettings(s: object) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ micChecked: true, ...s }));
}

// A single-player round on tarih level 1, started.
async function single(voice = false) {
  await setSettings({ voice });
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  if (voice) await pressStart();
  else await fireEvent.press(await screen.findByText('Başla'));
}

// A two-player match, on the first "Sıra" screen.
async function match(voice = false, names = ['Ayşe', 'Bora']) {
  await setSettings({ voice });
  await renderRouter('./src/app', { initialUrl: `/match?names=${encodeURIComponent(JSON.stringify(names))}&cats=tarih&level=1&seed=5` });
  expect(await screen.findByTestId('handover')).toHaveTextContent(`Sıra: ${names[0]}`);
  if (voice) await settle();
}
async function startTurn(voice = false) {
  await fireEvent.press(screen.getByText('Başla'));
  if (voice) await settle();
}

// What the native layout reports for the stage between the top bar and the
// answer row (iPhone 17 Pro Max: keyboard up, keyboard down).
const KEYBOARD_UP = { width: 440, height: 398 };
const KEYBOARD_DOWN = { width: 440, height: 700 };
async function layoutStage(l: { width: number; height: number }) {
  await act(() => fireEvent(screen.getByTestId('stage'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...l } } }));
}

function sizes() {
  const ring = style('ring');
  const question = style('question');
  const face = style('face');
  return {
    ring: [ring.width, ring.height],
    square: [face.width, face.height],
    area: style('ring-area').height,
    question: question.height,
  };
}

const SCREEN_H = 956;
const keyboardEvent = (height: number) => ({
  duration: 250, easing: 'keyboard',
  startCoordinates: { screenX: 0, screenY: SCREEN_H, width: 440, height },
  endCoordinates: { screenX: 0, screenY: SCREEN_H - height, width: 440, height },
});
const keyboardPadding = () => style('game-keyboard').paddingBottom;

type V = Animated.Value | number;
function crop() {
  const v = (a: V) => (typeof a === 'number' ? a : (a as unknown as { __getValue(): number }).__getValue());
  const t = style('face-camera').transform as unknown as { translateX: V; translateY: V; scale: V }[];
  return { x: v(t[0].translateX), y: v(t[1].translateY), scale: v(t[2].scale) };
}
function cameraOn() {
  visionCamera.device = { id: 'front', position: 'front' };
  visionCamera.status = 'authorized';
}
// A face held still at (cx, cy) in the preview, read by a detector that wobbles by up to 5 px.
async function faceAt(frames: number, cx: number, cy: number, w: number) {
  for (let i = 0; i < frames; i++) {
    const wob = ((i * 7919) % 11) - 5;
    const width = w + wob;
    await act(() => {
      visionCamera.onObjectsScanned!([{ type: 'face', boundingBox: { x: cx - width / 2 + wob, y: cy - width / 2 - wob, width, height: width } }]);
      jest.advanceTimersByTime(33);
    });
  }
}

type Node = ReturnType<typeof screen.getByTestId>;
const ids = (n: Node) => n.children.map((c) => (typeof c === 'string' ? c : c.props.testID));

// ---------------------------------------------------------------- #312

test('#312: typed answer, Pas, letters go green/red/yellow, passed letters come back round after round', async () => {
  await single();
  await type(answerNow());
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
  await type('bambaşka bir şey');
  expect(screen.getByLabelText('B harfi, yanlış')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('reveal'));
  expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(screen.getByLabelText('C harfi, pas')).toBeOnTheScreen();
  expect(screen.getByLabelText('Ç harfi, sırada')).toBeOnTheScreen();
  // Every other letter right: the passed C comes back after Z.
  for (let i = 0; i < 25; i++) await type(answerNow());
  expect(screen.getByLabelText('Z harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();
  expect(screen.getByTestId('clue-letter')).toHaveTextContent('C');
  expect(question(clueText()).letter).toBe('C');
});

test('#312: a category or level with no questions yet shows "yakında" instead of crashing', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=cografya&level=1' });
  expect(await screen.findByText('Bu bölüm yakında')).toBeOnTheScreen();
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=3&quick=1' });
  expect(await screen.findByText('Bu bölüm yakında')).toBeOnTheScreen();
  await renderRouter('./src/app', { initialUrl: '/levels?cats=cografya' });
  expect(await screen.findByLabelText('Bölüm 1, yakında')).toBeDisabled();
});

test('#312: levels unlock in order per category (finishing level n with at least 18 correct opens n+1), and it survives a restart', async () => {
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(recordRound(EMPTY_PROGRESS, ['tarih'], 1, 17)));
  await renderRouter('./src/app', { initialUrl: '/levels?cats=tarih' });
  expect(await screen.findByLabelText('Bölüm 2, kilitli')).toBeDisabled();
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=2' });
  expect(await screen.findByText('Bu bölüm henüz kilitli')).toBeOnTheScreen();

  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(recordRound(EMPTY_PROGRESS, ['tarih'], 1, 18)));
  await renderRouter('./src/app', { initialUrl: '/levels?cats=tarih' });
  expect(await screen.findByLabelText('Bölüm 2, açık')).toBeEnabled();
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=2' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
});

// ---------------------------------------------------------------- #318

test('#318: uygulamayı alta alsam da devam ediyor — in the background the round\'s clock stops', async () => {
  await single();
  await wait(2000);
  const clock = String(screen.getByTestId('clock').props.children);
  await goTo('background');
  await wait(20_000);
  expect(screen.getByTestId('clock')).toHaveTextContent(clock);
  await goTo('active');
  await wait(2000);
  expect(screen.getByTestId('clock')).not.toHaveTextContent(clock);
});

// ---------------------------------------------------------------- #319

test('#319: the face centred inside the ring and steady, not jittering or half outside the circle', async () => {
  cameraOn();
  await setSettings({ voice: false });
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await layoutStage(KEYBOARD_DOWN);
  await fireEvent.press(await screen.findByText('Başla'));
  const S = sizes().square[0] as number;

  // A face off to one side of the preview, the detector wobbling around it.
  const [cx, cy, w] = [S * 0.6, S * 0.45, S * 0.3];
  await faceAt(90, cx, cy, w);
  await wait(600);
  expect(screen.queryByTestId('face-placeholder')).toBeNull();
  const a = crop();
  const at = (p: number, t: number) => S / 2 + a.scale * (p - S / 2) + t;
  // Centred left to right, inside the square, about half its height.
  expect(Math.abs(at(cx, a.x) - S / 2) / S).toBeLessThan(0.03);
  expect(at(cy, a.y) / S).toBeGreaterThan(0.3);
  expect(at(cy, a.y) / S).toBeLessThan(0.7);
  expect((w * a.scale) / S).toBeGreaterThan(0.4);
  expect((w * a.scale) / S).toBeLessThan(0.6);

  // More wobbly readings of the same face, with the clock ticking: the picture holds still.
  const seen = [] as ReturnType<typeof crop>[];
  for (let i = 0; i < 4; i++) {
    await faceAt(10, cx, cy, w);
    seen.push(crop());
  }
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  expect(spread(seen.map((c) => c.x))).toBeLessThan(0.5);
  expect(spread(seen.map((c) => c.y))).toBeLessThan(0.5);
  expect(spread(seen.map((c) => c.scale))).toBeLessThan(0.01);
});

test.each([
  ['switched off in settings', () => { cameraOn(); }, { camera: false }],
  ['no permission', () => { visionCamera.device = { id: 'front', position: 'front' }; visionCamera.status = 'denied'; }, {}],
  ['no face in view', () => { cameraOn(); }, {}],
  ['no front camera', () => {}, {}],
])('#319: camera %s: the placeholder in the circle and the game goes on', async (_, setup, extra) => {
  setup();
  await setSettings({ voice: false, ...extra });
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await fireEvent.press(await screen.findByText('Başla'));
  await wait(2000);
  expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();
  await type(answerNow());
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
});

// ---------------------------------------------------------------- #329

test.each([
  ['keyboard up', KEYBOARD_UP],
  ['keyboard down', KEYBOARD_DOWN],
])('#329: the letters of the ring and the question text keep zooming in and out and jumping, about 5 times a second (%s)', async (_, stage) => {
  await single();
  await layoutStage(stage);
  const before = sizes();
  const renders = mockBubbleRenders;
  const clock = screen.getByTestId('clock').props.children;
  for (let i = 0; i < 10; i++) {
    await wait(200);
    await layoutStage(stage);
    expect(sizes()).toEqual(before);
  }
  expect(screen.getByTestId('clock').props.children).not.toEqual(clock);
  // A clock tick re-renders no letter.
  expect(mockBubbleRenders).toBe(renders);
  // The active letter moving on resizes nothing either.
  for (let i = 0; i < 4; i++) {
    await type(answerNow());
    await wait(200);
    expect(sizes()).toEqual(before);
  }
});

test('#329: the game screen jumps — with the voice on nothing around the stage comes or goes (Başla, a wrong answer\'s reveal, the next clue), so the stage never resizes the ring', async () => {
  await setSettings({ voice: true });
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  // The rows the stage shares the screen with, top to bottom.
  const rows = () => ids(screen.getByTestId('game-body'));
  const ready = rows();
  expect(ready).toContain('voice-status');
  await pressStart();
  expect(rows()).toEqual(ready);
  for (let t = 0; t < 10_000 && host.speaking; t += 100) {
    await wait(100);
    expect(rows()).toEqual(ready);
  }
  await type('bambaşka bir şey');
  expect(screen.getByTestId('reveal')).toBeOnTheScreen();
  expect(rows()).toEqual(ready);
  for (let t = 0; t < 15_000 && screen.queryByTestId('reveal'); t += 100) {
    await wait(100);
    expect(rows()).toEqual(ready);
  }
  expect(screen.queryByTestId('reveal')).toBeNull();
  expect(rows()).toEqual(ready);
});

// ---------------------------------------------------------------- #331

test('#331: several players on one phone, a "Sıra: <name>" screen between turns started by a tap, each with their own clock and ring', async () => {
  await match();
  expect(screen.queryByTestId('clue')).toBeNull();
  await startTurn();
  expect(screen.getByTestId('turn-player')).toHaveTextContent('AYŞE');
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');
  const ayseA = clueText();
  await type(answerNow());
  await wait(5000);
  await fireEvent.press(screen.getByLabelText('Pas'));
  await fireEvent.press(await screen.findByTestId('next-player'));

  expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Bora');
  expect(screen.queryByTestId('clue')).toBeNull();
  await startTurn();
  expect(screen.getByTestId('turn-player')).toHaveTextContent('BORA');
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  expect(clueText()).not.toBe(ayseA);
  await fireEvent.press(screen.getByLabelText('Pas'));
  await fireEvent.press(await screen.findByTestId('next-player'));

  expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Ayşe');
  await startTurn();
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('B harfi, pas')).toBeOnTheScreen();
  expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();
  expect(screen.getByTestId('clock')).toHaveTextContent(/^02:5\d$/);
});

// ---------------------------------------------------------------- #338

test.each([['voice off', false], ['voice on', true]])(
  '#338: after Pas or a wrong answer the screen jumps to the next player far too fast — it shows Pas / Yanlış with the right answer and waits for "Sıradaki oyuncu" (%s)',
  async (_, voice) => {
    await match(voice);
    await startTurn(voice);
    await type('pas');
    expect(await screen.findByTestId('turn-result')).toHaveTextContent('Pas');
    await wait(30_000);
    expect(screen.getByTestId('turn-result')).toHaveTextContent('Pas');
    expect(screen.queryByTestId('handover')).toBeNull();
    expect(screen.getByTestId('turn-score')).toHaveProp('accessibilityLabel', 'Ayşe: 0 doğru, 0 yanlış, 1 pas');
    await fireEvent.press(screen.getByText('Sıradaki oyuncu: Bora'));

    expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Bora');
    await startTurn(voice);
    for (let t = 0; t < 10_000 && !screen.queryByTestId('clue'); t += 50) await wait(50);
    const right = answerNow();
    await type('bambaşka bir şey');
    expect(await screen.findByTestId('turn-result', {}, { timeout: 20_000 })).toHaveTextContent(`Yanlış — doğru cevap: ${right}`);
    await wait(30_000);
    expect(screen.getByTestId('turn-result')).toBeOnTheScreen();
    expect(screen.queryByTestId('handover')).toBeNull();
    await fireEvent.press(screen.getByText('Sıradaki oyuncu: Ayşe'));
    expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Ayşe');
  },
);

test('#338: single player is unchanged — no hand-over card after a Pas or a wrong answer', async () => {
  await single();
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(screen.queryByTestId('turn-result')).toBeNull();
  expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
  await type('bambaşka bir şey');
  await untilRevealEnds();
  expect(screen.queryByTestId('turn-result')).toBeNull();
  expect(screen.queryByTestId('next-player')).toBeNull();
  expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();
});

// ---------------------------------------------------------------- #341

test.each([['camera on', true], ['camera off', false]])(
  '#341: the face sits small inside the ring — the camera picture is a big square filling the ring, the letters drawn over the head and the bottom ones over the shoulders (%s)',
  async (_, on) => {
    if (on) cameraOn();
    await single();
    await layoutStage(KEYBOARD_DOWN);
    const s = sizes();
    expect(s.square).toEqual(s.ring);
    expect(style('face').borderRadius).toBeLessThan((s.ring[0] as number) / 4);  // a square, not a circle
    if (on) {
      expect([style('camera-preview').width, style('camera-preview').height]).toEqual(s.ring);
      expect(screen.getByTestId('camera-preview').props.resizeMode).toBe('cover');
    } else {
      expect(screen.getByTestId('face-placeholder')).toBeOnTheScreen();
    }
    // The square is the ring's first child: every letter is painted over it.
    const [under, ...over] = screen.getByTestId('ring').children as Node[];
    expect(within(under).getByTestId('face')).toBeOnTheScreen();
    expect(over.every((c) => /^letter-/.test(c.props.testID))).toBe(true);
    expect(over).toHaveLength(28);
    const size = s.ring[0] as number;
    for (const l of ['K', 'L', 'M', 'N']) expect((style(`letter-${l}`).top as number) / size).toBeGreaterThan(0.75);
  },
);

test('#341: keyboard up/down, the clock ticking and multiplayer turns do not resize or move the square or the ring', async () => {
  await match(false, ['Ayşe', 'Bora']);
  let first: { down: ReturnType<typeof sizes>; up: ReturnType<typeof sizes> } | null = null;
  for (const name of ['Ayşe', 'Bora', 'Ayşe']) {
    expect(await screen.findByTestId('handover')).toHaveTextContent(`Sıra: ${name}`);
    await startTurn();
    await layoutStage(KEYBOARD_DOWN);
    const down = sizes();
    await layoutStage(KEYBOARD_UP);
    const up = sizes();
    expect(up.square).toEqual(up.ring);
    expect(down.square).toEqual(down.ring);
    if (first) expect({ down, up }).toEqual(first);
    else first = { down, up };
    for (let i = 0; i < 4; i++) {
      await layoutStage(i % 2 ? KEYBOARD_UP : KEYBOARD_DOWN);
      await wait(200);
      expect(sizes()).toEqual(i % 2 ? first.up : first.down);
    }
    await fireEvent.press(screen.getByLabelText('Pas'));
    await fireEvent.press(await screen.findByTestId('next-player'));
  }
});

// ---------------------------------------------------------------- #343

// What would suggest an account or online play.
const ACCOUNT = /apple|google|giriş|misafir|hesap|profil|oda|kodunu|günün turu|login|sign.?in/i;

test('#343: there will be no login — no Apple/Google/login/misafir text, no rooms, no Profil anywhere; the menu shows only what works', async () => {
  for (const [url, marker] of [
    ['/', 'HARFİYEN'],
    ['/menu', 'Hızlı oyun'],
    ['/settings', 'Ayarlar'],
    ['/category', 'Kategori seç'],
    ['/levels?cats=tarih', 'BÖLÜM HARİTASI'],
    ['/multi', 'Çok oyunculu'],
    ['/game?cats=tarih&level=1', 'Hazır mısın?'],
    [`/match?names=${encodeURIComponent(JSON.stringify(['Ece', 'Fırat']))}&cats=tarih&level=1`, 'Sıra: Ece'],
  ]) {
    await renderRouter('./src/app', { initialUrl: url });
    expect((await screen.findAllByText(marker)).length).toBeGreaterThan(0);
    expect([url, screen.queryAllByText(ACCOUNT).length, screen.queryAllByLabelText(ACCOUNT).length]).toEqual([url, 0, 0]);
  }
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByTestId('intro-start')).toHaveTextContent('Başla');
  expect(screen.getAllByRole('button')).toHaveLength(1);
  await renderRouter('./src/app', { initialUrl: '/menu' });
  expect(await screen.findByText('KARİYER · TEK OYUNCU')).toBeOnTheScreen();
  expect(screen.getByText('Çok oyunculu')).toBeOnTheScreen();
  expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel ?? t.props.children)).toHaveLength(3);
  for (const tab of ['Ana sayfa', 'Kategoriler', 'Ayarlar']) expect(screen.getByRole('tab', { name: tab })).toBeOnTheScreen();
});

test('#343: oyunda klavye açılınca bir daha kapatılamıyor — a tap anywhere off the keyboard closes it, and the buttons still work in one tap', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  await single();
  await fireEvent(screen.getByTestId('answer'), 'focus');
  dismiss.mockClear();
  await fireEvent.press(screen.getByTestId('ring-area'));
  expect(dismiss).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('clue'));
  expect(dismiss).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByTestId('clock'));
  expect(dismiss).toHaveBeenCalledTimes(3);
  dismiss.mockClear();
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(screen.getByLabelText('A harfi, pas')).toBeOnTheScreen();
  expect(dismiss).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------- #356

describe.each([['voice off', false], ['voice on', true]])('#356 (%s)', (_, voice) => {
  test('#356 (ad76435): answering by typing and getting it wrong, the game does not move to the next question — it hangs (single player)', async () => {
    await single(voice);
    for (let i = 0; i < 4; i++) {
      await wait([0, 300, 1200, 2500][i]);
      const q = question(clueText());
      await type('bambaşka bir şey');
      expect(screen.getByLabelText(`${q.letter} harfi, yanlış`)).toBeOnTheScreen();
      expect(screen.getByTestId('reveal')).toHaveTextContent(`Doğru cevap: ${q.answers[0]}`, { exact: false });
      expect(sounds.played).toContain('wrong');
      await untilRevealEnds();
      expect(screen.queryByTestId('reveal')).toBeNull();
      for (let t = 0; t < 10_000 && !screen.queryByTestId('clue'); t += 50) await wait(50);
      expect(question(clueText()).letter).not.toBe(q.letter);
    }
    // The round goes on: typed right and typed "pas" count.
    const q = question(clueText());
    await type(q.answers[0]);
    expect(screen.getByLabelText(`${q.letter} harfi, doğru`)).toBeOnTheScreen();
  });

  test('#356 (ad76435): answering by typing and getting it wrong, the game hangs (multiplayer: the result card comes)', async () => {
    await match(voice, ['Ece', 'Fırat']);
    await startTurn(voice);
    for (let t = 0; t < 10_000 && !screen.queryByTestId('clue'); t += 50) await wait(50);
    await type('xyzzy');
    expect(await screen.findByTestId('turn-result', {}, { timeout: 20_000 })).toHaveTextContent(/^Yanlış — doğru cevap: /);
  });
});

test('#356: each clue should start with a big letter showing which letter the answer starts with', async () => {
  await single();
  for (const stage of [KEYBOARD_DOWN, KEYBOARD_UP]) {
    await layoutStage(stage);
    const height = sizes().question;
    for (let i = 0; i < 3; i++) {
      const letter = screen.getByTestId('clue-letter');
      const active = screen.getByLabelText(/harfi, sırada$/).props.accessibilityLabel.split(' ')[0];
      expect(letter).toHaveTextContent(active);
      expect(question(clueText()).letter).toBe(active);
      const big = StyleSheet.flatten(letter.props.style);
      expect(big.fontFamily).toBe(F.display);
      expect(big.fontSize).toBeGreaterThanOrEqual(2.5 * (style('clue').fontSize as number));
      expect(within(screen.getByTestId('question')).getByTestId('clue-letter')).toBe(letter);
      expect(sizes().question).toBe(height);
      await type(answerNow());
    }
  }
});

test('#356: after the keyboard is closed, the layout stays as if the keyboard were still open and does not come back', async () => {
  cameraOn();
  await single();
  await act(() => fireEvent(screen.getByTestId('game-keyboard'), 'layout', { persist() {}, nativeEvent: { layout: { x: 0, y: 0, width: 440, height: SCREEN_H } } }));
  await layoutStage(KEYBOARD_DOWN);
  await faceAt(30, 230, 180, 120);
  await wait(600);
  const down = sizes();
  const cam = crop();
  expect(keyboardPadding()).toBe(0);
  for (const height of [336, 290]) {
    await emitKeyboard('keyboardWillShow', keyboardEvent(height));
    expect(keyboardPadding()).toBe(height);
    await layoutStage({ width: 440, height: KEYBOARD_DOWN.height - height });
    expect(sizes().ring[0]).toBeLessThan(down.ring[0] as number);
    // Closed by a tap outside, by Return, or after an answer: the same way back.
    await type(answerNow());
    await emitKeyboard('keyboardWillHide', keyboardEvent(height));
    expect(keyboardPadding()).toBe(0);
    await layoutStage(KEYBOARD_DOWN);
    await faceAt(30, 230, 180, 120);
    await wait(600);
    expect(sizes()).toEqual(down);
    const now = crop();
    expect(Math.abs(now.x - cam.x)).toBeLessThan(0.5);
    expect(Math.abs(now.y - cam.y)).toBeLessThan(0.5);
    expect(Math.abs(now.scale - cam.scale)).toBeLessThan(0.01);
  }
});

// ---------------------------------------------------------------- #359

test('#359: the clue is not visible before it is read; it appears at the moment the host starts reading it, for every question', async () => {
  await setSettings({ voice: true });
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Başla'));
  // Whenever a clue is on screen, the host has started reading that very clue;
  // until then the clue area waits, with no letter and no active bubble.
  const check = () => {
    if (screen.queryByTestId('clue')) {
      expect(host.said).toContain(said(clueLine(question(clueText()))));
      return true;
    }
    // A wrong answer's reveal holds the clue block until the next reading.
    if (screen.queryByTestId('reveal')) return false;
    expect(screen.getByTestId('clue-waiting')).toBeOnTheScreen();
    expect(screen.queryByTestId('clue-letter')).toBeNull();
    expect(screen.queryByLabelText(/harfi, sırada$/)).toBeNull();
    return false;
  };
  let waited = 0;
  for (let t = 0; t < 10_000 && !check(); t += 10) { await wait(10); waited++; }
  expect(waited).toBeGreaterThan(0);
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  // The next questions, after a right answer, a Pas and a wrong one.
  for (const answer of [() => answerNow(), () => 'pas', () => 'bambaşka bir şey']) {
    const letter = question(clueText()).letter;
    for (let t = 0; t < 10_000 && host.speaking; t += 50) await wait(50);
    await type(answer());
    for (let t = 0; t < 20_000 && !(check() && question(clueText()).letter !== letter); t += 10) await wait(10);
    expect(question(clueText()).letter).not.toBe(letter);
  }
});

test('#359: in typed mode / voice off the clue appears immediately', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await fireEvent.press(await screen.findByText('Başla'));
  expect(screen.queryByTestId('clue-waiting')).toBeNull();
  expect(screen.getByTestId('clue')).toBeOnTheScreen();
  await type(answerNow());
  expect(question(clueText()).letter).toBe('B');
});

// ---------------------------------------------------------------- #363

test.each([['camera off', false], ['camera on', true]])(
  '#363: soft blue light rays radiating outward from behind the ring, a blue glow halo and a thin dashed inner circle (%s)',
  async (_, on) => {
    if (on) cameraOn();
    await single();
    await layoutStage(KEYBOARD_DOWN);
    // The rays come before the ring, so the square and the letters are painted over them.
    expect(ids(screen.getByTestId('ring-area'))).toEqual(['ring-rays', 'ring']);
    expect(screen.getByTestId('ring-rays').props.pointerEvents).toBe('none');
    const size = sizes().ring[0] as number;
    const radius = ringRadius(size, Math.round(size * 0.079));
    expect(StyleSheet.flatten((screen.getByTestId('ring-rays').children[0] as Node).props.style).width).toBeGreaterThan(size);
    // The halo over the picture and under the letters.
    const [middle, ...letters] = screen.getByTestId('ring').children as Node[];
    expect(ids(middle)).toEqual(['face', 'ring-glow']);
    expect(within(middle).getByTestId(on ? 'face-camera' : 'face-placeholder')).toBeOnTheScreen();
    expect(letters.every((l) => /^letter-/.test(l.props.testID))).toBe(true);
    expect(style('ring-dash')).toMatchObject({ borderStyle: 'dashed', borderWidth: 2, width: Math.round(2 * 0.85 * radius) });
  },
);

// ---------------------------------------------------------------- #389

test('#389: remove the line/stripe and the colour glow inside the round\'s letters — flat discs, the active one still stands apart', async () => {
  await single();
  await type(answerNow());                                  // A right
  await fireEvent.press(screen.getByLabelText('Pas'));      // B passed
  await type('bambaşka bir şey');                           // C wrong
  await fireEvent.press(screen.getByTestId('reveal'));
  for (const label of ['A harfi, doğru', 'B harfi, pas', 'C harfi, yanlış', 'Ç harfi, sırada', 'Z harfi, bekliyor']) {
    expect(screen.getByLabelText(label)).toBeOnTheScreen();
  }
  const colours = new Set<string>();
  for (const l of ['A', 'B', 'C', 'Ç', 'D', 'Z']) {
    const st = style(`letter-${l}`);
    expect([l, st.backgroundImage, st.boxShadow, st.experimental_backgroundImage]).toEqual([l, undefined, undefined, undefined]);
    expect(typeof st.backgroundColor).toBe('string');
    colours.add(st.backgroundColor as string);
  }
  expect(colours.size).toBe(5);  // right, passed, wrong, active and waiting all differ
  expect(style('letter-Ç')).toMatchObject({ backgroundColor: '#ffffff', borderColor: '#0a0d1f' });
  // The background light of #363 stays.
  expect(screen.getByTestId('ring-rays')).toBeOnTheScreen();
  expect(screen.getByTestId('ring-glow')).toBeOnTheScreen();
});
