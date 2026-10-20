import { CATEGORIES, type Question } from '../data/questions';
import { judgeHeard, judgeSpoken, norm, spokenPace, type HeardHow, type Verdict } from '../game/normalize';
import { AnswerListener, ECHO_TAIL_MS, LATE_MS, PARTIAL_MS, type Recognizer } from '../voice/listener';
import { FakeRecognizer } from './fakeRecognizer';

// The host's own words heard by the mic (no voice processing since 19 Oct
// 2026, the loudspeaker is in the room): every line the host can say, as the
// recognizer that behaves like iOS writes it, through the real listener and
// the round's own verdict rule (judgeHeard, as useVoiceRound's onHeard calls it).

const fake = new FakeRecognizer();
const rec: Recognizer = {
  start: (o) => fake.module.start(o),
  abort: () => fake.module.abort(),
  subscribe: (h) => {
    const subs = [fake.module.addListener('result', h.result), fake.module.addListener('error', h.error), fake.module.addListener('end', h.end)];
    return () => subs.forEach((s) => s.remove());
  },
};

export const ALL_QUESTIONS: Question[] = CATEGORIES.flatMap((c) => c.levels.flatMap((lv) => lv.questions));

// How iOS mishears a word: its first sound swapped for a near one (b/p, d/t,
// k/g, s/z, m/n, r/l...), or its first vowel for another.
const NEAR_SOUND: Record<string, string> = {
  b: 'p', p: 'b', d: 't', t: 'd', g: 'k', k: 'g', s: 'z', z: 's', v: 'f', f: 'v', m: 'n', n: 'm', c: 'j', j: 'c',
  ç: 'ş', ş: 'ç', r: 'l', l: 'r', h: 'k', y: 'i', ğ: 'g', a: 'e', e: 'a', ı: 'u', i: 'e', o: 'u', u: 'o', ö: 'ü', ü: 'ö',
};
export function misheard(w: string): string {
  return w[0] in NEAR_SOUND ? NEAR_SOUND[w[0]] + w.slice(1) : w;
}

export type Variant = { kind: 'whole' | 'half' | 'misheard' | 'split'; words: string[] };

/**
 * The ways the mic hears a line: whole; cut in half (by letters, so the last
 * word may be only begun); with one word misheard (each word in turn); with
 * one long word split in two (iOS: "başarılar" → "başa rılar"; each in turn).
 */
export function variants(text: string, every = 1): Variant[] {
  const ws = norm(text).split(' ').filter(Boolean);
  const out: Variant[] = [{ kind: 'whole', words: ws }, { kind: 'half', words: norm(text.slice(0, Math.ceil(text.length / 2))).split(' ').filter(Boolean) }];
  ws.forEach((w, i) => {
    if (!Number.isFinite(every) || i % every) return;
    const m = misheard(w);
    if (m !== w) out.push({ kind: 'misheard', words: [...ws.slice(0, i), m, ...ws.slice(i + 1)] });
    if (w.length >= 5) {
      const k = Math.floor(w.length / 2);
      out.push({ kind: 'split', words: [...ws.slice(0, i), w.slice(0, k), w.slice(k), ...ws.slice(i + 1)] });
    }
  });
  return out;
}

export type Delivery = { alts: string[]; how: HeardHow };
export type Hit = { line: string; heard: string; when: 'during' | 'after'; verdict: Verdict | 'hold'; alts: string };

const wait = (ms: number) => jest.advanceTimersByTime(ms);

/**
 * The host says `line`; the mic hears `heard`, word by word, either while the
 * host speaks or within the hostRecent window right after it (ECHO_TAIL_MS),
 * then iOS ends the utterance with its final. Returns what the listener
 * delivered, with what the round knows about it when it judges (as
 * useVoiceRound's onHeard does: the host speaking, hostRecent, or heard while
 * it talked). `answers` set the pace, as the round's question does.
 * Needs jest's fake timers.
 */
export function hearHost(line: string, heard: string[], when: 'during' | 'after', answers: readonly string[] = []): Delivery[] {
  fake.reset();
  const out: Delivery[] = [];
  const l = new AnswerListener(rec);
  let speaking = false;
  l.listen((alts, h) => {
    out.push({ alts, how: { duringHost: speaking || l.hostRecent || h.duringHost, hostLike: h.hostLike, hostNear: h.hostNear, hostWords: h.hostWords } });
  }, (alts) => spokenPace(alts, answers), undefined, () => answers);
  l.clueStarts();
  l.hostSpeaking([line]);
  speaking = true;
  if (when === 'during') {
    for (const w of heard) { fake.hear(w); wait(150); }
    wait(100);
    speaking = false;
    l.hostDone();
  } else {
    wait(200);
    speaking = false;
    l.hostDone();
    const step = Math.floor((ECHO_TAIL_MS - 100) / Math.max(1, heard.length));
    wait(50);
    for (const w of heard) { fake.hear(w); wait(step); }
  }
  wait(PARTIAL_MS + 100);
  fake.endUtterance();
  wait(LATE_MS + 100);
  l.stop();
  return out;
}

/** The verdicts the round makes on what was delivered, for a question with `answers` and `letter`. */
export function verdicts(ds: Delivery[], answers: readonly string[], letter: string): (Verdict | 'hold')[] {
  return ds.map((d) => judgeHeard(d.alts, answers, letter, d.how)).filter((v): v is Verdict | 'hold' => v !== null);
}


export const show = (hits: Hit[]) => hits.slice(0, 20).map((h) => `${h.when} ${h.verdict}: [${h.alts}] <= "${h.heard}"`).join('\n');

export type Line = { text: string; asked: Question[] };

// A misheard host word can become exactly what a player says ("baş" → "paş",
// a Pas; an answer's slip that still sounds like it). Text alone cannot tell
// that from the player: such verdicts are counted, kept few, and named in the
// report, the rest must be none.
export function corpus(lines: Line[], every = 1) {
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
