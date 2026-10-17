import AsyncStorage from '@react-native-async-storage/async-storage';

import { bestScore, EMPTY_PROGRESS, loadProgress, PROGRESS_KEY, recordRound, saveProgress, selectionUnlocked, unlockedLevel } from '../progress';

beforeEach(() => AsyncStorage.clear());

test('only level 1 is open at first', () => {
  expect(unlockedLevel(EMPTY_PROGRESS, 'tarih')).toBe(1);
});

test('18 correct opens the next level, 17 does not', () => {
  const fail = recordRound(EMPTY_PROGRESS, ['tarih'], 1, 17);
  expect(unlockedLevel(fail, 'tarih')).toBe(1);
  const pass = recordRound(fail, ['tarih'], 1, 18);
  expect(unlockedLevel(pass, 'tarih')).toBe(2);
  expect(bestScore(pass, ['tarih'], 1)).toBe(18);
  // Replaying an old level never closes a later one.
  expect(unlockedLevel(recordRound({ ...pass, unlocked: { tarih: 5 } }, ['tarih'], 1, 20), 'tarih')).toBe(5);
});

test('levels unlock per category; a mixed selection opens as far as its slowest category', () => {
  let p = recordRound(EMPTY_PROGRESS, ['tarih'], 1, 20);
  expect(selectionUnlocked(p, ['tarih', 'spor'])).toBe(1);
  p = recordRound(p, ['tarih', 'spor'], 1, 19);
  expect(selectionUnlocked(p, ['tarih', 'spor'])).toBe(2);
});

test('progress survives a restart through AsyncStorage', async () => {
  const p = recordRound(EMPTY_PROGRESS, ['tarih'], 1, 22);
  await saveProgress(p);
  expect(JSON.parse((await AsyncStorage.getItem(PROGRESS_KEY))!)).toEqual(p);
  expect(await loadProgress()).toEqual(p);
});

test('missing or broken storage starts fresh', async () => {
  expect(await loadProgress()).toEqual(EMPTY_PROGRESS);
  await AsyncStorage.setItem(PROGRESS_KEY, '{not json');
  expect(await loadProgress()).toEqual(EMPTY_PROGRESS);
});
