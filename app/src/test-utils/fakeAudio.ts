// expo-audio and expo-speech for tests: clips and speech "play" for a fixed
// time on jest's clock and report their end the way the real modules do.
export const CLIP_MS = 1200;
export const ttsMs = (text: string) => 300 + text.length * 20;

type Status = { didJustFinish: boolean };

export class FakePlayer {
  playing = false;
  loop = false;
  private vol = 1;
  /** Every volume set on the player, in order. */
  readonly volumes: number[] = [];
  get volume() { return this.vol; }
  set volume(v: number) { this.vol = v; this.volumes.push(v); }
  isLoaded = true;
  duration = CLIP_MS / 1000;
  currentTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private subs = new Set<(s: Status) => void>();
  constructor(public source: unknown, public options: Record<string, unknown> = {}) {}
  play() {
    audio.plays++;
    // A play() iOS swallows (see audio.stalls): loaded, never playing, never ending.
    const afterReplace = this.replaced;
    this.replaced = false;
    const bySource = audio.stalls.sources?.get(this.source) ?? 0;
    if ((afterReplace && audio.stalls.afterReplace > 0) || audio.stalls.any > 0 || bySource > 0) {
      if (afterReplace && audio.stalls.afterReplace > 0) audio.stalls.afterReplace--;
      else if (bySource > 0) audio.stalls.sources!.set(this.source, bySource - 1);
      else audio.stalls.any--;
      audio.stalled.push(this.source);
      audio.log.push({ e: `stalled#${audio.players.indexOf(this)}`, t: Date.now() });
      return;
    }
    if (this.options.keepAudioSessionActive) audio.keepers.add(this);
    audio.log.push({ e: `play#${audio.players.indexOf(this)}`, t: Date.now(), src: this.source, v: this.volume });
    this.playing = true;
    audio.sounded.push(this.source);
    if (this.timer) clearTimeout(this.timer);
    if (!this.loop) {
      this.timer = setTimeout(() => {
        this.playing = false;
        this.currentTime = this.duration;  // left at the end, as a finished clip is
        [...this.subs].forEach((f) => f({ didJustFinish: true }));
      }, CLIP_MS);
    }
  }
  pause() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    if (!this.options.keepAudioSessionActive) deactivateLater();
  }
  private replaced = false;
  replace(source: unknown) {
    this.replaced = true;
    this.pause();
    this.source = source;
    this.currentTime = 0;
  }
  // Like iOS: the position moves only once the seek has gone through, a tick later.
  async seekTo(t: number) {
    await Promise.resolve();
    this.currentTime = t;
  }
  removed = false;
  // Like expo-audio's remove(): the player stops keeping the session active,
  // and if it was the last one that did, the session may be deactivated.
  remove() {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.removed = true;
    if (audio.keepers.delete(this)) deactivateLater();
  }
  addListener(_: string, f: (s: Status) => void) {
    this.subs.add(f);
    return { remove: () => this.subs.delete(f) };
  }
}

/** The iOS audio session as the fakes leave it (AVAudioSession.sharedInstance()). */
export type FakeSession = { category: string; mode: string; options: string[]; active: boolean };

// expo-audio's deactivateSession() (AudioModule.swift): 100 ms later, the
// session is made inactive if it is active, no player that keeps it active is
// left and nothing plays.
function deactivateLater() {
  setTimeout(() => {
    if (!audio.session.active || audio.keepers.size || audio.players.some((p) => p.playing && !p.removed)) return;
    audio.session.active = false;
    audio.sessionCalls.push('deactivated');
    audio.log.push({ e: 'deactivated', t: Date.now() });
  }, 100);
}

export const audio = {
  /** The shared iOS audio session: category, mode and options as last set, and whether it is active. */
  session: { category: 'soloAmbient', mode: 'default', options: [], active: false } as FakeSession,
  /** Players that played with keepAudioSessionActive and were not removed (expo-audio's activity keepers). */
  keepers: new Set<FakePlayer>(),
  players: [] as FakePlayer[],
  mode: null as unknown,
  active: false,
  /** How many times any sound was started. */
  plays: 0,
  /**
   * play() calls iOS takes and never sounds (20 Oct 2026, a clue clip present
   * in the build and silent): the item is loaded (isLoaded true), the player
   * never plays and never reports an end. `afterReplace`: the next plays of a
   * player reused with replace(); `any`: the next plays of any player;
   * `sources`: the next plays of the given source, so many times each.
   */
  stalls: { afterReplace: 0, any: 0 } as { afterReplace: number; any: number; sources?: Map<unknown, number> },
  /** The sources of the plays that were swallowed (see stalls). */
  stalled: [] as unknown[],
  /** The source of every play() that really started sounding, in order. */
  sounded: [] as unknown[],
  /** Every change made to the iOS audio session, in order. */
  sessionCalls: [] as string[],
  /**
   * The order things happened in, with Date.now(): 'mode', 'active',
   * 'create#<player index>', 'play#<player index>', and from the recognizer
   * 'category', 'rec:start' (start() called) and 'rec:up' (its 'start' event).
   * A play carries the source it played and the player's volume at that moment.
   */
  log: [] as { e: string; t: number; src?: unknown; v?: number }[],
};

