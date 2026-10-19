import { requireOptionalNativeModule } from 'expo';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { current } from '../game/round';
import type { useRound } from '../game/useRound';
import { host, listener, sounds } from './engine';
import { readVoiceProcessing } from './recognizer';
import { readAudioSession } from './sessionInfo';
import { masterGain } from './sounds';
import type { useVoiceRound } from './useVoiceRound';

// The hidden self-test (#361): launched with `-harfiyenSelfTest 1`, the app
// plays SELF_TEST_LEVELS rounds back to back by itself (voice on, the host
// reading, the mic open; each clue answered right a moment after it was read)
// and writes the native audio state, every second and at every round start,
// to Documents/SELF_TEST_LOG:
//
//   xcrun devicectl device process launch --device <id> --terminate-existing \
//     com.skolalabs.harfiyen -- -harfiyenSelfTest 1
//   xcrun devicectl device copy from --device <id> --domain-type appDataContainer \
//     --domain-identifier com.skolalabs.harfiyen --source Documents/harfiyen-selftest.json \
//     --destination ./harfiyen-selftest.json
//
// The simulator takes the same argument (`xcrun simctl launch <udid>
// com.skolalabs.harfiyen -harfiyenSelfTest 1`, or Maestro's launchApp
// arguments, e2e/rounds.yaml).

export const SELF_TEST_LOG = 'harfiyen-selftest.json';
export const SELF_TEST_LEVELS = 3;
export const SELF_TEST_CATS = 'tarih';
/** How long each result screen stays before the next level opens (for a screenshot). */
export const RESULT_DWELL_MS = 20_000;
/** A clue is answered this long after the host has read it. */
export const ANSWER_AFTER_MS = 700;
/** The first round starts this long after the app opened; Başla is pressed this long after a round opened. */
export const LAUNCH_DELAY_MS = 1500;
export const START_DELAY_MS = 2500;

type Native = { selfTest?(): string | null; writeDocument?(name: string, text: string): string };

function native(): Native | null {
  try {
    return requireOptionalNativeModule<Native>('AudioSessionInfo');
  } catch {
    return null;
  }
}

let on: boolean | null = null;
/** The app was launched for the self-test. */
export function selfTestOn(): boolean {
  if (on == null) {
    try {
      on = native()?.selfTest?.() === '1';
    } catch {
      on = false;
    }
  }
  return on;
}

// quick: the levels play whatever the saved progress (nothing locked), and the self-test leaves no progress behind.
export const selfTestUrl = (level: number) => `/game?cats=${SELF_TEST_CATS}&level=${level}&seed=7&quick=1&selftest=1`;

export type Sample = {
  t: number;
  event: string;
  round: number;
  session: ReturnType<typeof readAudioSession>;
  vp: ReturnType<typeof readVoiceProcessing>;
  micOpen: boolean;
  gain: number;
  players: { name: string; volume: number; playing: boolean }[];
};

const samples: Sample[] = [];
let round = 0;
let ticker: ReturnType<typeof setInterval> | null = null;
let startedAt = 0;

/** The log so far, for tests. */
export function selfTestSamples(): readonly Sample[] {
  return samples;
}

/** Records the native audio state now, with what just happened, and writes the log out. */
export function logAudio(event: string, roundNo?: number) {
  if (roundNo != null) round = roundNo;
  const h = host.playerState();
  samples.push({
    t: Date.now() - startedAt,
    event,
    round,
    session: readAudioSession(),
    vp: readVoiceProcessing(),
    micOpen: listener.listening,
    gain: masterGain(),
    players: [...(h ? [h] : []), ...sounds.playerStates()],
  });
  try {
    native()?.writeDocument?.(SELF_TEST_LOG, JSON.stringify({ startedAt, levels: SELF_TEST_LEVELS, samples }));
  } catch {
    // Nowhere to write: the log stays in memory.
  }
}

function startLog() {
  startedAt = Date.now();
  logAudio('launch');
  ticker = setInterval(() => logAudio('tick'), 1000);
}

function stopLog() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

let launched = false;
/** From the root layout once the settings are loaded: voice on, mic check seen, then level 1.
 * The camera setting is left as the player set it: it is saved, and a self-test that switched it
 * off left Yakup's game without a camera (19 Oct 2026). */
export function useSelfTestLaunch(ready: boolean, update: (p: { voice: boolean; micChecked: boolean }) => Promise<void>) {
  useEffect(() => {
    if (!ready || launched || !selfTestOn()) return;
    launched = true;
    update({ voice: true, micChecked: true }).then(() => {
      startLog();
      setTimeout(() => router.replace(selfTestUrl(1)), LAUNCH_DELAY_MS);
    });
  }, [ready]);
}

type Game = ReturnType<typeof useRound>;
type Voice = ReturnType<typeof useVoiceRound>;

/** On the game screen of a self-test round: presses Başla, then answers every clue right once it has been read. */
export function useSelfTestRound(enabled: boolean, game: Game, voice: Voice) {
  const g = useRef(game);
  g.current = game;
  const v = useRef(voice);
  v.current = voice;
  const { phase, asked, round: r } = game;
  useEffect(() => {
    if (!enabled || phase !== 'ready' || !r) return;
    const t = setTimeout(() => { g.current.start(); v.current.begin(); }, START_DELAY_MS);
    return () => clearTimeout(t);
  }, [enabled, phase, !!r]);
  const shown = voice.clueShown(asked);
  useEffect(() => {
    if (!enabled || phase !== 'playing' || voice.reading || !shown) return;
    const t = setTimeout(() => {
      const cur = g.current;
      if (cur.phase !== 'playing' || !cur.round || cur.asked !== asked) return;
      cur.judge('correct', current(cur.round).question.answers[0]);
    }, ANSWER_AFTER_MS);
    return () => clearTimeout(t);
  }, [enabled, phase, asked, voice.reading, shown]);
}

/**
 * On the result screen of a self-test round: logs it, scrolls down to SES
 * OTURUMU (for a screenshot), waits RESULT_DWELL_MS, then opens the next
 * level or ends.
 */
export function useSelfTestResult(level: number, scrollToEnd?: () => void) {
  useEffect(() => {
    if (!selfTestOn() || !launched) return;
    logAudio('result');
    const scroll = setTimeout(() => scrollToEnd?.(), 500);
    const t = setTimeout(() => {
      if (level < SELF_TEST_LEVELS) router.replace(selfTestUrl(level + 1));
      else {
        logAudio('done');
        stopLog();
      }
    }, RESULT_DWELL_MS);
    return () => { clearTimeout(t); clearTimeout(scroll); };
  }, [level]);
}
