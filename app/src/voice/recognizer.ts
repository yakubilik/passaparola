import { ExpoSpeechRecognitionModule as SR } from 'expo-speech-recognition';

import { SETTLE_MS, type RecOptions, type Recognizer } from './listener';

// expo-speech-recognition behind the listener's small interface. The audio
// session is set to play and record at once, on the loudspeaker, so the host
// and the sound cues keep playing while the mic is open; voice processing
// (iOS echo cancellation, iosVoiceProcessingEnabled) takes the phone's own
// sound out of what the mic hears, so the host does not answer for the player.
//
// The session mode is 'voiceChat', set once before the round's first sound
// (setVoiceSession, from prepareAudio) and passed with every start: it is the
// mode iOS itself switches the session to the moment voice processing comes up
// (docs/selftest/2026-10-19-1826-phone.json: 'default' became 'voiceChat' with
// the first engine). Left at 'default', every voice-processing start and stop
// (a round, a renewed request) switched the mode, and with it the output
// path and level, under whatever was playing. Set up front, the round plays on
// one path from its first sound to its last; the volume buttons move it.
//
// The session must not change while the mic is open: on an iOS route change
// expo-speech-recognition rebuilds its audio engine (upstream without voice
// processing). app/patches gives a rebuilt engine the same voice processing
// and ducking (#361), and rebuilds only when the microphone or the speaker
// really changed: a route change that keeps the ports (voice processing's own
// mode switch is one) keeps the running engine, so building an engine can no
// longer set off the next route change (#438, one engine a second on the
// phone). An interruption ends recognition. The very same category is set once
// before the round (setVoiceSession) and by the mic check, and every start
// finds it in place.
//
// The answers are one word or a short name, so the request carries the
// 'search' task hint (short phrases), not 'dictation' (long free speech) or
// 'confirmation' (yes / no). No punctuation: answers are compared as words.
// See docs/speech.md for each option against the Speech framework documentation.
export const RECOGNITION_OPTIONS = {
  addsPunctuation: false,
  iosTaskHint: 'search',
  // Echo cancellation: the phone's own sound (the host, the cues) is taken out of
  // what the mic hears before recognition, which no text rule can do (#438, after
  // it was off from 19 Oct 2026 for the engine loop and volume steps it set off;
  // see the mode below and app/patches). The listener's text filter stays as the
  // second line.
  iosVoiceProcessingEnabled: true,
  iosCategory: {
    category: 'playAndRecord',
    categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'],
    mode: 'voiceChat',
  },
} as const;

const sessionCategory = () => ({ ...RECOGNITION_OPTIONS.iosCategory, categoryOptions: [...RECOGNITION_OPTIONS.iosCategory.categoryOptions] });

/** Puts the iOS audio session in the recognizer's category and mode ahead of the first round. */
export function setVoiceSession() {
  try {
    SR.setCategoryIOS?.(sessionCategory());
  } catch {
    // Not iOS, or the session is busy: the recognizer sets it when it starts.
  }
}

/**
 * Whether this iPhone can recognise speech without the network. The
 * answer is for the recognizer of the phone's own language (the library asks
 * SFSpeechRecognizer() without a locale), so it speaks for tr-TR only on a
 * phone set to Turkish; each tr-TR request asks for on-device recognition and
 * iOS applies it only where the tr-TR recognizer supports it.
 */
export function supportsOnDevice(): boolean {
  try {
    return !!SR.supportsOnDeviceRecognition?.();
  } catch {
    return false;
  }
}

/** The voice processing of the recognizer's audio engine as it last was (app/patches/expo-speech-recognition). */
export type VoiceProcessingInfo = {
  /** The engine is running (a request is open). */
  running: boolean;
  /** Voice processing (echo cancellation) is on in the engine's input node. */
  enabled: boolean;
  /** The ducking of the app's other sound (iOS 17+): null where it is not known. */
  advancedDucking: boolean | null;
  duckingLevel: string | null;
  /** Engines built so far, and how many of them were rebuilt after a route change. */
  engines: number;
  rebuilds: number;
  /** Route changes seen while a request was open, and how many of them kept the engine (same ports). */
  routeChanges?: number;
  routeChangesIgnored?: number;
  /** Engines a route change stopped and that were started again rather than rebuilt. */
  engineRestarts?: number;
  /** The last route change: iOS's reason code and whether the ports changed. */
  lastRouteChange?: string | null;
  /** Which version of app/patches/expo-speech-recognition the build carries. */
  patch?: string;
};

type PatchedModule = { getVoiceProcessingStateIOS?: () => VoiceProcessingInfo };

/** Null where the patched native call is not there (Android, an older build). */
export function readVoiceProcessing(): VoiceProcessingInfo | null {
  try {
    return (SR as unknown as PatchedModule).getVoiceProcessingStateIOS?.() ?? null;
  } catch {
    return null;
  }
}

const startOptions = (options: RecOptions) => ({ ...options, ...RECOGNITION_OPTIONS, iosCategory: sessionCategory() });
let lastStart: ReturnType<typeof startOptions> | null = null;
/** The options of the game's last recognizer start, as passed to the native module. */
export function lastStartOptions() {
  return lastStart;
}

