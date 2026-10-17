import AsyncStorage from '@react-native-async-storage/async-storage';

import { PASS_MARK } from '../game/round';

export const PROGRESS_KEY = 'harfiyen.progress.v1';

// Single-player career. Levels unlock per category: finishing level n with
// PASS_MARK or more correct opens n+1 in every category that was played.
export type Progress = {
  unlocked: Record<string, number>;
  best: Record<string, Record<string, number>>;
  last: { cats: string[]; level: number } | null;
};

export const EMPTY_PROGRESS: Progress = { unlocked: {}, best: {}, last: null };

export function unlockedLevel(p: Progress, cat: string): number {
  return p.unlocked[cat] ?? 1;
}

// A level of a selection is open when it is open in every chosen category.
export function selectionUnlocked(p: Progress, cats: string[]): number {
  return cats.length ? Math.min(...cats.map((c) => unlockedLevel(p, c))) : 1;
}

export function bestScore(p: Progress, cats: string[], level: number): number | undefined {
  const scores = cats.map((c) => p.best[c]?.[level]).filter((s): s is number => s != null);
  return scores.length === cats.length && scores.length ? Math.min(...scores) : undefined;
}

export function recordRound(p: Progress, cats: string[], level: number, correct: number): Progress {
  const unlocked = { ...p.unlocked };
  const best = { ...p.best };
  const passed = correct >= PASS_MARK;
  for (const c of cats) {
    best[c] = { ...best[c], [level]: Math.max(best[c]?.[level] ?? 0, correct) };
    if (passed) unlocked[c] = Math.max(unlockedLevel(p, c), level + 1);
  }
  return { unlocked, best, last: { cats, level: passed ? level + 1 : level } };
}

export async function loadProgress(): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const p = JSON.parse(raw);
    return { unlocked: p.unlocked ?? {}, best: p.best ?? {}, last: p.last ?? null };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export async function saveProgress(p: Progress): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Storage full or unavailable: the round still counts for this session.
  }
}
