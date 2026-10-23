import { fold, hostSays, isCorrect, isFragment, isPassWord, norm } from '../game/normalize';

// Spoken answers, ported from js/voice.js (the web game). The microphone is
// opened when the round starts and kept open, so the player can also answer
// while a clue is still being read. What the iOS recognizer is asked for, and
// why, is in docs/speech.md.
//
// One recognition request serves the whole round (a match: the whole
// match), expecting all of its answers (contextualStrings, fixed when a
// request starts). On iOS every start() of expo-speech-recognition tears the
// audio engine down and builds a new one: it sets the session category and
// makes it active again and turns voice processing on afresh on the input and
// output nodes. That changes the output level of everything playing and cuts
// off or swallows a cue sounding at that moment (#357, after #351 restarted it
// for every question). So a request is replaced only when iOS forces it: it
// ended on its own ('end', an error), or, on the iOS speech servers, its one-minute
// limit is near (REQUEST_REFRESH_MS at a quiet moment, REQUEST_MAX_MS at the
// latest). On-device recognition has no such limit and is never renewed.
// Nothing starts or stops the recognizer while a host clip or a cue plays
// (`busy`): it waits for the silence after it (QUIET_POLL_MS).
//
// iOS keeps growing one result for everything said (on iOS 18 and later it
// also ends each utterance with a final-like result, not always), so interim
// results are used: words already handled are cut off the front, and an
// answer counts once the words stop changing for SETTLE_MS. A right answer or
// a Pas does not wait at all (the round tells, see `Pace`), and the start of
// a longer answer ("Reşat" of Reşat Nuri Güntekin) waits PARTIAL_MS.
// What is heard is in one of three states (docs/speech.md, "Utterance
// states"): incomplete, a completed attempt, or consumed. A lone letter
// (isFragment: "a" of "Ay", which iOS gives after a long silence, as an
// interim and often as its utterance's final) is incomplete: no verdict, and
// not handled either, so the word it begins is judged whole when it comes
// (the letter's final is put in front of it). Nothing waits for it: an
// incomplete letter is dropped unjudged after FRAGMENT_MS, and words after it
// are judged as soon as they would be without it. Words that settle, a right
// answer, a Pas or a final are a completed attempt, delivered once; from then
// on they are consumed (the tail rules below).
// After a verdict the same result goes on growing and being revised ("Sezen"
// → "Sezen Aksu" → a final "Sezen Aksu", its guesses not all the same length).
// For LATE_MS after the verdict, words that carry on without a pause of
// SETTLE_MS, or that are already in the judged guesses ("aksu" of "sezen
// aksu"), belong to the judged answer and are dropped; so is its final,
// whenever it comes (#358). Words after a pause are a new utterance: the next
// answer. Anything heard before the next clue starts is dropped too
// (clueStarts): only what is said after it is an answer to it.
// Words the host is saying (and for ECHO_TAIL_MS after) are the game's own
// voice heard by the mic and are dropped, except a pass word the host is not
// saying: "pas" always gets through. A pass word that is only the start or the
// end of a host word ("bas" of "basket", "geç" of "geçildi" or "yengeç": iOS
// splits words it is unsure of) is the host's. So is a right answer only when
// the host is saying those very words (hostSays): the player's "Anı" is not the
// "anı" of the host's "tanık" (#405; `answers`, given by the round). What is
// left is delivered with `duringHost`, the host's words and
// how much it looks like the host's words (`hostLike`, `hostNear`): the round
// decides from these whether it is a verdict (judgeHeard in normalize.ts).

