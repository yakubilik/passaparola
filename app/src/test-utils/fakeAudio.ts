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
  remove() { this.pause(); }
  addListener(_: string, f: (s: Status) => void) {
    this.subs.add(f);
    return { remove: () => this.subs.delete(f) };
  }
}

export const audio = {
  players: [] as FakePlayer[],
  mode: null as unknown,
  active: false,
  /** How many times any sound was started. */
  plays: 0,
  /** Every change made to the iOS audio session, in order. */
  sessionCalls: [] as string[],
};

export const mockAudio = {
  createAudioPlayer: (source: unknown, options?: Record<string, unknown>) => {
    const p = new FakePlayer(source, options);
    audio.players.push(p);
    return p;
  },
  setAudioModeAsync: async (m: unknown) => { audio.mode = m; audio.sessionCalls.push('mode'); },
  setIsAudioActiveAsync: async (on: boolean) => { audio.active = on; audio.sessionCalls.push(on ? 'active' : 'inactive'); },
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
