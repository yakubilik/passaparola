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
type Ev = { t: number; e: 'host' | 'host-done' | 'result' | 'request'; texts?: string[]; q?: string | null; final?: boolean; alts?: string[] };
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

function replay(s: Session) {
  const l = new AnswerListener(rec);
  let q: string | null = null;
  let hostOn = false;
  const verdicts: { q: string; heard: string; verdict: string }[] = [];
  const cur = () => (q ? s.questions[q] : null);
  l.listen((alts, h) => {
    const c = cur();
    if (!c || !q) return;
    const v = judgeHeard(alts, c.answers, c.letter, { duringHost: hostOn || l.hostRecent || h.duringHost, hostLike: h.hostLike, hostNear: h.hostNear, hostWords: h.hostWords });
    if (v) verdicts.push({ q, heard: alts[0], verdict: v });
  }, (alts) => (cur() ? spokenPace(alts, cur()!.answers) : 'settle'), undefined, () => cur()?.answers ?? []);
  let now = 0;
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
