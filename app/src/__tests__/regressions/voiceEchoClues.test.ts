import { CATEGORIES } from '../../data/questions';
import { ALL_QUESTIONS, corpus, show } from '../../test-utils/echoCorpus';
import { clueLine } from '../../voice/lines';

// #391, the clue lines (the host lines and the "-cevap" lines are in
// voiceEcho.test.ts): heard by the iOS-like recognizer while the host reads
// them and inside the hostRecent window after: no verdict of any kind.

jest.setTimeout(900_000);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('every clue line, whole and cut in half: no verdict', () => {
  const { hits, runs, indistinguishable } = corpus(ALL_QUESTIONS.map((q) => ({ text: clueLine(q).text, asked: [q] })), Infinity);
  expect(runs).toBe(ALL_QUESTIONS.length * 4);
  expect(show(indistinguishable)).toBe('');
  expect(show(hits)).toBe('');
});

// Every word of every eighth clue of each category level misheard and split in
// turn (every clue would be minutes of runs).
test('clue lines, a per-category sample with each word misheard and split in turn: no verdict', () => {
  const sample = CATEGORIES.flatMap((c) => c.levels.flatMap((lv) => lv.questions.filter((_, i) => i % 8 === 0)));
  expect(new Set(sample.map((q) => q.id.split('-')[0])).size).toBe(CATEGORIES.length);
  const { hits, runs, indistinguishable } = corpus(sample.map((q) => ({ text: clueLine(q).text, asked: [q] })));
  expect(runs).toBeGreaterThan(2500);
  expect(indistinguishable.length).toBeLessThan(runs / 100);
  expect(show(hits)).toBe('');
});