export const nativeRecognizer: Recognizer = {
  start(options: RecOptions) {
    lastStart = startOptions(options);
    SR.start(lastStart);
  },
  abort() {
    SR.abort();
  },
  subscribe(h) {
    const subs = [
      SR.addListener('result', h.result),
      SR.addListener('error', h.error),
      SR.addListener('end', h.end),
      // Sent once the audio engine (voice processing with it) is running: see whenUp in listener.ts.
      ...(h.start ? [SR.addListener('start', h.start)] : []),
    ];
    return () => subs.forEach((s) => s.remove());
  },
};

// Why the mic heard nothing, in the player's words.
const ERRORS: Record<string, string> = {
  'not-allowed': 'Mikrofon ya da konuşma tanıma izni kapalı. Ayarlar > Harfiyen\'den Mikrofon ve Konuşma Tanıma\'yı aç.',
  'service-not-allowed': 'Siri ve Dikte kapalı. Ayarlar > Genel > Klavye > Dikte\'yi ya da Ayarlar > Siri\'yi aç.',
  'language-not-supported': 'Bu cihazda Türkçe konuşma tanıma yok. Ayarlar > Genel > Klavye\'ye Türkçe klavye ekleyip tekrar dene.',
  'audio-capture': 'Mikrofon açılamadı; başka bir uygulama kullanıyor olabilir.',
  'network': 'Konuşma tanıma için internet bağlantısı gerekiyor.',
  'no-speech': 'Ses gelmedi. Biraz daha yüksek sesle tekrar dene.',
  'speech-timeout': 'Ses gelmedi. Biraz daha yüksek sesle tekrar dene.',
  'interrupted': 'Dinleme yarıda kesildi (arama, Siri ya da alarm). Tekrar dene.',
  'busy': 'Konuşma tanıma meşgul, birazdan tekrar dene.',
  'aborted': 'Dinleme yarıda kesildi, tekrar dene.',
};

export function explainMicError(code: string): string {
  return ERRORS[code] ?? `Mikrofon hatası: ${code}`;
}

export type MicReady = { ok: true } | { ok: false; reason: string };

// Asks for the mic and speech permissions and checks the recognizer is there.
export async function prepareMic(): Promise<MicReady> {
  try {
    const perm = await SR.requestPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: ERRORS['not-allowed'] };
    if (!SR.isRecognitionAvailable()) return { ok: false, reason: ERRORS['service-not-allowed'] };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `Mikrofon başlatılamadı: ${String((e as Error)?.message ?? e)}` };
  }
}

export type MicTest = { state: 'listening' | 'hearing' | 'ok' | 'error'; text: string };

// The mic check before the first game: listens once and reports what it
// heard, or why it heard nothing. Returns a cancel function.
export function testMic(update: (t: MicTest) => void, settleMs = SETTLE_MS, maxMs = 8000): () => void {
  let heard = '';
  let done = false;
  let settle: ReturnType<typeof setTimeout> | null = null;
  const subs: { remove(): void }[] = [];
  const cleanup = () => {
    done = true;
    if (settle) clearTimeout(settle);
    clearTimeout(limit);
    subs.forEach((s) => s.remove());
    try { SR.abort(); } catch { /* stopped */ }
  };
  const finish = (t: MicTest) => {
    if (done) return;
    cleanup();
    update(t);
  };
  const limit = setTimeout(() => finish(heard ? { state: 'ok', text: heard } : { state: 'error', text: explainMicError('no-speech') }), maxMs);
  // As in the game: on-device first, the iOS speech servers if that is refused.
  let onDevice = true;
  let retrying = false;
  const start = () => {
    // The game's own session, so the round that follows does not have to switch it.
    SR.start({
      lang: 'tr-TR', interimResults: true, continuous: false, maxAlternatives: 1, requiresOnDeviceRecognition: onDevice,
      ...RECOGNITION_OPTIONS, iosCategory: sessionCategory(),
    });
  };
  (async () => {
    const ready = await prepareMic();
    if (done) return;
    if (!ready.ok) return finish({ state: 'error', text: ready.reason });
    subs.push(
      SR.addListener('result', (e) => {
        heard = (e.results[0]?.transcript ?? '').trim();
        if (!heard) return;
        update({ state: 'hearing', text: heard });
        if (settle) clearTimeout(settle);
        settle = setTimeout(() => finish({ state: 'ok', text: heard }), e.isFinal ? 0 : settleMs);
      }),
      SR.addListener('error', (e) => {
        if (heard) return;
        if (e.error === 'service-not-allowed' && onDevice) {
          onDevice = false;
          retrying = true;
          return;
        }
        finish({ state: 'error', text: explainMicError(e.error) });
      }),
      SR.addListener('end', () => {
        if (retrying) {
          retrying = false;
          try { start(); } catch (e) { finish({ state: 'error', text: `Mikrofon başlatılamadı: ${String((e as Error)?.message ?? e)}` }); }
          return;
        }
        finish(heard ? { state: 'ok', text: heard } : { state: 'error', text: explainMicError('no-speech') });
      }),
    );
    try {
      start();
      update({ state: 'listening', text: '' });
    } catch (e) {
      finish({ state: 'error', text: `Mikrofon başlatılamadı: ${String((e as Error)?.message ?? e)}` });
    }
  })();
  return cleanup;
}
