import type { CategoryFile } from '../data/questions';

// For jest.mock('../data/questions'): the real question module with each named
// category cut down to the given levels, so tests do not depend on how many
// levels have been written so far. `[]` makes a category with no questions.
export function mockQuestions(levels: Record<string, number[]>) {
  const actual = jest.requireActual('../data/questions');
  const CATEGORIES: CategoryFile[] = actual.CATEGORIES.map((c: CategoryFile) =>
    levels[c.category] ? { ...c, levels: c.levels.filter((l) => levels[c.category].includes(l.level)) } : c,
  );
  return { ...actual, CATEGORIES };
}
