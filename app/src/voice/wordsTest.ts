import { requireOptionalNativeModule } from 'expo';
import { createAudioPlayer } from 'expo-audio';
import { ExpoSpeechRecognitionModule as SR } from 'expo-speech-recognition';

import { prepareAudio } from './engine';
import { contextFor } from './listener';
import { prepareMic, RECOGNITION_OPTIONS } from './recognizer';

// The short-word recognition test (#455): launched with `-harfiyenSelfTest
// words`, the app plays recorded short words on its own loudspeaker while a
// microphone request listens, one request per recording, with the game's own
// request (tr-TR, continuous, interim results, five guesses, the round's
// contextualStrings, the 'search' task hint, no punctuation, the session's
// play-and-record category), on-device and on the iOS speech servers, and
// writes every result as it came (interim or final, all guesses, ms since the
// request started, when the recording started and ended) to
// Documents/WORDS_TEST_LOG. Voice processing is off for these requests: it
// would cancel the phone's own playback, which here stands in for the player.
// (Feeding the files to the recognizer directly, expo-speech-recognition's
// audioSource, gave iOS's no-speech guesses for every file, even six words
// in a row, on 23 Oct 2026: that path hands the recognizer no speech.)
// The recordings are made on the Mac with `say -v Yelda` and copied to
// Documents/words by
//
//   app/scripts/words-test.sh <device id>
//
// The results are replayed through the listener in src/voice/__tests__/phoneReplay.test.ts.

export const WORDS_TEST_LOG = 'harfiyen-words.json';
/** After its recording ended, a request runs this long, then is stopped (its final then comes). */
export const WORDS_TAIL_MS = 4000;
/** No recording runs longer than this. */
export const WORDS_LIMIT_MS = 60_000;
/** The mic request is up this long before the recording starts. */
export const WORDS_LEAD_MS = 500;

/** The files the Mac script makes (words/<name>.wav), in order. */
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

/** Plays one recording into a mic request and resolves once the request has ended. */
function runFile(run: WordsRun, uri: string, saved: () => void): Promise<void> {
  const { onDevice } = run;
  return new Promise((resolve) => {
    const t0 = Date.now();
    const log = (e: string, data: Record<string, unknown> = {}) => {
      run.events.push({ t: Date.now() - t0, e, ...data });
      saved();
    };
    const timers: ReturnType<typeof setTimeout>[] = [];
    let player: ReturnType<typeof createAudioPlayer> | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      subs.forEach((s) => s.remove());
      try { player?.remove(); } catch { /* gone */ }
      resolve();
    };
    const stop = (why: string) => { log('stop', { why }); try { SR.stop(); } catch { /* stopped */ } };
    // No recording is this long: stopped, then given up on if iOS never says 'end'.
    timers.push(setTimeout(() => {
      stop('limit');
      timers.push(setTimeout(() => { try { SR.abort(); } catch { /* stopped */ } finish(); }, 3000));
    }, WORDS_LIMIT_MS));
    const play = () => {
      try {
        player = createAudioPlayer({ uri });
        const sub = player.addListener('playbackStatusUpdate', (s) => {
          if (!s.didJustFinish) return;
          sub.remove();
          log('played', { durationMs: Math.round((s.duration ?? 0) * 1000) });
          timers.push(setTimeout(() => stop('tail'), WORDS_TAIL_MS));
        });
        player.volume = 1;
        player.play();
        log('play');
      } catch (err) {
        log('error', { error: `play: ${String(err)}` });
        stop('play failed');
      }
    };
    const subs = [
      SR.addListener('start', () => {
        log('start');
        timers.push(setTimeout(play, WORDS_LEAD_MS));
      }),
      SR.addListener('result', (r) => log('result', {
        final: r.isFinal,
        alts: r.results.map((x) => x.transcript),
        segments: r.results[0]?.segments?.map((s) => [s.segment, s.startTimeMillis, s.endTimeMillis]) ?? [],
      })),
      SR.addListener('error', (r) => log('error', { error: r.error, message: r.message })),
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
        iosVoiceProcessingEnabled: false,
        iosCategory: { ...RECOGNITION_OPTIONS.iosCategory, categoryOptions: [...RECOGNITION_OPTIONS.iosCategory.categoryOptions] },
      });
    } catch (err) {
      log('error', { error: String(err) });
      finish();
    }
  });
}

let started = false;
/** Runs every recording, on-device then on the servers, writing the log as it goes. */
export async function runWordsTest() {
  if (started) return;
  started = true;
  const mod = native();
  if (!mod?.writeDocument) return;
  const out: { startedAt: number; stage: string; path: string; context: string[]; runs: WordsRun[]; error?: string } = {
    startedAt: Date.now(), stage: 'launch', path: 'speaker-to-mic', context: contextFor(WORDS_TEST_ANSWERS), runs: [],
  };
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
    // The game's own audio session: playback in silent mode, recording allowed, the loudspeaker.
    await Promise.race([prepareAudio(), new Promise((r) => setTimeout(r, 3000))]);
    stage(ready ? 'running' : 'running (permission check timed out)');
    for (const onDevice of [true, false]) {
      for (const file of WORDS_TEST_FILES) {
        const run: WordsRun = { file, onDevice, events: [] };
        out.runs.push(run);
        await runFile(run, `file://${docs}/words/${file}.wav`, save);
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    stage('done');
  } catch (e) {
    out.error = String((e as Error)?.stack ?? e);
    stage('failed');
  }
}
