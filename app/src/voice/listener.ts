import { fold, isPassWord, norm } from '../game/normalize';

// Spoken answers, ported from js/voice.js (the web game). The microphone is
// opened once per round and kept open: on iOS every start plays the system
// chime and a late start misses the answer, so the player can also answer
// while a clue is still being read.
//
// iOS keeps growing one result for everything said and never marks it final,
// so interim results are used: words already handled are cut off the front,
// and an answer counts once the words stop changing for SETTLE_MS. A right
// answer or a Pas does not wait at all (the round tells, see `Pace`), and the
// start of a longer answer ("Reşat" of Reşat Nuri Güntekin) waits PARTIAL_MS.
// Words the host is saying (and for ECHO_TAIL_MS after) are the game's own
// voice heard by the mic and are dropped, except a pass word the host is not
// saying: "pas" always gets through.

export const SETTLE_MS = 700;
export const PARTIAL_MS = 1500;
export const ECHO_TAIL_MS = 800;

/** How soon heard words can be judged: at once, after a long pause, or once they settle. */
export type Pace = (alts: string[]) => 'now' | 'partial' | 'settle';

export type RecResult = { isFinal: boolean; results: { transcript: string }[] };
export type RecError = { error: string; message?: string };

export type RecOptions = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  contextualStrings?: string[];
};

// Apple's limit for contextual strings is about 100 phrases.
const MAX_CONTEXT = 100;
const CONTEXT_PASS = ['pas', 'geç', 'pas geçiyorum'];

/**
 * Words the recognizer should expect: the pass words, then the round's
 * answers, shortest first. iOS tends to sit on a lone short word ("Ay", "Su")
 * until more speech follows unless it was told to expect it.
 */
