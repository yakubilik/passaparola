import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { audio } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { host } from '../voice/engine';
import { ECHO_TAIL_MS } from '../voice/listener';

// One-syllable answers ("Ay", "Su", "Un") said on their own: the real
// questions, with the answers for A, B and C swapped for short ones.
jest.mock('../data/questions', () => {
  const mocked = require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] });
  const short: Record<string, string> = { A: 'Ay', B: 'Su', C: 'Un' };
  return {
    ...mocked,
    CATEGORIES: mocked.CATEGORIES.map((c: any) => ({
      ...c,
      levels: c.levels.map((l: any) => ({
        ...l,
        questions: l.questions.map((q: any) => (short[q.letter] ? { ...q, answers: [short[q.letter]] } : q)),
      })),
    })),
  };
});

jest.setTimeout(180_000);

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
async function untilHostQuiet() {
  for (let i = 0; i < 40 && host.speaking; i++) await wait(250);
  expect(host.speaking).toBe(false);
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  rec.reset();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('"ay", "su" and "un" said alone count at once, while the host reads and after; the host stays at full volume', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  // The session is put in the mic's category before any sound plays (theme included),
  // so opening the mic later changes nothing about how loud the game is.
  expect(rec.categoryAfterPlays).toEqual([0]);

  await fireEvent.press(screen.getByText('Başla'));
  // The recognizer was told to expect this round's answers, short ones first.
  const context: string[] = rec.lastOptions.contextualStrings;
  expect(context.slice(0, 6)).toEqual(['pas', 'geç', 'pas geçiyorum', 'Ay', 'Su', 'Un']);

  // A, while the host is still reading it: "ay" alone.
  expect(host.speaking).toBe(true);
  expect(host.volume).toBe(1);
  await act(() => rec.hear('ay'));
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();

  // B, after the reading: "su" alone.
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 100);
  await act(() => rec.hear('su'));
  expect(screen.getByLabelText('B harfi, doğru')).toBeOnTheScreen();

  // C: iOS glues "un" onto the last word instead of adding a new one.
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 100);
  await act(() => rec.rewrite('ay suun'));
  expect(screen.getByLabelText('C harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('3 doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('0 yanlış')).toBeOnTheScreen();

  // The host is reading Ç with the mic open: still at full volume.
  expect(host.speaking).toBe(true);
  expect(host.volume).toBe(1);
  expect(rec.starts).toBe(1);
  expect(audio.sessionCalls.filter((c) => c === 'mode')).toEqual(['mode']);
});
