import { CATEGORIES, type Question } from '../../data/questions';
import { judgeSpoken, spokenPace, type Verdict } from '../../game/normalize';
import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import { AnswerListener, LATE_MS, SETTLE_MS, type Recognizer } from '../listener';

// #358: "Sezen Aksu" was judged right, then "Aksu" was taken as the answer to
// the next question. One request serves the whole round (#357), so the same
// iOS result keeps growing and being revised after the verdict: interim
// "Sezen" → "Sezen Aksu" → final "Sezen Aksu", its guesses not always the same
// length, the final often after the next clue has started.
const fake = new FakeRecognizer();
const rec: Recognizer = {
  start: (o) => fake.module.start(o),
  abort: () => fake.module.abort(),
  subscribe: (h) => {
    const subs = [fake.module.addListener('result', h.result), fake.module.addListener('error', h.error), fake.module.addListener('end', h.end)];
    return () => subs.forEach((s) => s.remove());
  },
};

const all = CATEGORIES.flatMap((c) => c.levels.flatMap((lv) => lv.questions));
const q = (id: string): Question => {
  const found = all.find((x) => x.id === id);
  if (!found) throw new Error(`no question ${id}`);
  return found;
};

// iOS's results: the guesses for everything heard so far, best first.
const interim = (...guesses: string[]) => fake.emit('result', { isFinal: false, results: guesses.map((transcript) => ({ transcript })) });
const final = (...guesses: string[]) => fake.emit('result', { isFinal: true, results: guesses.map((transcript) => ({ transcript })) });
const wait = (ms: number) => jest.advanceTimersByTime(ms);

let l: AnswerListener;
let questions: Question[];
let at: number;
let judged: { id: string; text: string; verdict: Verdict }[];

// As the round does it: each verdict moves on to the next question, whose clue
// the host starts reading a moment later (after the cue).
function round(...ids: string[]) {
  questions = ids.map(q);
  at = 0;
  judged = [];
  l.listen((alts) => {
    const cur = questions[at];
    if (!cur) return;
    judged.push({ id: cur.id, text: alts[0], verdict: judgeSpoken(alts, cur.answers) });
    at++;
  }, (alts) => (questions[at] ? spokenPace(alts, questions[at].answers) : 'settle'));
}

// The next clue starts: the listener is told, the host reads it and stops.
function nextClue() {
  l.clueStarts();
  l.hostSpeaking([questions[at].clue]);
}

beforeEach(() => {
  jest.useFakeTimers();
  fake.reset();
  l = new AnswerListener(rec);
});
afterEach(() => {
  l.stop();
  jest.useRealTimers();
});

const sezen = 'sanat-1-S-1';  // Sezen Aksu
const next = 'sanat-1-S-2';    // Sinema

