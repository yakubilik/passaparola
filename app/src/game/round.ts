import type { CategoryFile, Question } from '../data/questions';
import { LETTERS, type Letter } from './letters';
import { judgeTyped, type Verdict } from './normalize';

export type LetterStatus = 'pending' | 'correct' | 'wrong';

export type RoundLetter = {
  letter: Letter;
  question: Question;
  category: string;
  status: LetterStatus;
  passed: boolean;
};

// One contestant's round. Kept per player so that several players taking
// turns on one phone can each hold their own round later.
export type Round = {
  letters: RoundLetter[];
  idx: number;
  timeLeft: number;
  correct: number;
  wrong: number;
  done: boolean;
};

export const ROUND_SECONDS = 180;
export const PASS_MARK = 18;

export type Rng = () => number;

// Picks one question per ring letter from the chosen categories' pool for
// this level; with several categories every letter draws its own category.
// Returns null when a letter has no question (the level is not ready).
export function pickQuestions(bank: CategoryFile[], cats: string[], level: number, rng: Rng = Math.random) {
  const pools = bank
    .filter((c) => cats.includes(c.category))
    .map((c) => ({ cat: c.category, lv: c.levels.find((l) => l.level === level) }))
    .filter((p) => p.lv);
  const picked: { letter: Letter; question: Question; category: string }[] = [];
  for (const letter of LETTERS) {
    const withLetter = pools
      .map((p) => ({ cat: p.cat, qs: p.lv!.questions.filter((q) => q.letter === letter) }))
      .filter((p) => p.qs.length > 0);
    if (!withLetter.length) return null;
    const from = withLetter[Math.floor(rng() * withLetter.length)];
    picked.push({ letter, question: from.qs[Math.floor(rng() * from.qs.length)], category: from.cat });
  }
  return picked;
}

export function createRound(picked: NonNullable<ReturnType<typeof pickQuestions>>, seconds = ROUND_SECONDS): Round {
  return {
    letters: picked.map((p) => ({ ...p, status: 'pending', passed: false })),
    idx: 0,
    timeLeft: seconds,
    correct: 0,
    wrong: 0,
    done: false,
  };
}

export function current(r: Round): RoundLetter {
  return r.letters[r.idx];
}

// Next pending letter after the current one, wrapping round; passed letters
// come back on the next lap. The current letter itself counts last, so a
// lone passed letter is asked again.
function nextPending(r: Round): number {
  const n = r.letters.length;
  for (let k = 1; k <= n; k++) {
    const j = (r.idx + k) % n;
    if (r.letters[j].status === 'pending') return j;
  }
  return -1;
}

export function settle(r: Round, verdict: Verdict): Round {
  if (r.done) return r;
  const letters = r.letters.slice();
  const cur = { ...letters[r.idx] };
  let { correct, wrong } = r;
  if (verdict === 'correct') { cur.status = 'correct'; correct++; }
  else if (verdict === 'wrong') { cur.status = 'wrong'; wrong++; }
  else cur.passed = true;
  letters[r.idx] = cur;
  const next = { ...r, letters, correct, wrong };
  const j = nextPending(next);
  if (j < 0) return { ...next, done: true };
  return { ...next, idx: j };
}

// A typed (or later spoken) answer for the current letter.
export function answer(r: Round, text: string): { round: Round; verdict: Verdict } {
  const verdict = judgeTyped(text, current(r).question.answers);
  return { round: settle(r, verdict), verdict };
}

export function tick(r: Round, seconds: number): Round {
  if (r.done) return r;
  const timeLeft = Math.max(0, r.timeLeft - seconds);
  return { ...r, timeLeft, done: timeLeft <= 0 };
}

export function counts(r: Round) {
  const pending = r.letters.filter((l) => l.status === 'pending');
  return {
    correct: r.correct,
    wrong: r.wrong,
    passed: pending.filter((l) => l.passed).length,
    empty: pending.length,
  };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// "A HARFİYLE BAŞLIYOR" / "İÇİNDE Ö VAR"
export function promptLine(l: RoundLetter): string {
  return l.question.type === 'contains' ? `İÇİNDE ${l.letter} VAR` : `${l.letter} HARFİYLE BAŞLIYOR`;
}
