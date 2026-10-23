import { requireOptionalNativeModule } from 'expo';
import { ExpoSpeechRecognitionModule as SR } from 'expo-speech-recognition';

import { contextFor } from './listener';
import { prepareMic, RECOGNITION_OPTIONS } from './recognizer';

// The short-word recognition test (#455): launched with `-harfiyenSelfTest
// words`, the app feeds recorded speech files to the real iOS recognizer, one
// request per file, with the game's own request (tr-TR, continuous, interim
// results, five guesses, the round's contextualStrings, the 'search' task
// hint, no punctuation), on-device and on the iOS speech servers, and writes
// every result as it came (interim or final, all guesses, ms since the
// request started) to Documents/WORDS_TEST_LOG. The files are fed in real
// time (WORDS_CHUNK_MS per 4096 frames at 16 kHz), so the timings are those of
// speech, not of a file read at full speed. No microphone and no voice
// processing are involved: this measures what the recognizer makes of a short
// word, not what the mic hears. The files are made on the Mac with
// `say -v Yelda` (scripts/words-test.sh) and copied to Documents/words first:
//
//   app/scripts/words-test.sh <device id>
//
// The results become fake-recognizer replays in src/voice/__tests__/shortWordsReplay.test.ts.

export const WORDS_TEST_LOG = 'harfiyen-words.json';
/** 4096 frames of 16 kHz audio last 256 ms: the files are fed at the pace they were spoken. */
export const WORDS_CHUNK_MS = 256;
/** A request still running this long after its file ended is stopped (its final then comes). */
export const WORDS_TAIL_MS = 4000;
/** No file runs longer than this. */
export const WORDS_LIMIT_MS = 60_000;

/** The files the Mac script makes (words/<name>.wav), in order; `context` is what the request expects. */
export const WORDS_TEST_FILES = [
  'pas', 'pas-fast', 'ay', 'su', 'un', 'kar', 'buz', 'ok', 'el', 'at', 'sis', 'kum',
  'pas-after-silence', 'ay-after-silence', 'round',
];
/** The round the requests expect: the short answers of these trials among ordinary long ones. */
export const WORDS_TEST_ANSWERS = ['Ay', 'Su', 'Un', 'Kar', 'Buz', 'Ok', 'El', 'Böbrek', 'Ceviz', 'Deprem', 'Güneş', 'Horoz'];

type Native = { writeDocument?(name: string, text: string): string };
function native(): Native | null {
  try {
    return requireOptionalNativeModule<Native>('AudioSessionInfo');
  } catch {
    return null;
  }
}

export type WordsEvent = { t: number; e: string } & Record<string, unknown>;
export type WordsRun = { file: string; onDevice: boolean; events: WordsEvent[] };

/** Feeds one file to the recognizer and resolves with everything it reported. */
function runFile(run: WordsRun, uri: string, saved: () => void): Promise<void> {
  const { onDevice } = run;
  return new Promise((resolve) => {
    const t0 = Date.now();
    const log = (e: string, data: Record<string, unknown> = {}) => {
      run.events.push({ t: Date.now() - t0, e, ...data });
      saved();
    };
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (stopTimer) clearTimeout(stopTimer);
      clearTimeout(limit);
      subs.forEach((s) => s.remove());
      resolve();
    };
    // No file is this long: stopped, then given up on if iOS never says 'end'.
    const limit = setTimeout(() => {
      log('limit');
      try { SR.stop(); } catch { /* stopped */ }
      setTimeout(() => { try { SR.abort(); } catch { /* stopped */ } finish(); }, 3000);
    }, WORDS_LIMIT_MS);
    const subs = [
      SR.addListener('result', (r) => log('result', {
        final: r.isFinal,
        alts: r.results.map((x) => x.transcript),
        segments: r.results[0]?.segments?.map((s) => [s.segment, s.startTimeMillis, s.endTimeMillis]) ?? [],
      })),
      SR.addListener('start', () => log('start')),
      SR.addListener('error', (r) => log('error', { error: r.error, message: r.message })),
      SR.addListener('audioend', () => {
        log('audioend');
        stopTimer = setTimeout(() => { log('stop'); SR.stop(); }, WORDS_TAIL_MS);
      }),
      SR.addListener('end', () => {
        log('end');
        finish();
      }),
    ];
    log('request');
    try {
      SR.start({
        lang: 'tr-TR', continuous: true, interimResults: true, maxAlternatives: 5,
        requiresOnDeviceRecognition: onDevice,
        contextualStrings: contextFor(WORDS_TEST_ANSWERS),
        addsPunctuation: RECOGNITION_OPTIONS.addsPunctuation,
        iosTaskHint: RECOGNITION_OPTIONS.iosTaskHint,
        audioSource: { uri, chunkDelayMillis: WORDS_CHUNK_MS },
      });
    } catch (err) {
      log('error', { error: String(err) });
      finish();
    }
  });
}

let started = false;
/** Runs every file, on-device then on the servers, writing the log after each request. */
export async function runWordsTest() {
  if (started) return;
  started = true;
  const mod = native();
  if (!mod?.writeDocument) return;
  const out: { startedAt: number; stage: string; context: string[]; runs: WordsRun[]; error?: string } = { startedAt: Date.now(), stage: 'launch', context: contextFor(WORDS_TEST_ANSWERS), runs: [] };
  const save = () => mod.writeDocument!(WORDS_TEST_LOG, JSON.stringify(out));
  const stage = (s: string) => { out.stage = s; save(); };
  try {
    // writeDocument returns the file's path: Documents is its folder.
    const docs = save().replace(/\/[^/]*$/, '');
    stage('permissions');
    // The permissions were given when the game was first played; asking must not hold the test up.
    const ready = await Promise.race([prepareMic(), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
    if (ready && !ready.ok) {
      out.error = ready.reason;
      return stage('denied');
    }
    stage(ready ? 'running' : 'running (permission check timed out)');
    for (const onDevice of [true, false]) {
      for (const file of WORDS_TEST_FILES) {
        const run: WordsRun = { file, onDevice, events: [] };
        out.runs.push(run);
        await runFile(run, `file://${docs}/words/${file}.wav`, save);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    stage('done');
  } catch (e) {
    out.error = String((e as Error)?.stack ?? e);
    stage('failed');
  }
}
