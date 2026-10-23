import { finalRights, judgeHeard, judgeSpoken, spokenPace } from '../../game/normalize';
import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import { AnswerListener, HELD_TAIL_MS, type Recognizer } from '../listener';
import { HELD_POLL_MS } from '../useVoiceRound';

// What the iPhone's recognizer really gave on 22 Oct 2026 (main 929c66e,
// patch harfiyen-438-route), replayed in order and on time through the real
// listener and the round's verdict rule (judgeHeard, as useVoiceRound applies
// it): the recognizer results and the host's lines, nothing else (no audio).
// `silent`: three self-test rounds with nobody speaking (the self-test skips
// the verdict on the phone; this replay makes it). `spoken`: Yakup answering
// a Bilim round in his own words. This proves what the code does with those
// exact results; it says nothing new about what the microphone hears.
const PHONE = require('./phone-2026-10-22.json') as {
  silent: Session;
  spoken: Session;
};
type Ev = { t: number; e: 'host' | 'host-done' | 'result' | 'request' | 'judged'; verdict?: string; texts?: string[]; q?: string | null; final?: boolean; alts?: string[] };
type Session = { events: Ev[]; questions: Record<string, { letter: string; answers: string[] }> };

const fake = new FakeRecognizer();
const rec: Recognizer = {
  start: (o) => fake.module.start(o),
  abort: () => fake.module.abort(),
  subscribe: (h) => {
    const subs = [fake.module.addListener('result', h.result), fake.module.addListener('error', h.error), fake.module.addListener('end', h.end)];
    return () => subs.forEach((s) => s.remove());
  },
};

beforeEach(() => {
  jest.useFakeTimers();
  fake.reset();
});
afterEach(() => jest.useRealTimers());

// As in the game, a question takes one verdict (the round moves on from it) and
// nothing heard before the next clue starts is an answer to it.
function replay(s: Session) {
  const l = new AnswerListener(rec);
  let q: string | null = null;
  let hostOn = false;
  let now = 0;
  const t0 = Date.now();  // fake timers: the replay's own clock
  const verdicts: { q: string; heard: string; verdict: string; t: number }[] = [];
  const cur = () => (q ? s.questions[q] : null);
  // 'hold': a wrong answer heard over the host, judged wrong once the host is
  // quiet and its utterance's final has come or HELD_TAIL_MS went by, right
  // when that final has a right answer (useVoiceRound, #478).
  let held: { q: string; heard: string; at: number; hostWords?: string[] } | null = null;
  l.listen((alts, h) => {
    const c = cur();
    if (!c || !q || verdicts.some((v) => v.q === q)) return;
    const v = judgeHeard(alts, c.answers, c.letter, { duringHost: hostOn || l.hostRecent || h.duringHost, hostLike: h.hostLike, hostNear: h.hostNear, hostWords: h.hostWords });
    held = null;
    if (v === 'hold') held = { q, heard: alts[0], at: Date.now(), hostWords: h.hostWords };
    else if (v) verdicts.push({ q, heard: alts[0], verdict: v, t: Date.now() - t0 });
  }, (alts) => (cur() ? spokenPace(alts, cur()!.answers) : 'settle'), undefined, () => cur()?.answers ?? []);
  l.onTail = (alts) => {
    const c = cur();
    if (!held || !c || held.q !== q || !finalRights(alts, c.answers, held.hostWords)) return;
    verdicts.push({ q: held.q, heard: alts.find((a) => judgeSpoken([a], c.answers) === 'correct') ?? alts[0], verdict: 'correct', t: Date.now() - t0 });
    held = null;
  };
  const poll = setInterval(() => {
    if (!held) return;
    if (held.q !== q) { held = null; return; }
    if (hostOn || (l.tailPending && Date.now() - held.at < HELD_TAIL_MS)) return;
    verdicts.push({ q: held.q, heard: held.heard, verdict: 'wrong', t: Date.now() - t0 });
    held = null;
  }, HELD_POLL_MS);
  for (const e of s.events) {
    jest.advanceTimersByTime(Math.max(0, e.t - now));
    now = Math.max(now, e.t);
    if (e.e === 'host') {
      if (e.q) { q = e.q; l.clueStarts(); }
      hostOn = true;
      l.hostSpeaking(e.texts!);
    } else if (e.e === 'host-done') {
      hostOn = false;
      l.hostDone();
    } else if (e.e === 'result') {
      fake.emit('result', { isFinal: !!e.final, results: e.alts!.map((transcript) => ({ transcript })) });
    }
  }
  jest.advanceTimersByTime(5000);
  clearInterval(poll);
  l.stop();
  return verdicts;
}

