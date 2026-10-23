import { judgeHeard, spokenPace } from '../../game/normalize';
import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import { AnswerListener, type Recognizer } from '../listener';
const S = require('/tmp/dl.json');
const fake = new FakeRecognizer();
const rec: Recognizer = {
  start: (o) => fake.module.start(o), abort: () => fake.module.abort(),
  subscribe: (h) => { const subs = [fake.module.addListener('result', h.result), fake.module.addListener('error', h.error), fake.module.addListener('end', h.end)]; return () => subs.forEach((s) => s.remove()); },
};
beforeEach(() => { jest.useFakeTimers(); fake.reset(); });
test('x', () => {
  const l = new AnswerListener(rec);
  let q: string | null = null; let hostOn = false; const out: string[] = [];
  const cur = () => (q ? S.questions[q] : null);
  l.listen((alts, h) => { const c = cur(); if (!c) return; const v = judgeHeard(alts, c.answers, c.letter, { duringHost: hostOn || l.hostRecent || h.duringHost, hostLike: h.hostLike, hostNear: h.hostNear, hostWords: h.hostWords }); out.push(`${q} ${alts[0]} ${v}`); }, (alts) => (cur() ? spokenPace(alts, cur()!.answers) : 'settle'), undefined, () => cur()?.answers ?? []);
  let now = 0;
  for (const e of S.events) {
    jest.advanceTimersByTime(Math.max(0, e.t - now)); now = Math.max(now, e.t);
    if (e.e === 'host') { if (e.q) { q = e.q; l.clueStarts(); } hostOn = true; l.hostSpeaking(e.texts); }
    else if (e.e === 'host-done') { hostOn = false; l.hostDone(); }
    else if (e.e === 'result') fake.emit('result', { isFinal: e.final, results: e.alts.map((transcript: string) => ({ transcript })) });
  }
  jest.advanceTimersByTime(5000);
  console.log(out.join('\n'));
});