export function contextFor(answers: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of [...CONTEXT_PASS, ...[...answers].sort((x, y) => x.length - y.length)]) {
    const k = fold(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out.slice(0, MAX_CONTEXT);
}

// The part of expo-speech-recognition the listener uses (see recognizer.ts).
export interface Recognizer {
  start(options: RecOptions): void;
  abort(): void;
  subscribe(handlers: { result(e: RecResult): void; error(e: RecError): void; end(): void }): () => void;
}

export type MicState = 'off' | 'listening' | 'denied' | 'error';

function words(s: string): string[] {
  return norm(s).split(' ').filter(Boolean);
}

// Edit distance, for heard words that are a slip away from what the host said.
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Heard: the words, and whether any of them came while the host was talking (or just after). */
export type Heard = { alts: string[]; duringHost: boolean };

export class AnswerListener {
  private wanted = false;
  private running = false;
  private handler: ((alts: string[], heard: Heard) => void) | null = null;
  private unsub: (() => void) | null = null;
  private used = 0;           // words of the current result already handled
  private lastKey = '';
  private lastAlts: string[] | null = null;
  private lastCount = 0;
  private lastDuringHost = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private echo: string[] = [];
  private echoUntil = 0;
  private pace: Pace | null = null;
  private context: string[] = [];
  private prevWords: string[] = [];  // the first guess as last heard, for rewritten words
  private swallowUntil = 0;   // the rest of an utterance already judged at once
  /** How many times the recognizer was started (once per round when all is well). */
  starts = 0;
  onState: (s: MicState, detail?: string) => void = () => {};
  onInterim: (text: string) => void = () => {};

  constructor(private rec: Recognizer, private now: () => number = () => Date.now()) {}

  // Opens the mic for a round; while it is open a new handler just replaces the old one.
  // `context`: words to expect, used when the recognizer (re)starts; an open
  // session keeps the ones it was started with.
  listen(handler: (alts: string[], heard: Heard) => void, pace?: Pace, context?: string[]) {
    this.handler = handler;
    this.pace = pace ?? null;
    if (context) this.context = context;
    this.wanted = true;
    this.startRec();
  }

  stop() {
    this.wanted = false;
    this.handler = null;
    this.pace = null;
    this.swallowUntil = 0;
    this.clearTimers();
    this.lastAlts = null;
    if (this.unsub) { this.unsub(); this.unsub = null; }
    if (this.running) {
      this.running = false;
      try { this.rec.abort(); } catch { /* already stopped */ }
    }
    this.onState('off');
  }

  get listening() {
    return this.running;
  }

  // The host started saying these words: the mic will hear them too.
  hostSpeaking(texts: string[]) {
    this.echo = texts.flatMap(words).map(fold);
    this.echoUntil = Infinity;
  }

  // The host stopped; the room still rings for a moment.
  hostDone() {
    if (this.echoUntil === Infinity) this.echoUntil = this.now() + ECHO_TAIL_MS;
  }

  private get echoActive() {
    return this.now() <= this.echoUntil;
  }

  // A heard word is the game's own voice if it matches, or nearly matches, a word being said.
  isEcho(w: string): boolean {
    if (this.now() > this.echoUntil) return false;
    const f = fold(w);
    if (isPassWord(f) && !this.echo.includes(f)) return false;
    // "Hazır mısınız?" must not swallow the player's "hazırım", so only a slip counts as near:
    // one letter in a word of four or more, two in a long word.
    return this.echo.some((e) => e === f
      || (f.length >= 5 && Math.abs(e.length - f.length) <= 1 && e.slice(0, 4) === f.slice(0, 4))
      || (f.length >= 4 && Math.abs(e.length - f.length) <= 2 && distance(e, f) <= (f.length >= 8 ? 2 : 1)));
  }

  /**
   * Heard words that are the host's last words, or garbled close to them: a
   * wrong answer heard while the host talks is ignored only then. Words of
   * which at most half are near the host's are the player's, so "Merkür"
   * said over the Mars clue is judged.
   */
  hostLike(text: string): boolean {
    const ws = words(text).map(fold);
    if (!ws.length || !this.echo.length) return false;
    const said = ws.join('');
    if (said.length >= 5 && this.echo.join('').includes(said)) return true;
    const near = ws.filter((f) => this.echo.some((e) => e === f
      || (f.length >= 4 && Math.abs(e.length - f.length) <= 3 && e.slice(0, 4) === f.slice(0, 4))
      || (f.length >= 4 && Math.abs(e.length - f.length) <= 2 && distance(e, f) <= (f.length >= 8 ? 2 : 1)))).length;
    return near * 2 > ws.length;
  }

  /** The host is talking, or stopped less than ECHO_TAIL_MS ago. */
  get hostRecent(): boolean {
    return this.echoActive;
  }

  private clearTimers() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.settleTimer = this.restartTimer = null;
  }

  private startRec() {
    if (!this.wanted || this.running) return;
    this.used = 0;
    this.lastKey = '';
    this.lastAlts = null;
    this.lastDuringHost = false;
    this.prevWords = [];
    if (!this.unsub) {
      this.unsub = this.rec.subscribe({
        result: (e) => this.onResult(e),
        error: (e) => this.onError(e),
        end: () => this.onEnd(),
      });
    }
    this.running = true;
    this.starts++;
    try {
      this.rec.start({
        lang: 'tr-TR', continuous: true, interimResults: true, maxAlternatives: 5,
        ...(this.context.length ? { contextualStrings: this.context } : {}),
      });
      this.onState('listening');
    } catch (err) {
      this.running = false;
      this.onState('error', String(err));
    }
  }

  private onResult(e: RecResult) {
    if (!this.running) return;
    const skip = this.realign(words(e.results[0]?.transcript ?? ''));
    this.used = skip;
    let count = 0;
    const alts: string[] = [];
    e.results.forEach((r, i) => {
      let w = words(r.transcript);
      if (i === 0) count = w.length;
      w = w.slice(skip).filter((x) => !this.isEcho(x));
      if (w.length) alts.push(w.join(' '));
    });
    const rewritten = this.rewritten(words(e.results[0]?.transcript ?? ''), skip);
    this.prevWords = e.isFinal ? [] : words(e.results[0]?.transcript ?? '');
    if (!alts.length && rewritten.length && !this.lastAlts && this.pace?.(rewritten) === 'now') {
      this.lastAlts = rewritten;
      this.lastCount = count;
      this.lastDuringHost = this.echoActive;
      this.swallowUntil = this.now() + SETTLE_MS;
      this.deliver(false);
      return;
    }
    if (!alts.length) {
      // Only the game's own voice so far: mark it handled so it never prefixes an answer.
      if (!this.lastAlts && this.echoActive) this.used = Math.max(skip, count);
      if (e.isFinal) this.used = 0;
      return;
    }
    // More words of an utterance that was judged at once ("pas" ... "geçiyorum"): already handled.
    if (!this.lastAlts && this.now() < this.swallowUntil) {
      this.used = e.isFinal ? 0 : Math.max(skip, count);
      this.swallowUntil = this.now() + SETTLE_MS;
      return;
    }
    if (this.echoActive) this.lastDuringHost = true;
    if (alts[0] === this.lastKey && !e.isFinal) return;  // nothing new, keep the settle timer running
    this.lastKey = alts[0];
    this.lastAlts = alts;
    this.lastCount = count;
    this.onInterim(alts[0]);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    const pace = this.pace?.(alts) ?? 'settle';
    if (e.isFinal) this.deliver(true);
    else if (pace === 'now') {
      this.swallowUntil = this.now() + SETTLE_MS;
      this.deliver(false);
    } else this.settleTimer = setTimeout(() => this.deliver(false), pace === 'partial' ? PARTIAL_MS : SETTLE_MS);
  }

  // iOS re-splits words it already gave ("ankara" → "an kara"): the handled
  // part is found again by its letters, so a split does not look like new words.
  private realign(cur: string[]): number {
    const used = this.used;
    const prev = this.prevWords;
    if (!used || prev.length < used || cur.slice(0, used).every((w, i) => w === prev[i])) return used;
    const handled = fold(prev.slice(0, used).join(''));
    let text = '';
    for (let k = 1; k <= cur.length; k++) {
      text += fold(cur[k - 1]);
      if (text === handled) return k;
      if (text.length > handled.length) break;
    }
    return used;
  }

  // iOS sometimes rewrites words it already gave instead of adding a new one:
  // a short answer said after "su" can come back glued on as "suun". When no
  // new word came but handled ones changed, the changed words (and, for a word
  // that grew, its new ending) are offered; they count only as a right answer
  // or a Pas, never as a wrong one, and never when they are the host's words.
  private rewritten(cur: string[], used: number): string[] {
    const prev = this.prevWords;
    if (!prev.length || cur.length > used) return [];
    let p = 0;
    while (p < cur.length && p < prev.length && cur[p] === prev[p]) p++;
    if (p >= cur.length) return [];
    const out = [cur.slice(p).join(' ')];
    const a = fold(prev[p] ?? '');
    const b = fold(cur[p]);
    if (a && b.length > a.length && b.startsWith(a)) out.push(b.slice(a.length), b.slice(a.length - 1));
    return out.filter((t) => t && !t.split(' ').every((w) => this.isEcho(w)));
  }

  private deliver(final: boolean) {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    const alts = this.lastAlts;
    if (!alts) return;
    const duringHost = this.lastDuringHost || this.echoActive;
    this.lastAlts = null;
    this.lastKey = '';
    this.lastDuringHost = false;
    // The next answer starts after these words; a final result starts a fresh one.
    this.used = final ? 0 : Math.max(this.used, this.lastCount);
    this.handler?.(alts, { alts, duringHost });
  }

  private onError(e: RecError) {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      this.wanted = false;
      this.onState('denied', e.error);
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      this.onState('error', e.error);
    }
  }

  // iOS ends a session on its own now and then (an interruption, a long
  // silence): what was said is delivered and the mic opens again.
  private onEnd() {
    if (!this.running) return;
    this.running = false;
    if (this.lastAlts) this.deliver(true);
    if (this.wanted) this.restartTimer = setTimeout(() => this.startRec(), 250);
    else this.onState('off');
  }
}
