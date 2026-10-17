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