test('silent self-test, three rounds: no verdict of any kind from the phone\'s own sound and iOS\'s no-speech guesses (was a held wrong at 362.8 s)', () => {
  expect(PHONE.silent.events.filter((e) => e.e === 'result')).toHaveLength(5);
  expect(replay(PHONE.silent)).toEqual([]);
});

test('Yakup answering a Bilim round: the same verdicts as on the phone, each once', () => {
  expect(replay(PHONE.spoken).map((v) => `${v.q.split('-').slice(2).join('-')} ${v.heard} ${v.verdict}`)).toEqual([
    'A-3 aç wrong',
    'B-3 böbrek correct',
    'C-3 ceviz correct',
    'Ç-3 çakal correct',
    'D-2 deprem correct',
    'E-4 erik wrong',
    'F-3 fare correct',
    'G-1 güneş correct',
    'H-2 horoz correct',
    'I-2 ıhlamur correct',
    'İ-1 inek correct',
  ]);
});

// #455, "short words are not understood". Yakup's "Aç" (a wrong answer to
// Ağaç), iOS's interim 710 ms after the host's "... A ile başlıyor." stopped,
// inside ECHO_TAIL_MS: hostNear took "aç" for a slip of the host's letter name
// "a", so the attempt got no verdict and he had to say it again (main
// 4d5c2e0c). A wrong short word is a wrong answer the first time.
// Held (heard inside the echo tail), it is judged once its own final (" Aç",
// 7909 ms) has shown no right answer among its guesses (#478).
test('#455: a wrong two-letter word said just after the clue ("Aç" after "A ile başlıyor") is judged wrong on its first utterance, not ignored', () => {
  const v = replay(PHONE.spoken);
  expect(v[0]).toMatchObject({ q: 'bilim-1-A-3', heard: 'aç', verdict: 'wrong' });
  // Judged on its first interim (6237 ms) and that utterance's final (7909 ms), not on the second "Aç" (8116 ms).
  expect(v[0].t).toBeGreaterThanOrEqual(7909);
  expect(v[0].t).toBeLessThan(8116);
});

// Dilara's iPhone on 22 Oct 2026, 23:53 (main 4d5c2e0c, trace mode, a person
// playing level 2). Her "Pas" came as iOS gives a short word said alone: one
// final result (" Pas", the library's leading space) and no interim at all,
// 1.4 s after the host stopped. Replayed in order and on time, the listener and
// the round give each question the verdict the phone gave.
const DILARA = require('./phone-2026-10-22-dilara.json') as Session;

test('#455: Dilara\'s session replays to the phone\'s own verdicts; her "Pas", a lone final with no interim, passes once', () => {
  const pas = DILARA.events.filter((e) => e.e === 'result' && e.alts?.some((a) => /pas/i.test(a)));
  expect(pas).toEqual([expect.objectContaining({ final: true, alts: [' Pas'] })]);
  const phone = DILARA.events.filter((e) => e.e === 'judged' && e.verdict).map((e) => `${e.q} ${e.verdict}`);
  // E was passed with the Pas button (no recognizer result at all for it): not a voice verdict.
  const voice = phone.filter((x) => x !== 'sanat-2-E-2 pass');
  expect(replay(DILARA).map((v) => `${v.q} ${v.verdict}`)).toEqual(voice);
});

// The same two real shapes with other short words in them (the words are
// not measured on the phone, the timings and result patterns are): Yakup's
// A question with its "Aç" results written as another word, and a question
// whose answer is short answered by a lone final like Dilara's " Pas".
function withWords(s: Session, q: string, answers: string[], words: Record<string, string>): Session {
  return {
    questions: { ...s.questions, [q]: { ...s.questions[q], answers } },
    events: s.events.map((e) => (e.e === 'result' && e.alts ? { ...e, alts: e.alts.map((a) => words[a.trim()] != null ? a.replace(a.trim(), words[a.trim()]) : a) } : e)),
  };
}

