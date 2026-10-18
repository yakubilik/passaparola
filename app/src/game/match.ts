import type { CategoryFile, Question } from '../data/questions';
import { LETTERS, type Letter } from './letters';
import type { Verdict } from './normalize';
import { createRound, ROUND_SECONDS, type Rng, type Round } from './round';

// Pass and play: 2 to 4 people on one phone, each with their own round of the
// same level, taking turns as in the show's final (js/game.js): a wrong
// answer or Pas hands the turn to the next player who can still play.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export type MatchPlayer = { name: string; round: Round };

export type Match = { players: MatchPlayer[]; cur: number; done: boolean };

type Picked = { letter: Letter; question: Question; category: string };

// One question per letter for each of `n` players from the chosen categories'
// pool for this level, no question given to two players. With several
// categories every pick draws its own category, as in a single round.
// Returns null when some letter has fewer than `n` questions.
export function pickForPlayers(bank: CategoryFile[], cats: string[], level: number, n: number, rng: Rng = Math.random): Picked[][] | null {
  const pools = bank
    .filter((c) => cats.includes(c.category))
    .map((c) => ({ cat: c.category, lv: c.levels.find((l) => l.level === level) }))
    .filter((p) => p.lv);
  const sets: Picked[][] = Array.from({ length: n }, () => []);
  for (const letter of LETTERS) {
    const left = pools
      .map((p) => ({ cat: p.cat, qs: p.lv!.questions.filter((q) => q.letter === letter) }))
      .filter((p) => p.qs.length > 0);
    if (left.reduce((s, p) => s + p.qs.length, 0) < n) return null;
    for (const set of sets) {
      const withLeft = left.filter((p) => p.qs.length > 0);
      const from = withLeft[Math.floor(rng() * withLeft.length)];
      const [question] = from.qs.splice(Math.floor(rng() * from.qs.length), 1);
      set.push({ letter, question, category: from.cat });
    }
  }
  return sets;
}

// The levels of a selection that have enough questions for `n` players.
export function matchLevels(bank: CategoryFile[], cats: string[], n: number): number[] {
  const all = new Set(bank.filter((c) => cats.includes(c.category)).flatMap((c) => c.levels.map((l) => l.level)));
  return [...all].sort((a, b) => a - b).filter((lv) => pickForPlayers(bank, cats, lv, n, () => 0) !== null);
}

export function createMatch(names: string[], sets: Picked[][], seconds = ROUND_SECONDS): Match {
  return { players: names.map((name, i) => ({ name, round: createRound(sets[i], seconds) })), cur: 0, done: false };
}

// The next player after the current one, wrapping round, who still has time
// and letters; -1 when nobody else can play.
export function nextPlayer(m: Match): number {
  const n = m.players.length;
  for (let k = 1; k < n; k++) {
    const j = (m.cur + k) % n;
    if (!m.players[j].round.done) return j;
  }
  return -1;
}

export function hasOther(m: Match): boolean {
  return nextPlayer(m) >= 0;
}

// Does this verdict end the turn? A wrong answer or Pas does when someone
// else can still play; a right answer never does.
export function endsTurn(m: Match, verdict: Verdict): boolean {
  return verdict !== 'correct' && hasOther(m);
}

// The current player's turn is over with their round as it now stands:
// the turn goes to the next player who can still play, stays with the
// current one when nobody else can (and they still can), or the match ends.
export function endTurn(m: Match, round: Round): Match {
  const players = m.players.map((p, i) => (i === m.cur ? { ...p, round } : p));
  const next = { ...m, players };
  const j = nextPlayer(next);
  if (j >= 0) return { ...next, cur: j };
  if (!round.done) return next;
  return { ...next, done: true };
}

export type Standing = { player: MatchPlayer; index: number; place: number };

// Whole seconds, as the clock shows them: two players both showing 00:42 are
// level on time.
function secondsLeft(r: Round): number {
  return Math.max(0, Math.ceil(r.timeLeft));
}

function compare(a: Round, b: Round): number {
  return b.correct - a.correct || a.wrong - b.wrong || secondsLeft(b) - secondsLeft(a);
}

// Most correct answers first, then fewer wrong, then more time left. Players
// level on all three share a place.
export function standings(players: MatchPlayer[]): Standing[] {
  const sorted = players.map((player, index) => ({ player, index })).sort((a, b) => compare(a.player.round, b.player.round) || a.index - b.index);
  const out: Standing[] = [];
  sorted.forEach((s, i) => {
    const prev = out[i - 1];
    const place = prev && compare(prev.player.round, s.player.round) === 0 ? prev.place : i + 1;
    out.push({ ...s, place });
  });
  return out;
}

// The players sharing first place when there is more than one, else [].
export function tiedForFirst(players: MatchPlayer[]): MatchPlayer[] {
  const top = standings(players).filter((s) => s.place === 1);
  return top.length > 1 ? top.map((s) => s.player) : [];
}

// Names typed on the setup screen, trimmed; a field left empty is
// "Oyuncu <n>".
export function playerNames(raw: string[]): string[] {
  return raw.map((s, i) => s.trim() || `Oyuncu ${i + 1}`);
}

// The `names` route parameter: a JSON array of 2 to 4 names.
export function parseNames(param: string | undefined): string[] | null {
  try {
    const names = JSON.parse(param ?? '');
    if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) return null;
    if (!names.every((n) => typeof n === 'string' && n.trim())) return null;
    return names.map((n: string) => n.trim());
  } catch {
    return null;
  }
}
