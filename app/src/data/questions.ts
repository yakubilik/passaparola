// The question files (format in docs/questions.md). Metro bundles them, so a
// new category needs a line here as well as its JSON file.
import bilim from '../../assets/questions/bilim.json';
import cografya from '../../assets/questions/cografya.json';
import sanat from '../../assets/questions/sanat.json';
import spor from '../../assets/questions/spor.json';
import tarih from '../../assets/questions/tarih.json';
import { LETTERS } from '../game/letters';

// Every answer starts with its letter; there is no other kind of question.
export type QuestionType = 'starts';

export type Question = {
  id: string;
  letter: string;
  type: QuestionType;
  clue: string;
  answers: string[];
};

export type Level = { level: number; questions: Question[] };

export type CategoryFile = { category: string; title: string; levels: Level[] };

export const CATEGORIES: CategoryFile[] = [tarih, cografya, bilim, sanat, spor] as CategoryFile[];

export function categoryById(id: string, bank: CategoryFile[] = CATEGORIES): CategoryFile | undefined {
  return bank.find((c) => c.category === id);
}

// A level is playable when every ring letter has at least one question.
export function levelIsPlayable(cat: CategoryFile, level: number): boolean {
  const lv = cat.levels.find((l) => l.level === level);
  if (!lv) return false;
  return LETTERS.every((letter) => lv.questions.some((q) => q.letter === letter));
}

export function playableLevels(cat: CategoryFile): number[] {
  return cat.levels.map((l) => l.level).filter((n) => levelIsPlayable(cat, n)).sort((a, b) => a - b);
}

export function hasQuestions(cat: CategoryFile): boolean {
  return playableLevels(cat).length > 0;
}