test.each([
  ['Ay', ['Ay'], 'correct'],
  ['Kar', ['Kar'], 'correct'],
  ['Ayı', ['Ağaç'], 'wrong'],
  ['Ak', ['Ağaç'], 'wrong'],
  ['Pas', ['Ağaç'], 'pass'],
])('#455: "%s" alone, as iOS gave "Aç" 710 ms after the clue (answers %j): %s, on its first result', (word, answers, verdict) => {
  const v = replay(withWords(PHONE.spoken, 'bilim-1-A-3', answers, { Aç: word }));
  expect(v[0]).toMatchObject({ q: 'bilim-1-A-3', verdict });
  // A wrong one is held until its utterance's final (7909 ms, #478); never as late as the word said again (8116 ms).
  expect(v[0].t).toBeLessThan(verdict === 'wrong' ? 8116 : 6237 + 1000);
});

test.each([
  ['Un', ['Un'], 'correct'],
  ['Buz', ['Buz'], 'correct'],
  ['Fil', ['Fevzi Çakmak'], 'wrong'],
])('#455: "%s" as a lone final with no interim, as Dilara\'s " Pas" came (answers %j): %s', (word, answers, verdict) => {
  const v = replay(withWords(DILARA, 'tarih-2-F-2', answers, { Pas: word }));
  expect(v.find((x) => x.q === 'tarih-2-F-2')).toMatchObject({ verdict });
});

// Words heard inside the host's echo window that do not even start with the
// clue's letter are dropped as possibly the host's (judgeHeard, #342): an
// off-letter "Su" there is no verdict, and said again after it, wrong.
test('#455: an off-letter short word inside the echo window is no verdict; said again after it, wrong', () => {
  const v = replay(withWords(PHONE.spoken, 'bilim-1-A-3', ['Ağaç'], { Aç: 'Su' }));
  expect(v[0]).toMatchObject({ q: 'bilim-1-A-3', heard: 'su', verdict: 'wrong' });
  expect(v[0].t).toBeGreaterThan(8116);
});

// Yakup's iPhone on 23 Oct 2026, 20:34 (this branch, trace mode, AirPods
// off, Bilim level 1). What iOS really returned for short words said alone:
// "Pas" an interim " Pas" 1.2 s after the clue; "Ay" a lone final with no
// interim (" Ay / Ay ay / I") 3.2 s after it; "Cam" and "Diş" an interim
// with the word twice (" Cam cam", " Diş diş"). And "Çığ" came as " ÇÇÇÇ" →
// " ÇÇÇÇÇ" → " ÇÇÇÇÇÇ": iOS heard a word it could not spell, which the
// phone graded wrong (isFragment took it for a word).
const YAKUP_1023 = require('./phone-2026-10-23-yakup.json') as Session;

test('#455: Yakup\'s short words on the phone: Pas passes, Ay (a lone final), Cam and Diş are right', () => {
  const shapes = YAKUP_1023.events.filter((e) => e.e === 'result' && e.alts?.some((a) => /^\s*(pas|ay|cam|diş)(\s|$)/i.test(a))).map((e) => `${e.final ? 'final' : 'interim'} ${e.alts!.join(' / ').trim()}`);
  expect(shapes).toEqual(expect.arrayContaining(['final Ay /  Ay ay /  I', 'interim Cam cam', 'interim Diş diş', 'interim Pas']));
  const v = Object.fromEntries(replay(YAKUP_1023).map((x) => [x.q, x.verdict]));
  expect(v).toMatchObject({ 'bilim-1-G-1': 'pass', 'bilim-1-A-2': 'correct', 'bilim-1-C-2': 'correct', 'bilim-1-D-4': 'correct' });
  // Every other question gets the verdict the phone gave it, but Çığ and
  // Ceviz (#478, below). The recording has the phone's reveal of Ceviz in
  // it ("Ceviz olacaktı."), said over its final, so there it stays wrong.
  const phone = YAKUP_1023.events.filter((e) => e.e === 'judged' && !['bilim-1-Ç-4', 'bilim-1-C-3'].includes((e as { q?: string }).q!));
  expect(phone.length).toBeGreaterThan(10);
  for (const e of phone) expect([e.q, v[e.q!]]).toEqual([e.q, e.verdict]);
});