describe('a two-word answer does not leak into the next question (#358)', () => {
  test("iOS as usual: interim 'Sezen' → 'Sezen Aksu' → final 'Sezen Aksu'", () => {
    round(sezen, next);
    interim('sezen');
    wait(400);
    interim('sezen aksu');
    expect(judged).toEqual([{ id: sezen, text: 'sezen aksu', verdict: 'correct' }]);
    wait(250);
    nextClue();
    wait(600);
    final('sezen aksu');
    wait(4000);
    l.hostDone();
    wait(1000);
    interim('sinema');
    expect(judged).toEqual([
      { id: sezen, text: 'sezen aksu', verdict: 'correct' },
      { id: next, text: 'sinema', verdict: 'correct' },
    ]);
    expect(fake.starts).toBe(1);
  });

  test('guesses of different lengths: the best still says "Sezen" while another says "Sezen Aksu"', () => {
    round(sezen, next);
    interim('sezen');
    wait(300);
    interim('sezen', 'sezen aksu');
    wait(PARTIAL_WAIT);
    wait(250);
    nextClue();
    wait(700);
    interim('sezen aksu', 'sezen ak su', 'sezenaksu');  // the best catches up, after the verdict
    wait(SETTLE_MS * 3);
    expect(judged.slice(1)).toEqual([]);
    final('sezen aksu', 'sezen ak su');
    wait(3000);
    l.hostDone();
    wait(1000);
    interim('sinema');
    expect(judged).toEqual([
      { id: sezen, text: expect.stringMatching(/^sezen/), verdict: 'correct' },
      { id: next, text: 'sinema', verdict: 'correct' },
    ]);
  });

  test('the final arrives after the next question started, well after the verdict', () => {
    round(sezen, next);
    interim('sezen', 'sezen aksu');
    wait(SETTLE_MS + 10);
    expect(judged.map((j) => j.verdict)).toEqual(['correct']);
    wait(250);
    nextClue();
    wait(LATE_MS + 2000);  // the host is still reading the next clue
    final('sezen aksu', 'sezen ak su');
    wait(SETTLE_MS * 3);
    expect(judged.slice(1)).toEqual([]);
    l.hostDone();
    wait(1000);
    interim('sinema');
    expect(judged.map((j) => [j.id, j.verdict])).toEqual([[sezen, 'correct'], [next, 'correct']]);
  });

  test('a wrong answer: its late revision and its final are not judged again on the next question', () => {
    round(sezen, next);
    interim('ajda', 'ajda pekkan');
    wait(SETTLE_MS + 10);
    expect(judged.map((j) => [j.id, j.text, j.verdict])).toEqual([[sezen, 'ajda', 'wrong']]);
    wait(250);
    nextClue();
    wait(500);
    interim('ajda pekkan');  // the best guess catches up with the other one
    wait(SETTLE_MS * 3);
    expect(judged.slice(1)).toEqual([]);
    wait(1500);
    final('ajda pekkan', 'ajda pek kan');
    wait(SETTLE_MS * 3);
    expect(judged.slice(1)).toEqual([]);
    l.hostDone();
    wait(1000);
    interim('sinema');
    expect(judged.map((j) => [j.id, j.text, j.verdict])).toEqual([[sezen, 'ajda', 'wrong'], [next, 'sinema', 'correct']]);
  });

  test('a new word after a pause is the next answer, even within LATE_MS of the verdict', () => {
    round(sezen, next);
    interim('pas');
    expect(judged.map((j) => j.verdict)).toEqual(['pass']);
    wait(250);
    nextClue();
    wait(SETTLE_MS + 50);
    interim('pas sinema');
    expect(judged.map((j) => [j.id, j.text, j.verdict])).toEqual([[sezen, 'pas', 'pass'], [next, 'sinema', 'correct']]);
  });

  test("a Pas: 'pas geçiyorum' and its revisions are one Pas", () => {
    round(sezen, next);
    interim('pas');
    expect(judged.map((j) => j.verdict)).toEqual(['pass']);
    wait(400);
    interim('pas geçiyorum');
    wait(400);
    final('pas geçiyorum', 'pas geç iyorum');
    wait(SETTLE_MS * 3);
    expect(judged.slice(1)).toEqual([]);
  });

  test('speech that began before the next clue does not count for it; speech after it does', () => {
    round(sezen, next);
    interim('sezen aksu');
    wait(LATE_MS + 500);
    interim('sezen aksu tamam');  // the player talks on, before the next clue
    wait(100);
    nextClue();
    wait(SETTLE_MS * 3);
    expect(judged.slice(1)).toEqual([]);
    l.hostDone();
    wait(500);
    interim('sezen aksu tamam sinema');
    wait(SETTLE_MS + 10);
    expect(judged.map((j) => [j.id, j.text])).toEqual([[sezen, 'sezen aksu'], [next, 'sinema']]);
  });

  test('a new answer said once the late window is over still counts', () => {
    round(sezen, next);
    interim('sezen aksu');
    nextClue();
    l.hostDone();
    wait(LATE_MS + 10);
    interim('sezen aksu sinema');
    expect(judged.map((j) => [j.id, j.text, j.verdict])).toEqual([[sezen, 'sezen aksu', 'correct'], [next, 'sinema', 'correct']]);
  });
});

// The settle wait for a best guess that is the start of a multi-word answer.
const PARTIAL_WAIT = SETTLE_MS + 10;

describe('multi-word answers are not cut early (#358)', () => {
  test.each([
    ['sanat-1-S-1', 'sezen', 'aksu', 'sezen aksu'],
    ['sanat-1-B-3', 'barış', 'manço', 'barış manço'],
    ['sanat-2-R-1', 'reşat', 'nuri güntekin', 'reşat nuri güntekin'],
  ])('%s: the first word waits for the rest', (id, first, rest, whole) => {
    round(id, next);
    interim(first);
    wait(1200);  // a breath between the words
    expect(judged).toEqual([]);
    interim(`${first} ${rest}`);
    expect(judged).toEqual([{ id, text: whole, verdict: 'correct' }]);
  });

  test('a best guess that is the start of the answer waits, even when another guess has all of it', () => {
    round(sezen, next);
    interim('sezen', 'sezen aksu');
    wait(SETTLE_MS - 100);
    expect(judged).toEqual([]);
    interim('sezen aksu');
    expect(judged).toEqual([{ id: sezen, text: 'sezen aksu', verdict: 'correct' }]);
  });

  test('a one-word right answer is still judged at once', () => {
    round(next, sezen);
    interim('sinema');
    expect(judged.map((j) => j.verdict)).toEqual(['correct']);
  });
});
