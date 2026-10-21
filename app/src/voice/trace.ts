import { requireOptionalNativeModule } from 'expo';

import { readVoiceProcessing, RECOGNITION_OPTIONS } from './recognizer';
import { readAudioSession } from './sessionInfo';

// The voice evidence file (#438): what the mic really heard and what the game
// made of it, for acceptance runs on the phone. Hidden: on only when the app
// was launched with `-harfiyenSelfTest trace` (no auto-play: a person or an
// external speaker does the talking), and in the self-test modes, whose own
// answers are marked `selftest`. Written to Documents/TRACE_LOG once a second:
//
//   xcrun devicectl device process launch --device <id> --terminate-existing \
//     com.skolalabs.harfiyen -- -harfiyenSelfTest trace
//   xcrun devicectl device copy from --device <id> --domain-type appDataContainer \
//     --domain-identifier com.skolalabs.harfiyen --source Documents/harfiyen-voicetrace.json \
//     --destination ./harfiyen-voicetrace.json
//
// Every event has `t` (ms since the trace started) and `at` (epoch ms). The
// recognizer's raw results (`result`: every alternative, interim or final),
// the listener's decisions on them (`incomplete`, `attempt`, `consumed`,
// `dropped`; docs/speech.md, "Utterance states"), the round's verdicts
// (`verdict`: source voice / voice-held, and `judged` for every answer the
// round took, typed, button or self-test included), the game's own sound
// (`host` with the words read, `host-done`, `cue`), the requests (`request`,
// `request-end`, `error`) and once a second the native audio state (`audio`:
// session category, mode, route, outputVolume, the engine's voice processing,
// engines built, route changes). The game's own playback is the `host` and
// `cue` spans; anything heard outside them is the room. The file holds
// transcripts of what was said: it stays on the phone, and only sanitized
// extracts go into git.

export const TRACE_LOG = 'harfiyen-voicetrace.json';
export const TRACE_SCHEMA = 'harfiyen-voicetrace/1';
/** Events kept; the oldest go first. */
export const TRACE_MAX = 20_000;

type Native = {
  build?(): { version: string; build: string; bundle: string };
  writeDocument?(name: string, text: string): string;
};

function native(): Native | null {
  try {
    return requireOptionalNativeModule<Native>('AudioSessionInfo');
  } catch {
    return null;
  }
}

export type TraceEvent = { t: number; at: number; e: string } & Record<string, unknown>;

let on = false;
let startedAt = 0;
let events: TraceEvent[] = [];
let ticker: ReturnType<typeof setInterval> | null = null;
let state: () => Record<string, unknown> = () => ({});

/** The trace is on (a hidden launch argument). */
export function traceOn(): boolean {
  return on;
}

/** What the game's state is in each `audio` sample (set by engine.ts: mic open, host speaking). */
export function setTraceState(read: () => Record<string, unknown>) {
  state = read;
}

/** Records one event, when the trace is on. */
export function trace(e: string, data: Record<string, unknown> = {}) {
  if (!on) return;
  const now = Date.now();
  events.push({ t: now - startedAt, at: now, e, ...data });
  if (events.length > TRACE_MAX) events.shift();
}

/** The build, the native patch and the recognition options this trace was made with. */
export function traceIdentity() {
  let build: ReturnType<NonNullable<Native['build']>> | null = null;
  try {
    build = native()?.build?.() ?? null;
  } catch {
    build = null;
  }
  return {
    schema: TRACE_SCHEMA,
    build,
    nativePatch: readVoiceProcessing()?.patch ?? null,
    recognition: { voiceProcessing: RECOGNITION_OPTIONS.iosVoiceProcessingEnabled, mode: RECOGNITION_OPTIONS.iosCategory.mode, taskHint: RECOGNITION_OPTIONS.iosTaskHint },
  };
}

function sample() {
  let extra: Record<string, unknown> = {};
  try {
    extra = state();
  } catch {
    extra = {};
  }
  trace('audio', { session: readAudioSession(), vp: readVoiceProcessing(), ...extra });
}

/** Writes the file now (also done once a second). */
export function flushTrace() {
  if (!on) return;
  try {
    native()?.writeDocument?.(TRACE_LOG, JSON.stringify({ ...traceIdentity(), startedAt, events }));
  } catch {
    // Nowhere to write: the trace stays in memory.
  }
}

/** Starts the trace: `source` is what turned it on (the launch argument). */
export function startTrace(source: string) {
  if (on) return;
  on = true;
  startedAt = Date.now();
  events = [];
  trace('trace-start', { source, ...traceIdentity() });
  sample();
  ticker = setInterval(() => {
    sample();
    flushTrace();
  }, 1000);
}

export function stopTrace() {
  if (!on) return;
  trace('trace-stop');
  flushTrace();
  if (ticker) clearInterval(ticker);
  ticker = null;
  on = false;
}

/** The events so far, for tests. */
export function traceEvents(): readonly TraceEvent[] {
  return events;
}
