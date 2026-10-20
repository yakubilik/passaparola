import { ALL_QUESTIONS, corpus, hearHost, show, verdicts } from '../../test-utils/echoCorpus';
import { answerLine, clueLine, HOST_LINES } from '../../voice/lines';

// #391 (Yakup, 20 Oct 2026): "the host's own speech, heard through the
// loudspeaker, is still judged as my answer." Every line the host can say,
// heard by the iOS-like recognizer whole, cut in half, with one word misheard
// and with one word split in two, while the host speaks and within the
// hostRecent window after it: no verdict of any kind (correct, pas, wrong, or
// a wrong held until the host is quiet). See docs/speech.md, "The host's voice
// in the mic". The clue lines are in voiceEchoClues.test.ts.

jest.setTimeout(900_000);
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

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

// What text cannot do (docs/speech.md): the same words over the host get the
// same verdict whoever said them. Kept here so the limit is seen, not assumed.
test('text alone cannot tell a misheard host word from the player: the same words, the same verdict', () => {
  const mars = ALL_QUESTIONS.find((q) => q.answers[0] === 'Mars')!;
  const clue = clueLine(mars).text;
  // The player's "pas" over the reading passes (#362), and so does a host "baş" iOS writes "paş".
  expect(verdicts(hearHost(clue, ['kızıl', 'pas'], 'during', mars.answers), mars.answers, mars.letter)).toEqual(['pass']);
  expect(verdicts(hearHost(clue, ['kızıl', 'paş'], 'during', mars.answers), mars.answers, mars.letter)).toEqual(['pass']);
  // The player's "Merkür" is held as a wrong answer (#342), and so is any garbled host word
  // starting with M that is near none of the host's words.
  expect(verdicts(hearHost(clue, ['kızıl', 'merkür'], 'during', mars.answers), mars.answers, mars.letter)).toEqual(['hold']);
  expect(verdicts(hearHost(clue, ['kızıl', 'mahşer'], 'during', mars.answers), mars.answers, mars.letter)).toEqual(['hold']);
});
