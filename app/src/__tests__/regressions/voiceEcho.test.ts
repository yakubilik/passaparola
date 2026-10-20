import { CATEGORIES, type Question } from '../../data/questions';
import { judgeSpoken } from '../../game/normalize';
import { ALL_QUESTIONS, hearHost, type Hit, variants, verdicts } from '../../test-utils/echoCorpus';
import { answerLine, clueLine, HOST_LINES } from '../../voice/lines';

// #391 (Yakup, 20 Oct 2026): "the host's own speech, heard through the
// loudspeaker, is still judged as my answer." Every line the host can say,
// heard by the iOS-like recognizer whole, cut in half, with one word misheard
// and with one word split in two, while the host speaks and within the
// hostRecent window after it: no verdict of any kind (correct, pas, wrong, or
// a wrong held until the host is quiet). See docs/speech.md, "The host's voice
// in the mic".

jest.setTimeout(900_000);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const show = (hits: Hit[]) => hits.slice(0, 20).map((h) => `${h.when} ${h.verdict}: [${h.alts}] <= "${h.heard}"`).join('\n');

type Line = { text: string; asked: Question[] };

// A misheard host word can become exactly what a player says ("baş" → "paş",
// a Pas; an answer's slip that still sounds like it). Text alone cannot tell
// that from the player: such verdicts are counted, kept few, and named in the
// report, the rest must be none.
function corpus(lines: Line[], every = 1) {
  const hits: Hit[] = [];
  const indistinguishable: Hit[] = [];
  let runs = 0;
  for (const { text, asked } of lines) {
    const vs = variants(text, every);
    for (const v of vs) {
      const changed = v.kind === 'misheard' ? v.words.filter((w, i) => w !== vs[0].words[i]) : [];
      for (const when of ['during', 'after'] as const) {
        runs++;
        const ds = hearHost(text, v.words, when, asked[0].answers);
        if (!ds.length) continue;
        for (const q of asked) {
          for (const verdict of verdicts(ds, q.answers, q.letter)) {
            const hit = { line: text, heard: v.words.join(' '), when, verdict, alts: ds.map((d) => d.alts[0]).join(' / ') };
            (changed.some((w) => judgeSpoken([w], q.answers) !== 'wrong') ? indistinguishable : hits).push(hit);
          }
        }
      }
    }
  }
  return { hits, runs, indistinguishable };
}

test('every HOST_LINES entry, with any question asked: no verdict', () => {
  const { hits, runs, indistinguishable } = corpus(Object.values(HOST_LINES).map((text) => ({ text, asked: ALL_QUESTIONS })));
  expect(runs).toBeGreaterThan(200);
  expect(show(indistinguishable)).toBe('');
  expect(show(hits)).toBe('');
});

test("every '-cevap' line in full (\"<answer> olacaktı.\"), its own question and the next one asked: no verdict", () => {
  const lines = ALL_QUESTIONS.map((q, i) => ({ text: answerLine(q).text, asked: [q, ALL_QUESTIONS[(i + 1) % ALL_QUESTIONS.length]] }));
  const { hits, runs, indistinguishable } = corpus(lines);
  expect(runs).toBeGreaterThan(ALL_QUESTIONS.length * 6);
  expect(indistinguishable.length).toBeLessThan(runs / 100);
  expect(show(hits)).toBe('');
});

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
