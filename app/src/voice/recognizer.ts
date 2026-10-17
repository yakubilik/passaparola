import { ExpoSpeechRecognitionModule as SR } from 'expo-speech-recognition';

import type { RecOptions, Recognizer } from './listener';

// expo-speech-recognition behind the listener's small interface. The audio
// session is set to play and record at once, on the loudspeaker, so the host
// and the sound cues keep playing while the mic is open.
export const nativeRecognizer: Recognizer = {
  start(options: RecOptions) {
    SR.start({
      ...options,
      addsPunctuation: false,
      iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'], mode: 'default' },
    });
  },
  abort() {
    SR.abort();
  },
  subscribe(h) {
    const subs = [
      SR.addListener('result', h.result),
      SR.addListener('error', h.error),
      SR.addListener('end', h.end),
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
export function testMic(update: (t: MicTest) => void, settleMs = 900, maxMs = 8000): () => void {
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
      SR.addListener('error', (e) => { if (!heard) finish({ state: 'error', text: explainMicError(e.error) }); }),
      SR.addListener('end', () => finish(heard ? { state: 'ok', text: heard } : { state: 'error', text: explainMicError('no-speech') })),
    );
    try {
      SR.start({ lang: 'tr-TR', interimResults: true, continuous: false, maxAlternatives: 1 });
      update({ state: 'listening', text: '' });
    } catch (e) {
      finish({ state: 'error', text: `Mikrofon başlatılamadı: ${String((e as Error)?.message ?? e)}` });
    }
  })();
  return cleanup;
}
