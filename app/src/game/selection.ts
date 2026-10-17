import { CATEGORIES, hasQuestions, levelIsPlayable, type CategoryFile } from '../data/questions';

// Route parameter for the chosen categories: "tarih,spor" or "karisik".
export const MIXED = 'karisik';

export function parseCats(param: string | string[] | undefined, bank: CategoryFile[] = CATEGORIES): string[] {
  const raw = Array.isArray(param) ? param.join(',') : param ?? '';
  if (raw === MIXED) return bank.filter(hasQuestions).map((c) => c.category);
  const ids = raw.split(',').filter(Boolean);
  return bank.filter((c) => ids.includes(c.category)).map((c) => c.category);
}

export function selectionTitle(param: string | string[] | undefined, bank: CategoryFile[] = CATEGORIES): string {
  const raw = Array.isArray(param) ? param.join(',') : param ?? '';
  if (raw === MIXED) return 'Karışık';
  return parseCats(raw, bank).map((id) => bank.find((c) => c.category === id)!.title).join(' · ');
}

// A level of a selection can be played when at least one chosen category has
// it; the round then draws each letter from those that do.
export function selectionHasLevel(cats: string[], level: number, bank: CategoryFile[] = CATEGORIES): boolean {
  return bank.some((c) => cats.includes(c.category) && levelIsPlayable(c, level));
}

export function difficulty(level: number): string {
  return ['Kolay', 'Orta', 'Zor'][level - 1] ?? 'Çok zor';
}

// How many levels the map shows: the ones written so far plus a few
// "yakında" stops ahead, at least eight.
export function mapLength(cats: string[], bank: CategoryFile[] = CATEGORIES): number {
  const max = Math.max(0, ...bank.filter((c) => cats.includes(c.category)).flatMap((c) => c.levels.map((l) => l.level)));
  return Math.max(8, max + 3);
}
