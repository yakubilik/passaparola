import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { audio } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { pressStart } from '../test-utils/round';
import { DEFAULT_GAIN, FADE_IN_MS, HOST_VOLUME } from '../voice/sounds';
import { host, listener } from '../voice/engine';
import { ECHO_TAIL_MS } from '../voice/listener';
import { CUE_LEAD_MS } from '../voice/sounds';

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
  host.cancel();
  listener.release();  // a mic still closing after the last test's screen went
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

  await pressStart();
  // The recognizer was told to expect the pass words and the round's answers,
  // short ones first, as a short-phrase ('search') request.
  expect(rec.lastOptions.contextualStrings.slice(0, 3)).toEqual(['pas', 'geç', 'pas geçiyorum']);
  expect(rec.lastOptions.contextualStrings).toEqual(expect.arrayContaining(['Ay', 'Su', 'Un']));
  expect(rec.lastOptions).toMatchObject({ iosTaskHint: 'search', addsPunctuation: false, requiresOnDeviceRecognition: true });

  // A, while the host is still reading it: "ay" alone.
  expect(host.speaking).toBe(true);
  await act(async () => { jest.advanceTimersByTime(FADE_IN_MS); });  // the round's first line fades in
  expect(host.volume).toBeCloseTo(HOST_VOLUME * DEFAULT_GAIN);
  await act(() => rec.hear('ay'));
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();

  // B, after the reading: "su" alone, in the same request.
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 100);
  await act(() => rec.hear('su'));
  expect(screen.getByLabelText('B harfi, doğru')).toBeOnTheScreen();

  // C: "un" alone, after "ay su" in the same growing result. (A short word
  // glued onto an earlier one is covered in listener.test.ts.)
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 100);
  await act(() => rec.hear('un'));
  expect(screen.getByLabelText('C harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('3 doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('0 yanlış')).toBeOnTheScreen();

  // The host is reading Ç (a moment after the cue) with the mic open: still at full volume.
  await act(() => jest.advanceTimersByTime(CUE_LEAD_MS + 10));
  expect(host.speaking).toBe(true);
  await act(async () => { jest.advanceTimersByTime(FADE_IN_MS); });  // the round's first line fades in
  expect(host.volume).toBeCloseTo(HOST_VOLUME * DEFAULT_GAIN);
  expect(rec.starts).toBe(1);  // one request for the round
  expect(rec.aborts).toBe(0);
  expect(audio.sessionCalls.filter((c) => c === 'mode')).toEqual(['mode']);
});