export const SETTLE_MS = 700;
export const PARTIAL_MS = 1500;
/** After a verdict, the same utterance's late words and revisions are part of it for this long. */
export const LATE_MS = 1500;
export const ECHO_TAIL_MS = 800;
// How long a wrong answer held over the host (counted from the hold) may wait
// for its utterance's final (onTail) once the host is quiet: iOS gave it 1.2 s after the held
// " Cevdet" was judged, its alternatives with " Ceviz" in them (#478), and
// a final 1.7 to 2.1 s after an interim judged at once.
export const HELD_TAIL_MS = 2500;
/** A lone letter (incomplete) waits this long for the word it begins, then is dropped without a verdict. */
export const FRAGMENT_MS = 3000;
/** A request this old is renewed at the next quiet moment (no words for QUIET_MS, nothing pending). */
export const REQUEST_REFRESH_MS = 45_000;
/** ...and renewed regardless at this age, ahead of the iOS one-minute limit. */
export const REQUEST_MAX_MS = 55_000;
export const QUIET_MS = 1000;
/** A renewed request starts once the old one reports 'end', or after this long without it. */
export const RESTART_WAIT_MS = 1000;
/** While a host clip or a cue plays, a start or stop of the recognizer is retried this often. */
export const QUIET_POLL_MS = 100;
/** An on-device request iOS ended on its own at this age was held to the server limit after all. */
export const LIMIT_SEEN_MS = 50_000;

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
  /** The on-device speech model; iOS applies it only where the tr-TR recognizer supports it. */
  requiresOnDeviceRecognition: boolean;
};

// The iOS limit for contextual strings is about 100 phrases.
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
  subscribe(handlers: { result(e: RecResult): void; error(e: RecError): void; end(): void; start?(): void }): () => void;
}

export type MicState = 'off' | 'listening' | 'denied' | 'error';

function words(s: string): string[] {
  return norm(s).split(' ').filter(Boolean);
}

// Three or more guesses with no word in common, not even a shared start
// ("kale" / "kaleler" share one): iOS had no word it was sure of.
function unrelated(guesses: string[]): boolean {
  const sets = guesses.map((g) => words(g).map(fold)).filter((ws) => ws.length);
  if (sets.length < 3) return false;
  const near = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));
  return sets.every((ws, i) => sets.every((other, j) => i === j || !ws.some((w) => other.some((o) => near(w, o)))));
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

/**
 * Heard: the words, and whether any of them came while the host was talking
 * (or just after). hostLike: the best guess is the host's words, or garbled
 * close to them, or the start of one of them (see hostLike). hostNear: one of
 * its words is a slip away from, or the start of, a host word, however short.
 * hostWords: what the host last said, folded word by word.
 */
export type Heard = { alts: string[]; duringHost: boolean; hostLike?: boolean; hostNear?: boolean; hostWords?: string[] };