// #478, "ÇÇÇÇ yazmadım ki, çığ dedim 10 kere". The phone's real shapes for
// Çığ said again and again: interims " ÇÇÇÇ" → " ÇÇÇÇÇ" → " ÇÇÇÇÇÇ" and the
// final " ÇÇÇÇÇÇ / ÇÇÇÇCÇÇ / ÇÇÇÇÇ". iOS heard the word and could not spell
// it: a run of its first letter on a short answer is that answer (letterRun).
const CIG = 'bilim-1-Ç-4';
const cigShapes = (s: Session) => s.events.filter((e) => e.e === 'result' && e.alts?.some((a) => /^\s*Ç{2,}/.test(a))).map((e) => `${e.final ? 'final' : 'interim'} ${e.alts!.join(' /').trim()}`);
const only = (s: Session, keep: (e: Ev) => boolean): Session => ({ ...s, events: s.events.filter(keep) });

test('#478: Çığ as the phone wrote it (" ÇÇÇÇ" … and its final) is right, on its first interim', () => {
  expect(cigShapes(YAKUP_1023)).toEqual(['interim ÇÇÇÇ', 'interim ÇÇÇÇÇ', 'interim ÇÇÇÇÇÇ', 'final ÇÇÇÇÇÇ / ÇÇÇÇCÇÇ / ÇÇÇÇÇ']);
  const v = replay(YAKUP_1023).find((x) => x.q === CIG);
  expect(v).toMatchObject({ heard: 'çççç', verdict: 'correct' });
  expect(v!.t).toBeLessThan(53404 + 100);  // the first " ÇÇÇÇ"; the phone said wrong at 54786
});

test.each([
  ['each interim alone', (e: Ev) => !(e.e === 'result' && e.alts?.some((a) => a.includes('Ç')) && (e.final || e.alts[0].trim() !== 'ÇÇÇÇÇÇ'))],
  ['the final alone', (e: Ev) => !(e.e === 'result' && e.alts?.some((a) => a.includes('Ç')) && !e.final)],
])('#478: Çığ from %s of the real shapes is right', (_, keep) => {
  expect(replay(only(YAKUP_1023, keep)).find((x) => x.q === CIG)).toMatchObject({ verdict: 'correct' });
});

test.each([['Çakal'], ['Çita'], ['Çiçek']])('#478: the same "ÇÇÇÇ" shapes on a question whose answer is %s are not right (and not wrong)', (answer) => {
  const s = { ...YAKUP_1023, questions: { ...YAKUP_1023.questions, [CIG]: { letter: 'Ç', answers: [answer] } } };
  expect(replay(s).find((x) => x.q === CIG)).toBeUndefined();
});

test('#478: a lone "Ç" in place of every one of those shapes is not right, not even for Çığ', () => {
  const lone = { ...YAKUP_1023, events: YAKUP_1023.events.map((e) => (e.e === 'result' && e.alts?.some((a) => /Ç{2,}/.test(a)) ? { ...e, alts: [' Ç'] } : e)) };
  expect(replay(lone).find((x) => x.q === CIG)).toBeUndefined();
});

// #478, the same session: Ceviz. iOS's interim " Cevdet" came 540 ms after
// the clue (inside the echo tail, so it was held), the phone called it wrong
// 117 ms after the hold, and the final 1 s later had " Ceviz" among its
// guesses. A held wrong answer waits for its utterance's final. Replayed
// without the phone's reveal ("Ceviz olacaktı.", said only because of that
// wrong verdict): what the phone would have heard had it waited.
const CEVIZ = 'bilim-1-C-3';
const noReveal = only(YAKUP_1023, (e) => !(e.t >= 76937 && e.t <= 77853 && (e.e === 'host' || e.e === 'host-done')));
const finalAlts = (s: Session, alts: string[] | null): Session => ({
  ...s,
  events: s.events.flatMap((e) => (e.t === 77564 && e.e === 'result' ? (alts ? [{ ...e, alts }] : []) : [e])),
});

