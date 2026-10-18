import { CATEGORIES, categoryById, hasQuestions, levelIsPlayable } from '../../data/questions';
import { LETTERS } from '../letters';
import { answer, counts, seededRng, createRound, current, formatClock, pickQuestions, promptLine, settle, tick, type Round } from '../round';

const tarih = categoryById('tarih')!;

function round(): Round {
  const picked = pickQuestions(CATEGORIES, ['tarih'], 1, () => 0)!;
  return createRound(picked, 180);
}

test('the ring has 28 letters and no Ğ', () => {
  expect(LETTERS).toHaveLength(28);
  expect(LETTERS).not.toContain('Ğ');
});

test('a round draws one question per letter, in ring order', () => {
  const r = round();
  expect(r.letters.map((l) => l.letter)).toEqual([...LETTERS]);
  r.letters.forEach((l) => expect(l.question.letter).toBe(l.letter));
  expect(current(r).letter).toBe('A');
});

test('categories without questions, or missing levels, give no round', () => {
  const bank = CATEGORIES.map((c) => (c.category === 'cografya' ? { ...c, levels: [] } : c));
  const empty = bank.find((c) => c.category === 'cografya')!;
  expect(hasQuestions(empty)).toBe(false);
  expect(pickQuestions(bank, ['cografya'], 1)).toBeNull();
  expect(pickQuestions(CATEGORIES, ['tarih'], 99)).toBeNull();
  expect(levelIsPlayable(tarih, 1)).toBe(true);
});

test('several categories: every letter comes from one of them, both get used', () => {
  const picked = pickQuestions(CATEGORIES, ['tarih', 'cografya'], 1, seededRng(3))!;
  expect(picked.every((p) => p.category === 'tarih' || p.category === 'cografya')).toBe(true);
  expect(new Set(picked.map((p) => p.category))).toEqual(new Set(['tarih', 'cografya']));
  // A category without the level simply does not contribute.
  const bank = CATEGORIES.map((c) => (c.category === 'cografya' ? { ...c, levels: [] } : c));
  expect(pickQuestions(bank, ['tarih', 'cografya'], 1)!.every((p) => p.category === 'tarih')).toBe(true);
});

test('right, wrong and pas colour the letter and move to the next pending one', () => {
  let r = round();
  r = answer(r, current(r).question.answers[0]).round;
  expect(r.letters[0].status).toBe('correct');
  expect(current(r).letter).toBe('B');
  const w = answer(r, 'kesinlikle yanlış');
  expect(w.verdict).toBe('wrong');
  r = w.round;
  expect(r.letters[1].status).toBe('wrong');
  expect(current(r).letter).toBe('C');
  const p = answer(r, 'pas');
  expect(p.verdict).toBe('pass');
  r = p.round;
  expect(r.letters[2]).toMatchObject({ status: 'pending', passed: true });
  expect(current(r).letter).toBe('Ç');
  expect(counts(r)).toEqual({ correct: 1, wrong: 1, passed: 1, empty: 26 });
});

test('passed letters come back lap after lap until answered', () => {
  let r = round();
  for (let i = 0; i < 28; i++) r = settle(r, 'pass');
  expect(current(r).letter).toBe('A');
  expect(r.done).toBe(false);
  for (let i = 0; i < 27; i++) r = settle(r, 'correct');
  expect(current(r).letter).toBe('Z');
  r = settle(r, 'pass');
  expect(current(r).letter).toBe('Z');
  r = settle(r, 'wrong');
  expect(r.done).toBe(true);
  expect(counts(r)).toEqual({ correct: 27, wrong: 1, passed: 0, empty: 0 });
});

test('the clock counts the whole round down and ends it at zero', () => {
  let r = round();
  r = tick(r, 60.2);
  expect(formatClock(r.timeLeft)).toBe('02:00');
  expect(r.done).toBe(false);
  r = tick(r, 500);
  expect(r.timeLeft).toBe(0);
  expect(r.done).toBe(true);
  expect(settle(r, 'correct')).toBe(r);
});

test('prompt line', () => {
  const r = round();
  expect(promptLine(r.letters[0])).toBe('A İLE BAŞLIYOR');
  expect(promptLine({ ...r.letters[0], letter: 'Ö' })).toBe('Ö İLE BAŞLIYOR');
});

test('a seed gives the same round every time', () => {
  const a = pickQuestions(CATEGORIES, ['tarih'], 1, seededRng(7))!.map((p) => p.question.id);
  const b = pickQuestions(CATEGORIES, ['tarih'], 1, seededRng(7))!.map((p) => p.question.id);
  const c = pickQuestions(CATEGORIES, ['tarih'], 1, seededRng(8))!.map((p) => p.question.id);
  expect(a).toEqual(b);
  expect(a).not.toEqual(c);
});