export const mockAudio = {
  createAudioPlayer: (source: unknown, options?: Record<string, unknown>) => {
    const p = new FakePlayer(source, options);
    audio.players.push(p);
    audio.log.push({ e: `create#${audio.players.length - 1}`, t: Date.now() });
    return p;
  },
  setAudioModeAsync: async (m: any) => {
    audio.mode = m;
    // What expo-audio's setAudioMode sets on the session for this mode.
    if (m?.playsInSilentMode) {
      const options = [m.interruptionMode === 'mixWithOthers' ? 'mixWithOthers' : m.interruptionMode === 'duckOthers' ? 'duckOthers' : null];
      if (m.allowsRecording) options.push(m.shouldRouteThroughEarpiece ? null : 'defaultToSpeaker', 'allowBluetooth');
      audio.session = { ...audio.session, category: m.allowsRecording ? 'playAndRecord' : 'playback', mode: 'default', options: options.filter((o): o is string => !!o).sort() };
    } audio.sessionCalls.push('mode'); audio.log.push({ e: 'mode', t: Date.now() }); },
  setIsAudioActiveAsync: async (on: boolean) => {
    audio.active = on;
    audio.session.active = on;
    if (!on) audio.keepers.clear();
    audio.sessionCalls.push(on ? 'active' : 'inactive');
    audio.log.push({ e: on ? 'active' : 'inactive', t: Date.now() });
  },
};

type SpeechOpts = {
  onStart?: () => void; onDone?: () => void; onStopped?: () => void; onError?: (e: unknown) => void;
  language?: string; useApplicationAudioSession?: boolean;
};

/**
 * How the fake phone voice behaves, like the iOS failures #362 guards against:
 * 'ok' starts a moment after speak() (a microtask, like the native
 * 'speakingStarted' event) and reports its end; 'never' takes the utterance
 * and never starts it (no event at all); 'dropped' cancels it at once
 * ('speakingStopped' without a start). `failures` utterances behave so, then 'ok'.
 */
export type SpeechMode = 'ok' | 'never' | 'dropped';

export const speech = {
  spoken: [] as { text: string; language?: string; useApplicationAudioSession?: boolean }[],
  current: null as { opts: SpeechOpts; timer: ReturnType<typeof setTimeout> | null } | null,
  /** Every utterance that really started, in order. */
  started: [] as string[],
  mode: 'ok' as SpeechMode,
  failures: Infinity,
  stops: 0,
  reset() {
    this.spoken.length = 0;
    this.started.length = 0;
    this.current = null;
    this.mode = 'ok';
    this.failures = Infinity;
    this.stops = 0;
  },
};

export const mockSpeech = {
  speak: (text: string, opts: SpeechOpts = {}) => {
    speech.spoken.push({ text, language: opts.language, useApplicationAudioSession: opts.useApplicationAudioSession });
    // A newer utterance is queued behind one still speaking, as AVSpeechSynthesizer does; the fake simply replaces it.
    if (speech.current?.timer) clearTimeout(speech.current.timer);
    const failing = speech.mode !== 'ok' && speech.failures > 0;
    if (failing) speech.failures--;
    const mode: SpeechMode = failing ? speech.mode : 'ok';
    const entry: { opts: SpeechOpts; timer: ReturnType<typeof setTimeout> | null } = { opts, timer: null };
    speech.current = entry;
    if (mode === 'never') return;
    Promise.resolve().then(() => {
      if (speech.current !== entry) return;
      if (mode === 'dropped') {
        speech.current = null;
        opts.onStopped?.();
        return;
      }
      speech.started.push(text);
      opts.onStart?.();
      entry.timer = setTimeout(() => {
        if (speech.current === entry) speech.current = null;
        opts.onDone?.();
      }, ttsMs(text));
    });
  },
  stop: async () => {
    speech.stops++;
    if (speech.current) {
      if (speech.current.timer) clearTimeout(speech.current.timer);
      const { opts } = speech.current;
      speech.current = null;
      opts.onStopped?.();
    }
  },
};
