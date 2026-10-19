import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { REVEAL_MAX_MS, REVEAL_MS } from '../game/useRound';
import { SETTINGS_KEY } from '../store/settings';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { pressStart, settle } from '../test-utils/round';
import { host, listener, sounds } from '../voice/engine';
import { answerLine, host as hostLine, type Line } from '../voice/lines';

// Typed answers, wrong, right and "pas", move the round on exactly as spoken
// ones do, with the voice on and off, alone and in a match. A wrong answer's
// reveal waits for the host to say the right one, and must end even when the
// host's lines are cut off or never come (it used to hang there for good).
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(180_000);

function question(clue: string) {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q;
  throw new Error('no question with clue ' + clue);
}

function clueText(): string {
  const kids = screen.getByTestId('clue').props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids);
}

const said = (l: Line) => (host.hasClip(l.key!) ? `clip:${l.key}` : `tts:${l.text}`);
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

async function type(text: string) {
  const input = screen.getByTestId('answer');
  await fireEvent.changeText(input, text);
  await fireEvent(input, 'submitEditing');
}

// Waits (on jest's clock) until the wrong answer's reveal is gone, at most `max` ms.
async function untilRevealEnds(max = 10_000) {
  for (let t = 0; t < max && screen.queryByTestId('reveal'); t += 250) await wait(250);
}

const appState = new Set<(s: AppStateStatus) => void>();
async function goTo(state: AppStateStatus) {
  await act(() => appState.forEach((h) => h(state)));
}

beforeEach(async () => {
  jest.useFakeTimers();
  appState.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
    appState.add(h as (s: AppStateStatus) => void);
    return { remove: () => appState.delete(h as (s: AppStateStatus) => void) } as ReturnType<typeof AppState.addEventListener>;
  });
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  host.cancel();
  listener.release();  // a mic still closing after the last test's screen went
  rec.reset();
  sounds.played.length = 0;
  host.said.length = 0;
  await AsyncStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function single(voice: boolean) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await pressStart();
}

describe.each([['voice on', true], ['voice off', false]])('single player, %s', (_, voice) => {
  test('typed wrong: the right answer is shown (and said), the cue plays, the next letter comes', async () => {
    await single(voice);
    const a = question(clueText());
    await wait(1500);
    host.said.length = 0;
    await type('bambaşka bir şey');
    expect(screen.getByLabelText('A harfi, yanlış')).toBeOnTheScreen();
    expect(screen.getByTestId('reveal')).toHaveTextContent(`Doğru cevap: ${a.answers[0]}`, { exact: false });
    expect(sounds.played).toContain('wrong');
    await untilRevealEnds();
    expect(screen.queryByTestId('reveal')).toBeNull();
    if (voice) expect(host.said.slice(0, 2)).toEqual([said(hostLine('wrong')), said(answerLine(a))]);
    expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
    expect(screen.getByTestId('clue-letter')).toHaveTextContent('B');
    expect(question(clueText()).letter).toBe('B');
    // And the round goes on: the next typed answer counts.
    await type(question(clueText()).answers[0]);
    expect(screen.getByLabelText('B harfi, doğru')).toBeOnTheScreen();
  });

  test('typed right and typed "pas" move on at once', async () => {
    await single(voice);
    await type(question(clueText()).answers[0]);
    expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
    expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
    await type('pas');
    expect(screen.getByLabelText('B harfi, pas')).toBeOnTheScreen();
    expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();
    expect(sounds.played).toEqual(expect.arrayContaining(['correct', 'pas']));
  });

  test('typed wrong, many times in a row, typed at any moment of the reading: never stuck', async () => {
    await single(voice);
    const gaps = [0, 50, 150, 300, 450, 700, 1000, 1500, 2500];
    for (let i = 0; i < 9; i++) {
      await wait(gaps[i]);
      const letter = question(clueText()).letter;
      await type('xyzzy');
      expect(screen.getByLabelText(`${letter} harfi, yanlış`)).toBeOnTheScreen();
      await untilRevealEnds();
      expect(screen.queryByTestId('reveal')).toBeNull();
      expect(question(clueText()).letter).not.toBe(letter);
    }
  });
});

describe('the reveal never waits for host lines that are not coming', () => {
  // A trip to the background (a call, Control Centre, a notification) cuts the
  // host off; before the fix the reveal held on to the lost lines for good.
  test.each([
    ['before the host starts the right answer', 100],
    ['while the host says the right answer', 1000],
  ])('the app goes away %s', async (_, at) => {
    await single(true);
    await type('xyzzy');
    await wait(at);
    await goTo('inactive');
    await wait(300);
    await goTo('active');
    await settle();
    await untilRevealEnds();
    expect(screen.queryByTestId('reveal')).toBeNull();
    expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
    await type(question(clueText()).answers[0]);
    expect(screen.getByLabelText('B harfi, doğru')).toBeOnTheScreen();
  });

  test('a host that never reports the end of the right answer: the reveal ends after REVEAL_MAX_MS', async () => {
    await single(true);
    const speak = host.speak.bind(host);
    jest.spyOn(host, 'speak').mockImplementation((lines, done, cut) => {
      if (lines.some((l) => l.key === hostLine('wrong').key)) return;  // never done, never cut
      speak(lines, done, cut);
    });
    await type('xyzzy');
    await wait(REVEAL_MS + 2000);
    expect(screen.getByTestId('reveal')).toBeOnTheScreen();
    await wait(REVEAL_MAX_MS);
    expect(screen.queryByTestId('reveal')).toBeNull();
    expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
  });
});

describe.each([['voice on', true], ['voice off', false]])('multiplayer, %s', (_, voice) => {
  async function match() {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice, micChecked: true }));
    await renderRouter('./src/app', { initialUrl: `/match?names=${encodeURIComponent(JSON.stringify(['Ece', 'Fırat']))}&cats=tarih&level=1&seed=5` });
    expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Ece');
    await settle();
    await fireEvent.press(screen.getByText('Başla'));
    await settle();
  }

  test('typed right moves to the next letter, typed wrong ends the turn on the result card with the right answer', async () => {
    await match();
    await type(question(clueText()).answers[0]);
    expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
    expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();
    const b = question(clueText());
    await wait(1200);
    host.said.length = 0;
    await type('bambaşka bir şey');
    expect(screen.getByTestId('reveal')).toHaveTextContent(`Doğru cevap: ${b.answers[0]}`, { exact: false });
    expect(sounds.played).toContain('wrong');
    expect(await screen.findByTestId('turn-result', {}, { timeout: 10_000 })).toHaveTextContent(`Yanlış — doğru cevap: ${b.answers[0]}`);
    if (voice) expect(host.said).toEqual([said(answerLine(b))]);
    await fireEvent.press(screen.getByText('Sıradaki oyuncu: Fırat'));
    expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Fırat');
  });

  test('typed "pas" ends the turn on the result card', async () => {
    await match();
    await type('pas');
    expect(await screen.findByTestId('turn-result')).toHaveTextContent('Pas');
    expect(sounds.played).toContain('pas');
  });

  test('typed wrong at once, while the first clue is read: the turn still ends', async () => {
    await match();
    await type('xyzzy');
    expect(await screen.findByTestId('turn-result', {}, { timeout: 10_000 })).toHaveTextContent(/^Yanlış/);
  });
});