test('#478: Ceviz as the phone heard it (" Cevdet" over the host, then the final " Cevdet / Ceviz") is right, on its final', () => {
  expect(YAKUP_1023.events.filter((e) => e.e === 'result' && e.t >= 75000 && e.t <= 78000)).toEqual([
    expect.objectContaining({ t: 75702, final: false, alts: [' Cevdet'] }),
    expect.objectContaining({ t: 77564, final: true, alts: [' Cevdet', ' Ceviz'] }),
  ]);
  const v = replay(noReveal).find((x) => x.q === CEVIZ);
  expect(v).toMatchObject({ heard: 'ceviz', verdict: 'correct' });
  expect(v!.t).toBeGreaterThanOrEqual(77564);
});

test('#478: a held " Cevdet" whose final has no right answer among its guesses is still wrong, once the final came', () => {
  const v = replay(finalAlts(noReveal, [' Cevdet', ' Cevher'])).find((x) => x.q === CEVIZ);
  expect(v).toMatchObject({ heard: 'cevdet', verdict: 'wrong' });
  expect(v!.t).toBeGreaterThanOrEqual(77564);
  expect(v!.t).toBeLessThan(77564 + 2 * HELD_POLL_MS);
});

test('#478: a held " Cevdet" whose final never comes is wrong HELD_TAIL_MS after the hold', () => {
  const v = replay(finalAlts(noReveal, null)).find((x) => x.q === CEVIZ);
  expect(v).toMatchObject({ heard: 'cevdet', verdict: 'wrong' });
  // Held when " Cevdet" settled (75702 + SETTLE_MS).
  expect(v!.t).toBeGreaterThanOrEqual(75702 + 700 + HELD_TAIL_MS);
  expect(v!.t).toBeLessThan(75702 + 700 + HELD_TAIL_MS + 2 * HELD_POLL_MS);
});

// #478: what the recognition request carried when Çığ was asked. The round's
// one request (on-device, renewed by iOS once, both in Yakup's first round)
// expects every answer of the round (contextFor). Bilim level 1 has at most
// 40 answers for a round of 28 letters, under the ~100 iOS allows: whatever
// else the round drew, Çığ is in the request.
test('#478: the request for a Bilim level 1 round with Çığ in it carries "Çığ" in its contextualStrings', () => {
  const { CATEGORIES } = require('../../data/questions') as typeof import('../../data/questions');
  const { LETTERS } = require('../../game/letters') as typeof import('../../game/letters');
  const { contextFor } = require('../listener') as typeof import('../listener');
  const qs = CATEGORIES.find((c) => c.category === 'bilim')!.levels.find((lv) => lv.level === 1)!.questions;
  // The longest list such a round can have: Çığ for Ç, the question with the most answers for every other letter.
  const answers = LETTERS.flatMap((letter) => {
    if (letter === 'Ç') return qs.find((q) => q.id === CIG)!.answers;
    return qs.filter((q) => q.letter === letter).sort((a, b) => b.answers.length - a.answers.length)[0].answers;
  });
  // And the round Yakup played: the questions the trace shows of it.
  const played = ['bilim-1-A-4', 'bilim-1-B-1', 'bilim-1-C-2', CIG].flatMap((id) => YAKUP_1023.questions[id].answers);
  for (const round of [answers, played]) {
    const l = new AnswerListener(rec);
    l.listen(() => {}, undefined, contextFor(round));
    expect(fake.lastOptions.contextualStrings).toContain('Çığ');
    // Not cut at MAX_CONTEXT: every answer of the round fits.
    expect(fake.lastOptions.contextualStrings.length).toBeLessThan(100);
    l.stop();
  }
  // The known part of Yakup's round, shortest first after the pass words.
  expect(fake.startOptions[1].contextualStrings).toEqual(['pas', 'geç', 'pas geçiyorum', 'Cam', 'Çığ', 'Beyin', 'Akciğer', 'Akciğerler']);
});
