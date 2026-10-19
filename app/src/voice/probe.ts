import { ExpoSpeechRecognitionModule as SR } from 'expo-speech-recognition';

import { judgeSpoken } from '../game/normalize';
import { contextFor } from './listener';
import { prepareMic, RECOGNITION_OPTIONS, supportsOnDevice } from './recognizer';

// The speech test behind Ayarlar (a long press on "Mikrofonu dene"): ten
// words said one after the other, each in its own request as in the game (its
// answer as contextualStrings, the game's task hint and session), with every
// result shown as it comes and how long after the end of the word the
// recognizer had it. Apple's final result carries the timing of each word
// (segments, from the start of the audio, which 'audiostart' reports), so the
// end of the speech is known exactly once the final result is there.

export const PROBE_WORDS = ['Ay', 'Su', 'Merkür', 'Cimnastik', 'Un', 'Ok', 'Pas', 'Ankara', 'Zürafa', 'Reşat Nuri Güntekin'];

export type TaskHint = 'search' | 'confirmation' | 'dictation' | 'unspecified';
export type ProbeConfig = { onDevice: boolean; taskHint: TaskHint; voiceProcessing: boolean };
export const DEFAULT_PROBE: ProbeConfig = { onDevice: true, taskHint: RECOGNITION_OPTIONS.iosTaskHint, voiceProcessing: RECOGNITION_OPTIONS.iosVoiceProcessingEnabled };

/** Waits for each word: to be heard at all, then for Apple's own final result, then after the stop. */
export const LISTEN_MS = 6000;
export const FINAL_WAIT_MS = 2500;
export const END_WAIT_MS = 1500;
export const GAP_MS = 800;

export type ProbeWord = {
  word: string;
  heard: string;
  ok: boolean;
  /** SR.start() to the 'start' event: how long a new request takes to open. */
  openMs: number | null;
  /** Epoch ms: the first result judged right, the final result, the end of the speech in it. */
  matchAt: number | null;
  finalAt: number | null;
  speechEndAt: number | null;
  /** The final result came only because the test stopped the request. */
  forced: boolean;
};

export type ProbeLine = { at: number; text: string };

export type ProbeState = {
  running: boolean;
  index: number;
  words: ProbeWord[];
  log: ProbeLine[];
  /** 'on-device' when asked for and this iPhone has it, else 'server' (see supportsOnDevice). */
  mode: 'on-device' | 'server';
  supportsOnDevice: boolean;
  error?: string;
};

