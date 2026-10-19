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
  /** The epoch time reported with 'audiostart'; Date.now() when null. */
  audioStartAt: number | null = null;
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
    this.emit('result', { isFinal: false, results: [{ transcript: this.transcript, confidence: 0, segments: [] }] });
  }

  // iOS rewrote what it heard so far (e.g. glued a short word onto the last one).
  rewrite(transcript: string) {
    if (!this.running) return;
    this.transcript = transcript;
    this.emit('result', { isFinal: false, results: [{ transcript, confidence: 0, segments: [] }] });
  }

  emit(event: string, payload: any = null) {
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
      this.later('start');
      this.later('audiostart', { uri: null, timestamp: this.audioStartAt ?? Date.now() });
    },
    stop: () => { this.running = false; },
    abort: () => {
      this.aborts++;
      this.running = false;
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
      this.categories.push(options);
      this.categoryAfterPlays.push(audio.plays);
      this.events.push('category');
    },
  };
}

export const fakeRecognizer = new FakeRecognizer();

export const mockModule = {
  ExpoSpeechRecognitionModule: fakeRecognizer.module,
  useSpeechRecognitionEvent: () => {},
};
