import { audio } from './fakeAudio';

// A speech recognizer that behaves like iOS: once started it keeps one result
// that grows with everything heard and is never marked final. Stands in for
// expo-speech-recognition in tests (see jest.setup.js). Like the native module,
// start() reports 'start' and 'audiostart' and abort() reports an 'aborted'
// error and 'end', each a moment later (a microtask), not inside the call.
type Handler = (e: any) => void;

export class FakeRecognizer {
  starts = 0;
  aborts = 0;
  running = false;
  lastOptions: any = null;
  /** For each setCategoryIOS: how many sounds had been played before it (0 = before any). */
  categoryAfterPlays: number[] = [];
  /** Categories set on the iOS session with setCategoryIOS, and every 'category' and 'start' in order; kept across reset(), like the session. */
  categories: any[] = [];
  events: string[] = [];
  transcript = '';
  granted = true;
  available = true;
  /** What supportsOnDeviceRecognition() answers. */
  onDevice = true;
  /** Every start's options, and when it was made (Date.now()), in order. */
  startOptions: any[] = [];
  startTimes: number[] = [];
  /**
   * The voice processing of the recognizer's audio engine, as the patched
   * native module reports it (getVoiceProcessingStateIOS, app/patches): each
   * start builds an engine with voice processing when asked for, and the
   * ducking switched off on it; abort lets the engine go.
   */
  vp = { running: false, enabled: false, advancedDucking: null as boolean | null, duckingLevel: null as string | null, engines: 0, rebuilds: 0 };
  /** The epoch time reported with 'audiostart'; Date.now() when null. */
  audioStartAt: number | null = null;
  /**
   * iOS 18 and later in continuous mode (#362): each utterance ends with a
   * final-like result (Apple's speechDuration > 0, which the library reports
   * as isFinal) and the next result starts afresh, every transcript after the
   * first such final prefixed with a space by the library. See endUtterance.
   */
  private seenFinal = false;
  private gen = 0;
  private listeners: Record<string, Set<Handler>> = {};

  reset() {
    this.starts = this.aborts = 0;
    this.running = false;
    this.transcript = '';
    this.lastOptions = null;
    this.granted = this.available = this.onDevice = true;
    this.startOptions = [];
    this.startTimes = [];
    this.audioStartAt = null;
    this.seenFinal = false;
    this.listeners = {};
    this.gen++;
  }

  // Emitted a moment later, like the native events; dropped after reset().
  private later(event: string, payload: any = null) {
    const gen = this.gen;
    Promise.resolve().then(() => { if (gen === this.gen) this.emit(event, payload); });
  }

  // A final result for what was heard, with Apple's segment timings: the
  // words end `speechEndMs` after the audio started.
  final(transcript: string, speechEndMs: number) {
    if (!this.running) return;
    this.transcript = '';
    const segments = [{ startTimeMillis: Math.max(0, speechEndMs - 300), endTimeMillis: speechEndMs, segment: transcript, confidence: 0.9 }];
    this.emit('result', { isFinal: true, results: [{ transcript, confidence: 0.9, segments }] });
  }

  // What the mic heard next: appended to the one growing result.
  hear(words: string) {
    if (!this.running) return;
    this.transcript = (this.transcript + ' ' + words).trim();
    const transcript = (this.seenFinal ? ' ' : '') + this.transcript;
    this.emit('result', { isFinal: false, results: [{ transcript, confidence: 0, segments: [] }] });
  }

  // iOS heard these words but gives no result for them yet: a short word said
  // alone, held back until more speech follows or the utterance ends
  // (expo-speech-recognition README, "single-word prompts").
  holdBack(words: string) {
    if (!this.running) return;
    this.transcript = (this.transcript + ' ' + words).trim();
  }

  // iOS 18+: the utterance ends (a pause): its final-like result, with every
  // word held back, then the next result starts empty.
  endUtterance() {
    if (!this.running || !this.transcript) return;
    const transcript = (this.seenFinal ? ' ' : '') + this.transcript;
    this.transcript = '';
    this.seenFinal = true;
    this.emit('result', { isFinal: true, results: [{ transcript, confidence: 0.9, segments: [] }] });
  }

  // iOS rewrote what it heard so far (e.g. glued a short word onto the last one).
  rewrite(transcript: string) {
    if (!this.running) return;
    this.transcript = transcript;
    this.emit('result', { isFinal: false, results: [{ transcript, confidence: 0, segments: [] }] });
  }

  emit(event: string, payload: any = null) {
    if (event === 'start') audio.log.push({ e: 'rec:up', t: Date.now() });
    this.listeners[event]?.forEach((h) => h(payload));
  }

  listenerCount(event: string) {
    return this.listeners[event]?.size ?? 0;
  }

  readonly module = {
    start: (options: any) => {
      this.starts++;
      this.events.push('start');
      this.running = true;
      this.transcript = '';
      this.lastOptions = options;
      this.startOptions.push(options);
      this.startTimes.push(Date.now());
      // The native start sets the session to the request's category and makes it active (setupAudioSession).
      const c = options.iosCategory;
      if (c) audio.session = { category: c.category, mode: c.mode, options: [...c.categoryOptions].sort(), active: true };
      else audio.session = { ...audio.session, active: true };
      const vp = !!options.iosVoiceProcessingEnabled;
      this.vp = { ...this.vp, running: true, enabled: vp, advancedDucking: vp ? false : null, duckingLevel: vp ? 'min' : null, engines: this.vp.engines + 1 };
      audio.log.push({ e: 'rec:start', t: Date.now() });
      this.later('start');
      this.later('audiostart', { uri: null, timestamp: this.audioStartAt ?? Date.now() });
    },
    stop: () => { this.running = false; this.vp = { ...this.vp, running: false }; },
    getVoiceProcessingStateIOS: () => ({ ...this.vp }),
    abort: () => {
      this.aborts++;
      this.running = false;
      this.vp = { ...this.vp, running: false };
      this.later('error', { error: 'aborted', message: 'Speech recognition aborted.' });
      this.later('end');
    },
    addListener: (event: string, h: Handler) => {
      (this.listeners[event] ??= new Set()).add(h);
      return { remove: () => this.listeners[event]?.delete(h) };
    },
    requestPermissionsAsync: async () => ({ granted: this.granted, status: this.granted ? 'granted' : 'denied', canAskAgain: true, expires: 'never' }),
    isRecognitionAvailable: () => this.available,
    supportsOnDeviceRecognition: () => this.onDevice,
    setCategoryIOS: (options: any) => {
      audio.session = { ...audio.session, category: options.category, mode: options.mode, options: [...options.categoryOptions].sort() };
      this.categories.push(options);
      this.categoryAfterPlays.push(audio.plays);
      this.events.push('category');
      audio.log.push({ e: 'category', t: Date.now() });
    },
  };
}

export const fakeRecognizer = new FakeRecognizer();

export const mockModule = {
  ExpoSpeechRecognitionModule: fakeRecognizer.module,
  useSpeechRecognitionEvent: () => {},
};
