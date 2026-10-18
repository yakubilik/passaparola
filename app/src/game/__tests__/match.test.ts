import { CATEGORIES } from '../../data/questions';
import { LETTERS } from '../letters';
import {
  createMatch, endsTurn, endTurn, matchLevels, nextPlayer, parseNames, pickForPlayers, playerNames, standings, tiedForFirst,
  type Match, type MatchPlayer,
} from '../match';
import { createRound, pickQuestions, seededRng, settle, tick, type Round } from '../round';
import { parseCats } from '../selection';

function match(n: number, seed = 1): Match {
  const sets = pickForPlayers(CATEGORIES, ['tarih'], 1, n, seededRng(seed))!;
  return createMatch(['Ayşe', 'Bora', 'Cem', 'Deniz'].slice(0, n), sets);
}

function player(name: string, correct: number, wrong: number, timeLeft: number): MatchPlayer {
  const round: Round = { ...createRound(pickQuestions(CATEGORIES, ['tarih'], 1, () => 0)!), correct, wrong, timeLeft, done: true };
  return { name, round };
}

test('every player gets one question per letter of the level, none shared', () => {
  for (const cats of [['tarih'], parseCats('karisik')]) {
    const sets = pickForPlayers(CATEGORIES, cats, 1, 4, seededRng(7))!;
    expect(sets).toHaveLength(4);
    for (const set of sets) {
      expect(set.map((p) => p.letter)).toEqual([...LETTERS]);
      set.forEach((p) => expect(p.question.letter).toBe(p.letter));
      set.forEach((p) => expect(p.question.id).toMatch(new RegExp(`^${p.category}-1-`)));
    }
    const ids = sets.flatMap((s) => s.map((p) => p.question.id));
    expect(new Set(ids).size).toBe(ids.length);
  }
});

test('a level needs a question per letter for every player', () => {
  // The files have exactly 4 per letter for some letters of each level.
  expect(pickForPlayers(CATEGORIES, ['tarih'], 1, 5)).toBeNull();
  expect(pickForPlayers(CATEGORIES, ['tarih'], 99, 2)).toBeNull();
  expect(matchLevels(CATEGORIES, ['tarih'], 4)).toEqual([1, 2, 3]);
  expect(matchLevels(CATEGORIES, ['tarih'], 5)).toEqual([]);
});

test('a right answer keeps the turn, a wrong answer or Pas hands it to the next player', () => {
  const m = match(3);
  expect(endsTurn(m, 'correct')).toBe(false);
  expect(endsTurn(m, 'wrong')).toBe(true);
  expect(endsTurn(m, 'pass')).toBe(true);
  const r = settle(settle(m.players[0].round, 'correct'), 'pass');
  const m2 = endTurn(m, r);
  expect(m2.cur).toBe(1);
  expect(m2.players[0].round).toBe(r);
  expect(m2.players[0].round.letters[1].passed).toBe(true);
});

test('3 players: right then Pas, wrong, time up; the turn skips players who are done', () => {
  let m = match(3);
  const order = [m.players[m.cur].name];
  const turn = (f: (r: Round) => Round) => {
    m = endTurn(m, f(m.players[m.cur].round));
    order.push(m.done ? 'end' : m.players[m.cur].name);
  };
  turn((r) => settle(settle(r, 'correct'), 'pass')); // Ayşe: A right, B pas
  turn((r) => settle(r, 'wrong')); // Bora: A wrong
  turn((r) => tick(r, 181)); // Cem: time up
  expect(m.players[2].round.done).toBe(true);
  turn((r) => settle(settle(r, 'correct'), 'wrong')); // Ayşe: C right, Ç wrong; Cem is skipped
  turn((r) => settle(r, 'pass')); // Bora: B pas
  // Ayşe's time runs out; Bora is the only one left, so a Pas no longer ends the turn.
  turn((r) => tick(r, 181));
  expect(nextPlayer(m)).toBe(-1);
  expect(endsTurn(m, 'pass')).toBe(false);
  turn((r) => tick(r, 181)); // Bora's time runs out: nobody left
  expect(order).toEqual(['Ayşe', 'Bora', 'Cem', 'Ayşe', 'Bora', 'Ayşe', 'Bora', 'end']);
  expect(standings(m.players).map((s) => [s.place, s.player.name])).toEqual([[1, 'Ayşe'], [2, 'Cem'], [3, 'Bora']]);
});

test('with nobody else left the player keeps the turn until their round is over', () => {
  let m = match(2);
  m = endTurn(m, tick(m.players[0].round, 200));
  expect(m.cur).toBe(1);
  const r = settle(m.players[1].round, 'pass');
  m = endTurn(m, r);
  expect(m).toMatchObject({ cur: 1, done: false });
  m = endTurn(m, tick(r, 200));
  expect(m.done).toBe(true);
});

test('ranking: more correct, then fewer wrong, then more time left; equal players share a place', () => {
  const ps = [player('A', 10, 5, 0), player('B', 12, 9, 0), player('C', 10, 2, 0), player('D', 10, 2, 30.2)];
  expect(standings(ps).map((s) => [s.place, s.player.name])).toEqual([[1, 'B'], [2, 'D'], [3, 'C'], [4, 'A']]);
  expect(tiedForFirst(ps)).toEqual([]);

  // Same correct, same wrong, same seconds on the clock: a tie.
  const tie = [player('A', 8, 1, 12.4), player('B', 8, 1, 12.1), player('C', 3, 0, 50)];
  expect(standings(tie).map((s) => [s.place, s.player.name])).toEqual([[1, 'A'], [1, 'B'], [3, 'C']]);
  expect(tiedForFirst(tie).map((p) => p.name)).toEqual(['A', 'B']);
});

test('names: empty fields get a default, the route parameter is checked', () => {
  expect(playerNames([' Ayşe ', ''])).toEqual(['Ayşe', 'Oyuncu 2']);
  expect(parseNames(JSON.stringify(['Ayşe', 'Bora']))).toEqual(['Ayşe', 'Bora']);
  expect(parseNames(JSON.stringify(['Ayşe']))).toBeNull();
  expect(parseNames(JSON.stringify(['a', 'b', 'c', 'd', 'e']))).toBeNull();
  expect(parseNames('nope')).toBeNull();
  expect(parseNames(undefined)).toBeNull();
});