// The ways a Pas sounds: when the host says one of them, the mic hearing any of them is the host.
const PAS_SOUNDS = ['pas', 'pass', 'paso', 'bas', 'bass'];

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
  private uttDuringHost = false;  // the utterance a final ends had words while the host talked
  // An incomplete lone letter: its text, whether its result was final (then the
  // next result does not hold it and it is put in front of the next words), and
  // whether it came while the host talked.
  private fragment: { text: string; final: boolean; duringHost: boolean } | null = null;
  private fragmentTimer: ReturnType<typeof setTimeout> | null = null;
  private interimSeen = false;  // the current utterance had an interim result (a final ends it)
  private echoSeen = 0;       // words of the current result heard as the host's while an answer settles
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private echo: string[] = [];
  private echoUntil = 0;
  private pace: Pace | null = null;
  private answers: (() => readonly string[]) | null = null;
  private context: string[] = [];
  private prevWords: string[] = [];  // the first guess as last heard, for rewritten words
  private swallowUntil = 0;   // the rest of an utterance already judged (LATE_MS)
  private tailOpen = false;   // an utterance was judged and its final has not come yet
  private tailFrom = 0;       // words of the result handled before the judged attempt began
  private seenCount = 0;      // words in the current result as last heard
  private judged: string[] = [];  // what the last verdict's guesses had beyond its best guess, folded
  private wordsAt = 0;        // when the player's words last changed
  private renewing = false;   // the request was dropped on purpose; the next starts on its 'end'
  private closing = false;    // stop() came while something played: the request is aborted at the next silence
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private limited = false;    // iOS held an on-device request to the server's minute anyway
  private startedAt = 0;
  private lastResultAt = 0;
  private ageTimer: ReturnType<typeof setTimeout> | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  private staleEndUntil = 0;  // an 'end' before this, with nothing heard yet, is the one of a request closed by stop()
  private heardThisRequest = false;
  private staleEnds = 0;      // 'end's still owed by requests renewed without waiting for them
  private up = false;         // the mic has really started since it was opened ('start' came)
  private upWaiters: (() => void)[] = [];
  /** How many times the recognizer was started: once per round when all is well. */
  starts = 0;
  /** Requests renewed on purpose (the server's time limit, the server fallback). */
  renewals = 0;
  /** How many times the mic was opened from closed (listen() after stop()). */
  openings = 0;
  /** Ask for on-device recognition; off after it failed once (then the iOS speech servers). */
  onDevice = true;
  onState: (s: MicState, detail?: string) => void = () => {};
  onInterim: (text: string) => void = () => {};
  /** Every result and decision, for the voice evidence file (trace.ts, set by engine.ts). */
  onTrace: (e: string, data?: Record<string, unknown>) => void = () => {};
  /**
   * The final of an utterance already judged on an interim, its guesses
   * without the host's words: a wrong answer held over the host is judged
   * on them too (finalRights, #478). Set by useVoiceRound.
   */
  onTail: (alts: string[]) => void = () => {};
  /** A host clip or a cue is sounding: the recognizer is not started or stopped now (set by engine.ts). */
  busy: () => boolean = () => false;

  constructor(private rec: Recognizer, private now: () => number = () => Date.now()) {}

  // Opens the mic for a round; while it is open a new handler just replaces the old one.
  // `context`: the words to expect, for the next request that starts. A
  // running request keeps its own: it is never restarted for new words.
  // `answers`: the right answers to the question being asked, never taken for the host's words.
  listen(handler: (alts: string[], heard: Heard) => void, pace?: Pace, context?: string[], answers?: () => readonly string[]) {
    this.handler = handler;
    this.pace = pace ?? null;
    this.answers = answers ?? null;
    if (!this.wanted) this.openings++;
    this.wanted = true;
    if (context) this.context = context;
    if (this.closing) {
      // Reopened before the closing request was aborted: it simply goes on.
      this.closing = false;
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.closeTimer = null;
      this.up = true;
      if (this.timeLimited) this.ageTimer = setTimeout(() => this.checkAge(), Math.max(0, REQUEST_REFRESH_MS - (this.now() - this.startedAt)));
      this.onState('listening');
      return;
    }
    this.startRec();
  }

  /** Requests are held to the server's one-minute limit (server recognition) and renewed ahead of it. */
  private get timeLimited(): boolean {
    return !this.onDevice || this.limited;
  }

  /** 'on-device' or 'server': what the next (or running) request asks iOS for. */
  get mode(): 'on-device' | 'server' {
    return this.onDevice ? 'on-device' : 'server';
  }

  stop() {
    this.wanted = false;
    this.handler = null;
    this.pace = null;
    this.answers = null;
    this.swallowUntil = 0;
    this.tailOpen = false;
    this.renewing = false;
    this.staleEnds = 0;
    this.clearTimers();
    this.lastAlts = null;
    this.fragment = null;
    this.up = false;
    this.wakeUpWaiters();
    if (this.running && !this.closing) this.close();
    else if (!this.running && this.unsub) { this.unsub(); this.unsub = null; }
    this.onState('off');
  }

  /**
   * Closes the mic now, not at the next silence: the mic check and the test
   * screen are about to use the recognizer themselves.
   */
  release() {
    if (this.wanted) this.stop();
    if (this.closing) this.close(true);
  }

  // Aborts the request of a closed mic, once nothing is playing.
  private close(now = false) {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    if (!now && this.busy()) {
      this.closing = true;
      this.closeTimer = setTimeout(() => this.close(), QUIET_POLL_MS);
      return;
    }
    this.closing = false;
    if (this.unsub) { this.unsub(); this.unsub = null; }
    if (!this.running) return;
    this.running = false;
    this.staleEndUntil = this.now() + 2 * RESTART_WAIT_MS;
    try { this.rec.abort(); } catch { /* already stopped */ }
  }

  get listening() {
    return this.running && !this.closing;
  }

  /** The mic was opened and its first request has really started (the recognizer said 'start'). */
  get micUp() {
    return this.up;
  }

  /** The mic is meant to be open (listen() was called and not stop()). */
  get open() {
    return this.wanted;
  }

  /**
   * Resolves once the mic opened by listen() has really started: on iOS the
   * recognizer's 'start' comes after its audio engine, voice processing and
   * all, is running. Also resolves when the mic is closed, or after `maxMs`,
   * so nobody waits for a recognizer that never answers.
   */
  whenUp(maxMs: number): Promise<void> {
    if (this.up || !this.wanted) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(done, maxMs);
      function done() { clearTimeout(t); resolve(); }
      this.upWaiters.push(done);
    });
  }

  private wakeUpWaiters() {
    const ws = this.upWaiters;
    this.upWaiters = [];
    ws.forEach((w) => w());
  }

  private onStart() {
    if (!this.running || this.up) return;
    this.up = true;
    this.wakeUpWaiters();
  }

  /**
   * The next clue starts (or the same one is read again): whatever was heard
   * before it, judged or not, is not an answer to it.
   */
  clueStarts() {
    this.onTrace('clue-starts');
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.dropFragment();
    if (this.lastAlts) {
      this.lastAlts = null;
      this.lastKey = '';
      this.lastDuringHost = false;
      this.tailOpen = true;
    }
    this.used = Math.max(this.used, this.seenCount);
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
    // A pass word is the player's unless the host says it, or a word it is the start or end of.
    if (isPassWord(f)) return this.echo.some((e) => e.startsWith(f) || e.endsWith(f) || (PAS_SOUNDS.includes(f) && PAS_SOUNDS.includes(e)));
    // A piece of a longer host word: iOS split it ("kırmızı" → "kır mızı"). Left in,
    // the pieces would also read as the player still talking (the #358 tail rule).
    if (f.length >= 3 && this.echo.some((e) => e.length > f.length && e.includes(f))) return true;
    // "Hazır mısınız?" must not swallow the player's "hazırım", so only a slip counts as near:
    // one letter in a word of four or more, two in a long word.
    return this.echo.some((e) => e === f
      || (f.length >= 5 && Math.abs(e.length - f.length) <= 1 && e.slice(0, 4) === f.slice(0, 4))
      || (f.length >= 4 && Math.abs(e.length - f.length) <= 2 && distance(e, f) <= (f.length >= 8 ? 2 : 1)));
  }

  /**
   * Heard words without the game's own voice (isEcho), except the words of a
   * right answer the host is not saying itself: a word near a host word is
   * dropped as its echo, but the player's answer to this clue may well be near
   * one ("Anı" said over "tanık olduklarını", "Zile" over "Ze ile başlıyor").
   */
  private withoutEcho(ws: string[]): string[] {
    const answers = this.answers?.() ?? [];
    const keep = new Set<number>();
    if (answers.length && this.echoActive) {
      const most = Math.max(...answers.map((a) => words(a).length));
      for (let i = 0; i < ws.length; i++) {
        for (let j = i + 1; j <= Math.min(ws.length, i + most); j++) {
          const run = ws.slice(i, j).join(' ');
          if (isCorrect(run, answers) && !hostSays(run, this.echo)) for (let k = i; k < j; k++) keep.add(k);
        }
      }
    }
    return ws.filter((w, i) => keep.has(i) || !this.isEcho(w));
  }

  /**
   * How many of the last heard words are the start of a right answer of more
   * words ("harf" of "Harf Devrimi", near the host's "harfleri"): dropped as the
   * host's for now, but not handled, so the answer is whole once the rest comes.
   */
  private answerBegun(ws: string[]): number {
    const answers = (this.answers?.() ?? []).map((a) => words(a).map(fold));
    for (let k = Math.min(ws.length, Math.max(0, ...answers.map((a) => a.length - 1))); k > 0; k--) {
      const tail = ws.slice(-k).map(fold);
      if (answers.some((a) => a.length > k && tail.every((w, i) => a[i] === w))) return k;
    }
    return 0;
  }

  /**
   * Heard words that are the host's last words, or garbled close to them, or
   * the start of one of them ("ay" of "aydınlık", a word iOS has only begun):
   * heard while the host talks they are no answer of any kind. Words of which
   * at most half are near the host's are the player's, so "Merkür" said over
   * the Mars clue is.
   */
  hostLike(text: string): boolean {
    const ws = words(text).map(fold);
    if (!ws.length || !this.echo.length) return false;
    const said = ws.join('');
    if (said.length >= 5 && this.echo.join('').includes(said)) return true;
    if (ws.length === 1 && said.length >= 2 && this.echo.some((e) => e.length > said.length && e.startsWith(said))) return true;
    const near = ws.filter((f) => this.echo.some((e) => e === f
      || (f.length >= 4 && Math.abs(e.length - f.length) <= 3 && e.slice(0, 4) === f.slice(0, 4))
      || (f.length >= 4 && Math.abs(e.length - f.length) <= 2 && distance(e, f) <= (f.length >= 8 ? 2 : 1)))).length;
    return near * 2 > ws.length;
  }

  /**
   * One of the words is a slip away from a host word, however short ("me" →
   * "ma"), or the start or a piece of one ("kıyı" of "kıyısında", "ildi" of
   * "geçildi" split in two), or one with a short ending added. Looser than hostLike: a wrong answer heard over the host is
   * judged only without any such word (see judgeHeard).
   */
  hostNear(text: string): boolean {
    if (!this.echo.length) return false;
    return words(text).map(fold).some((f) => this.echo.some((e) => e === f
      || (f.length >= 2 && e.startsWith(f))
      || (f.length >= 3 && e.includes(f))
      || (e.length >= 3 && f.startsWith(e) && f.length - e.length <= 3)
      // A letter name ("A", "Be" of "... ile başlıyor") misheard is the same length
      // ("me" → "ma"); the player's "Aç" said just after "A ile başlıyor" is longer (#455).
      || (f.length >= 2 && Math.abs(e.length - f.length) <= (e.length <= 2 ? 0 : 1) && distance(e, f) <= (f.length >= 8 ? 2 : 1))));
  }

  /** An utterance was judged on an interim and its final (onTail) has not come yet. */
  get tailPending(): boolean {
    return this.tailOpen;
  }

  /** The host is talking, or stopped less than ECHO_TAIL_MS ago. */
  get hostRecent(): boolean {
    return this.echoActive;
  }

  private clearTimers() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.ageTimer) clearTimeout(this.ageTimer);
    if (this.renewTimer) clearTimeout(this.renewTimer);
    if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
    this.settleTimer = this.restartTimer = this.ageTimer = this.renewTimer = this.fragmentTimer = null;
  }

  // Drops the running request on purpose (the time limit); renewed() starts the next one.
  private renew() {
    if (!this.running || this.renewing) return;
    this.renewing = true;
    this.renewals++;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.ageTimer) clearTimeout(this.ageTimer);
    this.settleTimer = this.ageTimer = null;
    this.lastAlts = null;
    this.dropFragment(false);
    this.renewTimer = setTimeout(() => this.renewed(true), RESTART_WAIT_MS);
    try { this.rec.abort(); } catch { this.renewed(); }
  }

  // The old request has ended (or never said so in time): the next one starts at once.
  // Its 'end', if it comes after all, must not be taken for the new one's.
  private renewed(late = false) {
    if (!this.renewing) return;
    this.renewing = false;
    if (late) this.staleEnds++;
    if (this.renewTimer) clearTimeout(this.renewTimer);
    this.renewTimer = null;
    this.running = false;
    this.startRec();
  }

  // Server recognition takes about a minute of audio per request: an
  // old request is renewed when nobody is talking, and before the limit
  // regardless of the player, but never while the game itself is sounding.
  private checkAge() {
    this.ageTimer = null;
    if (!this.running || this.renewing || this.closing) return;
    const now = this.now();
    const quiet = !this.lastAlts && !this.fragment && now - this.lastResultAt >= QUIET_MS;
    if (!this.busy() && (quiet || now - this.startedAt >= REQUEST_MAX_MS)) this.renew();
    else this.ageTimer = setTimeout(() => this.checkAge(), 250);
  }

  private startRec() {
    if (!this.wanted || this.running) return;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (this.busy()) {
      this.restartTimer = setTimeout(() => this.startRec(), QUIET_POLL_MS);
      return;
    }
    this.used = 0;
    this.seenCount = 0;
    this.interimSeen = false;
    this.lastKey = '';
    this.lastAlts = null;
    this.lastDuringHost = false;
    this.uttDuringHost = false;
    this.echoSeen = 0;
    this.prevWords = [];
    this.swallowUntil = 0;
    this.tailOpen = false;
    // A letter heard just before the request ended is not in the new one's results.
    if (this.fragment) this.fragment.final = true;
    if (!this.unsub) {
      this.unsub = this.rec.subscribe({
        result: (e) => this.onResult(e),
        error: (e) => this.onError(e),
        end: () => this.onEnd(),
        start: () => this.onStart(),
      });
    }
    this.running = true;
    this.starts++;
    this.onTrace('request', { starts: this.starts, mode: this.mode, contextualStrings: this.context });
    this.startedAt = this.lastResultAt = this.now();
    this.heardThisRequest = false;
    if (this.ageTimer) clearTimeout(this.ageTimer);
    this.ageTimer = this.timeLimited ? setTimeout(() => this.checkAge(), REQUEST_REFRESH_MS) : null;
    try {
      this.rec.start({
        lang: 'tr-TR', continuous: true, interimResults: true, maxAlternatives: 5,
        requiresOnDeviceRecognition: this.onDevice,
        ...(this.context.length ? { contextualStrings: this.context } : {}),
      });
      this.onState('listening');
    } catch (err) {
      this.running = false;
      this.onState('error', String(err));
    }
  }

  private onResult(e: RecResult) {
    if (!this.running || this.renewing || this.closing) return;
    this.onTrace('result', { final: e.isFinal, alts: e.results.map((r) => r.transcript) });
    this.lastResultAt = this.now();
    this.heardThisRequest = true;
    const skip = this.realign(words(e.results[0]?.transcript ?? ''));
    this.used = skip;
    let count = 0;
    let alts: string[] = [];
    let bestDropped = false;  // iOS's best guess was all the host's words: the rest moved up
    e.results.forEach((r, i) => {
      let w = words(r.transcript);
      if (i === 0) count = w.length;
      const heard = w.slice(skip);
      w = this.withoutEcho(heard);
      if (i === 0 && heard.length && !w.length) bestDropped = true;
      if (w.length) alts.push(w.join(' '));
    });
    // A final with no interim before it in this utterance: iOS wrote nothing
    // while it listened. With no speech at all (the host's voice cancelled, a
    // quiet room) it still ends with a guess at the noise (the phone, 22 Oct:
    // "Evet / Hayır / Gönder / Tamam", "İşte / Ara / Kapat / İsterim / Evet").
    const finalOnly = e.isFinal && !this.interimSeen;
    this.interimSeen = e.isFinal ? false : this.interimSeen || count > skip;
    // An incomplete letter whose result was final begins these words: one utterance.
    const frag = this.fragment;
    if (frag?.final && alts.length) alts = alts.map((a) => `${frag.text} ${a}`);
    const rewritten = this.rewritten(words(e.results[0]?.transcript ?? ''), skip);
    this.prevWords = e.isFinal ? [] : words(e.results[0]?.transcript ?? '');
    const grew = count > this.seenCount;
    this.seenCount = e.isFinal ? 0 : count;
    const pause = this.now() - this.wordsAt >= SETTLE_MS;
    if (alts.length) this.wordsAt = this.now();
    // New words after a pause, with nothing pending, start a new utterance:
    // earlier words heard over the host no longer make its final the host's
    // (#438). A final that only repeats words already heard is not new.
    if (pause && grew && alts.length && !this.lastAlts && !frag) this.uttDuringHost = false;
    // A final repeats (and may revise) the whole utterance: if any of it came
    // while the host talked, so did the final.
    const uttHost = this.uttDuringHost || this.echoActive;
    this.uttDuringHost = e.isFinal ? false : uttHost;
    // The judged utterance growing or being revised after its verdict ("Sezen
    // Aksu" after "Sezen", "pas geçiyorum" after "pas"), or its final: already
    // handled, whatever the word count of each guess. A final ends it.
    const window = this.now() < this.swallowUntil;
    // New words after a pause that the judged guesses did not already hold: a new utterance.
    const fresh = alts.length > 0 && pause && !this.revises(alts[0]);
    const late = window && alts.length > 0 && !fresh;
    // A final that ends the judged utterance may also carry a new short one
    // iOS gave no interim for ("pas" said once, #362): a Pas or a right answer
    // in it still counts; anything else in it is dropped with the tail.
    const carried = e.isFinal && this.tailOpen && !late && fresh && this.pace?.(alts) === 'now';
    if (!this.lastAlts && !carried && (late || (e.isFinal && this.tailOpen))) {
      this.onTrace('consumed', { alts, final: e.isFinal });
      // The judged utterance's final: a held wrong answer looks at its guesses
      // (#478), each from where the attempt began, not cut where it was judged.
      if (e.isFinal && this.tailOpen) this.onTail(e.results.map((r) => this.withoutEcho(words(r.transcript).slice(this.tailFrom)).join(' ')).filter(Boolean));
      this.used = e.isFinal ? 0 : Math.max(skip, count);
      if (e.isFinal) {
        this.swallowUntil = 0;
        this.tailOpen = false;
      }
      return;
    }
    if (!alts.length && rewritten.length && !this.lastAlts && (pause || !window) && this.pace?.(rewritten) === 'now') {
      this.wordsAt = this.now();
      this.lastAlts = rewritten;
      this.lastCount = count;
      this.lastDuringHost = this.echoActive;
      this.deliver(false);
      return;
    }
    if (!alts.length) {
      // Only the game's own voice so far, or the judged words again: mark it
      // handled so it never prefixes an answer.
      if (!this.lastAlts && (this.echoActive || window)) this.used = Math.max(skip, count - this.answerBegun(words(e.results[0]?.transcript ?? '').slice(skip)));
      // ...and while an answer is settling, once it is delivered (#391: "Yengeç
      // bulutsusu olacaktı" after a misheard "yen", replayed by its final).
      else if (this.lastAlts && this.echoActive) this.echoSeen = Math.max(this.echoSeen, count);
      if (e.isFinal) this.used = this.echoSeen = 0;
      if (e.isFinal && this.fragment) this.fragment.final = true;
      return;
    }
    if (this.echoActive) this.lastDuringHost = true;
    // Nothing new, keep the settle timer running. Every guess counts: the best
    // one may lag behind another that already has the whole answer.
    const key = alts.join('|');
    if (key === this.lastKey && !e.isFinal) {
      // Only words dropped as the host's came: handled with the answer.
      if (this.echoActive) this.echoSeen = Math.max(this.echoSeen, count);
      return;
    }
    this.lastKey = key;
    const pace = this.pace?.(alts) ?? 'settle';
    // Uncertain (#438): such a final whose best guess was the host's (the rest
    // only moved up), or whose guesses share no word at all (unrelated words:
    // iOS guessing, not hearing), counts only as a right answer or a Pas,
    // never as a wrong one. A short answer said once (iOS gives no interim for
    // "Ay" alone) keeps its best guess and its guesses agree, so it is judged.
    if (finalOnly && pace !== 'now' && (bestDropped || unrelated(e.results.map((r) => r.transcript)))) {
      this.onTrace('dropped', { alts, uncertain: bestDropped ? 'best-guess-host' : 'unrelated-guesses' });
      this.lastAlts = null;
      this.lastKey = '';
      this.lastDuringHost = false;
      this.used = this.echoSeen = 0;
      return;
    }
    // Incomplete: lone letters that are neither a right answer nor a Pas.
    if (pace !== 'now' && isFragment(alts[0])) return this.holdFragment(alts[0], e.isFinal);
    // The word an incomplete letter began: it is part of this attempt (a final
    // letter is put in front of each of its results until it is delivered).
    if (this.fragment?.duringHost) this.lastDuringHost = true;
    if (this.fragment?.final) this.keepFragment();
    else this.dropFragment(false);
    this.lastAlts = alts;
    this.lastCount = count;
    this.tailOpen = false;
    this.onInterim(alts[0]);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (e.isFinal) {
      if (uttHost) this.lastDuringHost = true;
      this.deliver(true);
    } else if (pace === 'now') this.deliver(false);
    else this.settleTimer = setTimeout(() => this.deliver(false), pace === 'partial' ? PARTIAL_MS : SETTLE_MS);
  }

  // Lone letters heard (incomplete): not judged and not handled, so the word
  // they begin is whole when it comes. Dropped, unjudged, after FRAGMENT_MS.
  private holdFragment(text: string, final: boolean) {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    const prev = this.fragment;
    const duringHost = this.lastDuringHost || !!prev?.duringHost;
    // An interim after a final letter holds only its own letters: the final's text stays in front.
    this.fragment = prev?.final && !final ? { ...prev, duringHost } : { text, final, duringHost };
    this.lastAlts = null;
    this.lastDuringHost = false;
    this.tailOpen = false;
    // Its final ends the result: the next one starts afresh, the letter put in front of it.
    if (final) this.used = this.echoSeen = 0;
    this.onTrace('incomplete', { text: this.fragment.text, final });
    this.onInterim(text);
    if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
    this.fragmentTimer = setTimeout(() => {
      this.fragmentTimer = null;
      if (!this.fragment) return;
      this.onTrace('dropped', { text: this.fragment.text });
      this.dropFragment();
      this.onInterim('');
    }, FRAGMENT_MS);
  }

  // A final letter whose word has begun: it waits for the word, not for FRAGMENT_MS.
  private keepFragment() {
    if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
    this.fragmentTimer = null;
  }

  // The incomplete letter is done with: continued (`consumed` false: its words
  // belong to the attempt now pending) or dropped, its words then handled.
  private dropFragment(consumed = true) {
    if (this.fragmentTimer) clearTimeout(this.fragmentTimer);
    this.fragmentTimer = null;
    if (consumed && this.fragment && !this.fragment.final && !this.lastAlts) this.used = Math.max(this.used, this.seenCount);
    this.fragment = null;
  }

  // Heard words that a judged guess already had and its best guess did not yet
  // ("aksu" when "sezen" was judged with "sezen aksu" among the guesses),
  // however iOS split them. Words the best guess itself had are not: "pas"
  // after a judged "pas" is the next Pas (#362).
  private revises(alt: string): boolean {
    const f = fold(alt);
    return !!f && this.judged.some((j) => j.includes(f));
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
    return out.filter((t) => t && this.withoutEcho(t.split(' ')).length > 0);
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
    this.dropFragment(false);
    // The next answer starts after these words; a final result starts a fresh one.
    // Until then, what the same result still adds is part of this answer.
    this.tailFrom = this.used;
    this.used = final ? 0 : Math.max(this.used, this.lastCount, this.echoSeen);
    this.echoSeen = 0;
    this.swallowUntil = final ? 0 : this.now() + LATE_MS;
    this.tailOpen = !final;
    const best = fold(alts[0]);
    this.judged = alts.slice(1).map((a) => { const f = fold(a); return f.startsWith(best) ? f.slice(best.length) : f; }).filter(Boolean);
    this.onTrace('attempt', { alts, final, duringHost });
    this.handler?.(alts, { alts, duringHost, hostLike: this.hostLike(alts[0]), hostNear: this.hostNear(alts[0]), hostWords: this.echo });
  }

  private onError(e: RecError) {
    this.onTrace('error', { error: e.error });
    if (this.renewing || this.closing) return;  // the 'aborted' of a request dropped on purpose
    if (e.error === 'service-not-allowed' && this.onDevice && this.running) {
      // On-device recognition failed (its model missing, or not for tr-TR
      // after all): the next request goes to the iOS speech servers. Only if they
      // refuse too is Siri and Dictation really off.
      this.onDevice = false;
      this.renewing = true;
      this.renewals++;
      if (this.renewTimer) clearTimeout(this.renewTimer);
      this.renewTimer = setTimeout(() => this.renewed(true), RESTART_WAIT_MS);
      return;
    }
    // A real error: the 'end' after it belongs to this request.
    if (e.error !== 'aborted') this.staleEndUntil = 0;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      this.wanted = false;
      this.wakeUpWaiters();
      this.onState('denied', e.error);
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      this.onState('error', e.error);
    }
  }

  // iOS ends a session on its own now and then (an interruption, a long
  // silence, the server's minute): what was said is delivered and the mic
  // opens again, once nothing is playing (startRec).
  private onEnd() {
    this.onTrace('request-end', { renewing: this.renewing });
    if (this.renewing) return this.renewed();
    if (this.staleEnds > 0) {
      this.staleEnds--;
      return;
    }
    if (this.now() < this.staleEndUntil && !this.heardThisRequest) {
      this.staleEndUntil = 0;
      return;
    }
    if (!this.running) return;
    this.running = false;
    if (this.closing) {
      this.closing = false;
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.closeTimer = null;
      if (this.unsub) { this.unsub(); this.unsub = null; }
      return;
    }
    if (this.onDevice && this.now() - this.startedAt >= LIMIT_SEEN_MS) this.limited = true;
    if (this.ageTimer) clearTimeout(this.ageTimer);
    this.ageTimer = null;
    if (this.lastAlts) this.deliver(true);
    if (this.wanted) this.restartTimer = setTimeout(() => this.startRec(), 250);
    else this.onState('off');
  }
}
