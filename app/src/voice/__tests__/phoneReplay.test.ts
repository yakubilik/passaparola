import { judgeHeard, spokenPace } from '../../game/normalize';
import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import { AnswerListener, type Recognizer } from '../listener';

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
  l.listen((alts, h) => {
    const c = cur();
    if (!c || !q || verdicts.some((v) => v.q === q)) return;
    const v = judgeHeard(alts, c.answers, c.letter, { duringHost: hostOn || l.hostRecent || h.duringHost, hostLike: h.hostLike, hostNear: h.hostNear, hostWords: h.hostWords });
    // 'hold': a wrong answer heard over the host, judged wrong once it is quiet (useVoiceRound).
    if (v) verdicts.push({ q, heard: alts[0], verdict: v === 'hold' ? 'wrong' : v, t: Date.now() - t0 });
  }, (alts) => (cur() ? spokenPace(alts, cur()!.answers) : 'settle'), undefined, () => cur()?.answers ?? []);
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
test('#455: a wrong two-letter word said just after the clue ("Aç" after "A ile başlıyor") is judged wrong at once, not ignored', () => {
  const v = replay(PHONE.spoken);
  expect(v[0]).toMatchObject({ q: 'bilim-1-A-3', heard: 'aç', verdict: 'wrong' });
  // Judged on its first interim (6237 ms) once it settled, not on the second "Aç" 1.9 s later.
  expect(v[0].t).toBeLessThan(6237 + 1000);
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
