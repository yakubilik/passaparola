import { CATEGORIES } from '../../data/questions';
import { finalRights, judgeHeard, judgeSpoken, letterRun, norm } from '../normalize';

// #478: a short word iOS cannot spell comes as its first letter written over
// and over ("ÇÇÇÇ" for Çığ, Yakup's iPhone on 23 Oct 2026). Such a run is
// the answer only to a short answer (two or three letters) starting with
// that letter; a lone letter is never an answer.
const ALL = CATEGORIES.flatMap((c) => c.levels.flatMap((l) => l.questions));
const RUNS = [' ÇÇÇÇ', ' ÇÇÇÇÇ', ' ÇÇÇÇÇÇ'];
const FINAL = [' ÇÇÇÇÇÇ', ' ÇÇÇÇCÇÇ', ' ÇÇÇÇÇ'];

test('the phone\'s Çığ shapes are right for Çığ, on the interim and on the final, over the host or not', () => {
  for (const alts of [...RUNS.map((r) => [r]), FINAL]) {
    expect(judgeSpoken(alts, ['Çığ'])).toBe('correct');
    expect(judgeHeard(alts, ['Çığ'], 'Ç', { duringHost: false })).toBe('correct');
    expect(judgeHeard(alts, ['Çığ'], 'Ç', { duringHost: true, hostWords: ['buz', 've', 'kar', 'kütlesi', 'çe', 'ile', 'başlıyor'] })).toBe('correct');
  }
});

test('the same shapes are not right for a longer Ç answer (Çakal, Çita, Çiçek), nor a wrong answer: no verdict', () => {
  for (const answers of [['Çakal'], ['Çita'], ['Çiçek']]) {
    for (const alts of [...RUNS.map((r) => [r]), FINAL]) {
      expect(judgeSpoken(alts, answers)).toBe('wrong');
      expect(judgeHeard(alts, answers, 'Ç', { duringHost: false })).toBeNull();
    }
  }
});

test('in the whole question bank, "ÇÇÇÇ" is right only where an answer is a two- or three-letter Ç word', () => {
  const right = ALL.filter((q) => judgeSpoken([' ÇÇÇÇ'], q.answers) === 'correct').map((q) => q.id);
  const short = ALL.filter((q) => q.answers.some((a) => /^ç\S{1,2}$/.test(norm(a)))).map((q) => q.id);
  expect(right).toContain('bilim-1-Ç-4');
  expect(right).toEqual(short);
  expect(ALL.filter((q) => q.answers.some((a) => ['Çakal', 'Çita'].includes(a))).every((q) => !right.includes(q.id))).toBe(true);
});

test('a lone letter, or two of it, is right nowhere in the question bank', () => {
  for (const heard of [' Ç', 'Ç', ' ÇÇ', 'ç ç', ' C', ' A']) {
    expect(ALL.filter((q) => judgeSpoken([heard], q.answers) === 'correct').map((q) => q.id)).toEqual([]);
  }
});

test('a run of another letter, a run mixed with other letters, or words around it are not a letter run', () => {
  expect(letterRun(' CCCC', ['Çığ'])).toBe(false);
  expect(letterRun(' ÇÇÇÇCÇÇ', ['Çığ'])).toBe(false);
  expect(letterRun(' ÇÇÇÇ çığır', ['Çığ'])).toBe(false);
  expect(letterRun('333', ['3'])).toBe(false);
  expect(letterRun(' ÇÇÇ ÇÇÇÇ', ['Çığ'])).toBe(true);
  expect(letterRun(' AAAA', ['Ay'])).toBe(true);
  expect(letterRun(' AAAA', ['Ayva'])).toBe(false);
  expect(letterRun(' AAAA', ['Ak Deniz'])).toBe(false);
});

test('a held wrong answer is right after all when its final has a right answer among its guesses, and only then', () => {
  expect(finalRights(['cevdet', 'ceviz'], ['Ceviz'])).toBe(true);
  expect(finalRights(['cevdet', 'cevher'], ['Ceviz'])).toBe(false);
  expect(finalRights([], ['Ceviz'])).toBe(false);
  // The host saying the answer is not the player saying it.
  expect(finalRights(['ceviz'], ['Ceviz'], ['ceviz', 'olacaktı'])).toBe(false);
});
