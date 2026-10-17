// A speech recognizer that behaves like iOS: once started it keeps one result
// that grows with everything heard and is never marked final. Stands in for
// expo-speech-recognition in tests (see jest.setup.js).
type Handler = (e: any) => void;

export class FakeRecognizer {
  starts = 0;
  aborts = 0;
  running = false;
  lastOptions: any = null;
  transcript = '';
  granted = true;
  available = true;
  private listeners: Record<string, Set<Handler>> = {};

  reset() {
    this.starts = this.aborts = 0;
    this.running = false;
    this.transcript = '';
    this.lastOptions = null;
    this.granted = this.available = true;
    this.listeners = {};
  }

  // What the mic heard next: appended to the one growing result.
  hear(words: string) {
    if (!this.running) return;
    this.transcript = (this.transcript + ' ' + words).trim();
    this.emit('result', { isFinal: false, results: [{ transcript: this.transcript, confidence: 0, segments: [] }] });
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
      this.running = true;
      this.transcript = '';
      this.lastOptions = options;
    },
    stop: () => { this.running = false; },
    abort: () => { this.aborts++; this.running = false; },
    addListener: (event: string, h: Handler) => {
      (this.listeners[event] ??= new Set()).add(h);
      return { remove: () => this.listeners[event]?.delete(h) };
    },
    requestPermissionsAsync: async () => ({ granted: this.granted, status: this.granted ? 'granted' : 'denied', canAskAgain: true, expires: 'never' }),
    isRecognitionAvailable: () => this.available,
  };
}

export const fakeRecognizer = new FakeRecognizer();

export const mockModule = {
  ExpoSpeechRecognitionModule: fakeRecognizer.module,
  useSpeechRecognitionEvent: () => {},
};
