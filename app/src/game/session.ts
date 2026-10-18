import type { MatchPlayer } from './match';
import type { Round } from './round';

// The round that just ended, handed from the game screen to the round end.
export type RoundResult = {
  round: Round;
  cats: string[];
  catsParam: string;
  level: number;
  quick: boolean;
  passed: boolean;
  unlockedNext: boolean;
};

let last: RoundResult | null = null;

export function setLastResult(r: RoundResult | null) {
  last = r;
}

export function lastResult(): RoundResult | null {
  return last;
}

// The pass-and-play match that just ended, for its results screen.
export type MatchResult = { players: MatchPlayer[]; catsParam: string; level: number };

let lastMatch: MatchResult | null = null;

export function setLastMatch(m: MatchResult | null) {
  lastMatch = m;
}

export function lastMatchResult(): MatchResult | null {
  return lastMatch;
}
