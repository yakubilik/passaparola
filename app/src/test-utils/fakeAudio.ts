// expo-audio and expo-speech for tests: clips and speech "play" for a fixed
// time on jest's clock and report their end the way the real modules do.
export const CLIP_MS = 1200;
export const ttsMs = (text: string) => 300 + text.length * 20;

type Status = { didJustFinish: boolean };

export class FakePlayer {
  playing = false;
  loop = false;
  volume = 1;
  isLoaded = true;
  duration = CLIP_MS / 1000;
  currentTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private subs = new Set<(s: Status) => void>();
  constructor(public source: unknown, public options: Record<string, unknown> = {}) {}
  play() {
    audio.plays++;
    if (this.options.keepAudioSessionActive) audio.keepers.add(this);
    audio.log.push({ e: `play#${audio.players.indexOf(this)}`, t: Date.now() });
    this.playing = true;
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
  replace(source: unknown) {
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
  /** Every change made to the iOS audio session, in order. */
  sessionCalls: [] as string[],
  /**
   * The order things happened in, with Date.now(): 'mode', 'active',
   * 'create#<player index>', 'play#<player index>', and from the recognizer
   * 'category', 'rec:start' (start() called) and 'rec:up' (its 'start' event).
   */
  log: [] as { e: string; t: number }[],
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

type SpeechOpts = { onDone?: () => void; onStopped?: () => void; onError?: (e: unknown) => void; language?: string };

export const speech = {
  spoken: [] as { text: string; language?: string }[],
  current: null as { opts: SpeechOpts; timer: ReturnType<typeof setTimeout> } | null,
};

export const mockSpeech = {
  speak: (text: string, opts: SpeechOpts = {}) => {
    speech.spoken.push({ text, language: opts.language });
    const timer = setTimeout(() => {
      speech.current = null;
      opts.onDone?.();
    }, ttsMs(text));
    speech.current = { opts, timer };
  },
  stop: async () => {
    if (speech.current) {
      clearTimeout(speech.current.timer);
      const { opts } = speech.current;
      speech.current = null;
      opts.onStopped?.();
    }
  },
};