/** End of speech to the first right result and to the final result, in ms (null: not known). */
export function latency(w: ProbeWord): { match: number | null; final: number | null } {
  if (w.speechEndAt == null) return { match: null, final: null };
  return {
    match: w.matchAt == null ? null : Math.round(w.matchAt - w.speechEndAt),
    final: w.finalAt == null ? null : Math.round(w.finalAt - w.speechEndAt),
  };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function summary(words: ProbeWord[]) {
  const done = words.filter((w) => w.openMs != null);
  const ls = words.map(latency);
  return {
    hits: words.filter((w) => w.ok).length,
    tried: done.length,
    match: median(ls.map((l) => l.match).filter((x): x is number => x != null)),
    final: median(words.filter((w) => !w.forced).map(latency).map((l) => l.final).filter((x): x is number => x != null)),
    open: median(done.map((w) => w.openMs!)),
  };
}

type Segment = { endTimeMillis?: number };
type Result = { isFinal: boolean; results: { transcript: string; segments?: Segment[] }[] };

// The words heard so far: the right answer for "Pas" is passing.
function hit(word: string, alts: string[]): boolean {
  const v = judgeSpoken(alts, [word]);
  return v === 'correct' || (word === 'Pas' && v === 'pass');
}

/** Runs the test; `update` gets every change. Returns a function that stops it. */
export function runProbe(config: ProbeConfig, update: (s: ProbeState) => void, { words = PROBE_WORDS, now = () => Date.now() } = {}): () => void {
  const supports = supportsOnDevice();
  let onDevice = config.onDevice;
  const state: ProbeState = {
    running: true,
    index: 0,
    words: words.map((word) => ({ word, heard: '', ok: false, openMs: null, matchAt: null, finalAt: null, speechEndAt: null, forced: false })),
    log: [],
    mode: onDevice && supports ? 'on-device' : 'server',
    supportsOnDevice: supports,
  };
  const t0 = now();
  let phase: 'idle' | 'listening' | 'closing' | 'gap' = 'idle';
  let requestAt = 0;
  let audioStartAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const subs: { remove(): void }[] = [];

  const emit = () => update({ ...state, words: state.words.map((w) => ({ ...w })), log: [...state.log] });
  const log = (text: string) => {
    state.log.push({ at: now() - t0, text });
    if (state.log.length > 200) state.log.shift();
  };
  const later = (ms: number, f: () => void) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(f, ms);
  };
  const cur = () => state.words[state.index];

  const begin = () => {
    if (done) return;
    const w = cur();
    phase = 'listening';
    audioStartAt = null;
    requestAt = now();
    log(`“${w.word}” için yeni istek (${onDevice ? 'cihaz üstü' : 'sunucu'}, ${config.taskHint})`);
    try {
      SR.start({
        lang: 'tr-TR', continuous: true, interimResults: true, maxAlternatives: 5,
        contextualStrings: contextFor([w.word]),
        ...RECOGNITION_OPTIONS,
        requiresOnDeviceRecognition: onDevice,
        iosTaskHint: config.taskHint,
        iosVoiceProcessingEnabled: config.voiceProcessing,
        iosCategory: { ...RECOGNITION_OPTIONS.iosCategory, categoryOptions: [...RECOGNITION_OPTIONS.iosCategory.categoryOptions] },
      });
    } catch (e) {
      log(`başlatılamadı: ${String((e as Error)?.message ?? e)}`);
    }
    later(LISTEN_MS, close);
    emit();
  };

  // Enough for this word: the request is stopped, which makes Apple send its final result.
  const close = () => {
    if (done || phase !== 'listening') return;
    phase = 'closing';
    try { SR.stop(); } catch { /* already stopped */ }
    later(END_WAIT_MS, next);
  };

  const next = () => {
    if (done) return;
    phase = 'gap';
    if (state.index + 1 >= state.words.length) return finish();
    later(GAP_MS, () => {
      state.index++;
      begin();
    });
    emit();
  };

  const finish = () => {
    if (timer) clearTimeout(timer);
    state.running = false;
    const s = summary(state.words);
    log(`bitti: ${s.hits}/${state.words.length} doğru`);
    cleanup(false);
    emit();
  };

  const cleanup = (abort: boolean) => {
    done = true;
    if (timer) clearTimeout(timer);
    subs.forEach((s) => s.remove());
    subs.length = 0;
    if (abort) try { SR.abort(); } catch { /* stopped */ }
  };

  subs.push(
    SR.addListener('start', () => {
      if (phase === 'idle' || phase === 'gap') return;
      const w = cur();
      if (w.openMs == null) w.openMs = now() - requestAt;
      log(`dinliyor (açılış ${w.openMs} ms)`);
      emit();
    }),
    SR.addListener('audiostart', (e: { timestamp?: number } | null) => {
      audioStartAt = e?.timestamp ?? now();
    }),
    SR.addListener('result', (e: Result) => {
      if (phase !== 'listening' && phase !== 'closing') return;
      const w = cur();
      const t = now();
      const alts = e.results.map((r) => r.transcript.trim()).filter(Boolean);
      if (alts.length) w.heard = alts[0];
      log(`${e.isFinal ? 'son' : 'ara'}: “${alts[0] ?? ''}”${alts.length > 1 ? ` (+${alts.length - 1})` : ''}`);
      if (!w.ok && alts.length && hit(w.word, alts)) {
        w.ok = true;
        w.matchAt = t;
        // Now wait for Apple's own final result, which says when the word ended.
        if (phase === 'listening') later(FINAL_WAIT_MS, close);
      }
      if (e.isFinal && alts.length) {
        const ends = e.results[0].segments?.map((s) => s.endTimeMillis ?? 0) ?? [];
        const end = Math.max(0, ...ends);
        // The first final result once the word was heard right (finals before it were other words).
        if (w.ok && w.finalAt == null) {
          w.finalAt = t;
          w.forced = phase === 'closing';
          if (end > 0 && audioStartAt != null) w.speechEndAt = audioStartAt + end;
        }
        if (w.ok && phase === 'listening') close();
      }
      emit();
    }),
    SR.addListener('error', (e: { error: string; message?: string }) => {
      if (e.error === 'aborted') return;
      log(`hata: ${e.error}${e.message ? ` (${e.message})` : ''}`);
      if (e.error === 'service-not-allowed' && onDevice && phase === 'listening') {
        // As in the game: on-device refused, the servers next.
        onDevice = false;
        state.mode = 'server';
        log('cihaz üstü reddedildi; sunucuyla tekrar');
        cur().openMs = null;
        phase = 'gap';
        later(GAP_MS, begin);
      }
      emit();
    }),
    SR.addListener('end', () => {
      if (phase === 'listening') {
        log('istek kendiliğinden bitti');
        next();
      } else if (phase === 'closing') {
        log('istek bitti');
        next();
      }
    }),
  );

  (async () => {
    const ready = await prepareMic();
    if (done) return;
    if (!ready.ok) {
      state.running = false;
      state.error = ready.reason;
      cleanup(false);
      emit();
      return;
    }
    begin();
  })();

  return () => {
    if (done) return;
    state.running = false;
    log('durduruldu');
    cleanup(true);
    emit();
  };
}
