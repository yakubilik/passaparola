import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

import { Host } from './host';
import { AnswerListener } from './listener';
import { nativeRecognizer, setVoiceSession } from './recognizer';
import { fadeInNext, Sounds } from './sounds';

// One host, one mic and one set of cues for the whole app, so the host can
// finish a line after the game screen has gone. While the host speaks the
// listener knows which words to ignore and the bed is lowered.
export const host = new Host();
export const listener = new AnswerListener(nativeRecognizer);
export const sounds = new Sounds();

host.onSpeaking = (texts) => {
  if (texts) listener.hostSpeaking(texts);
  else listener.hostDone();
  sounds.duck(!!texts);
};

let ready: Promise<void> | null = null;
// The iOS audio session for a round: play and record at once, on the
// loudspeaker (not the earpiece), and not muted by the ring/silent switch, in
// the recognizer's own category so opening the mic changes nothing. Nothing
// touches the session at launch or on the menus: only a round (the game or
// match screen, a match's turn) and the mic check call this. The category and
// mode are set before the session is made active, so switching to it is a
// single change, and the first sound after it fades in (fadeInNext).
// It runs once, before any mic: the session is never reconfigured while the
// mic is open (see recognizer.ts).
export function prepareAudio(): Promise<void> {
  if (!ready && listener.listening) return Promise.resolve();
  ready ??= setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldRouteThroughEarpiece: false, interruptionMode: 'mixWithOthers' })
    .then(setVoiceSession)
    .then(() => setIsAudioActiveAsync(true))
    .then(fadeInNext)
    .catch(() => { ready = null; });
  return ready;
}

/** Once the mic has really started, the session is left this long before the host's first line. */
export const SESSION_SETTLE_MS = 300;
/** The longest wait for the mic to report it has started. */
export const MIC_UP_MAX_MS = 1500;

let settling: Promise<void> | null = null;
let settledFor = -1;  // the listener's opening the players were last renewed for

/** The host's first line of this mic opening may play now: settleAudio has run since the mic opened. */
export function audioSettled(): boolean {
  return settledFor === listener.openings;
}

// The first host line of a round waits for this. On iOS the recognizer's
// first start sets the session and then brings up its audio engine with
// voice processing, input and output, which reconfigures the audio I/O and
// switches on the ducking of the app's other sound. A clip already playing
// across that change is left at the level it started with, louder than every
// sound after it and deaf to the volume buttons until it ends (the 'go' line,
// "İşte sağ cepten sorular çıkıyor efendim", reported 19 Oct 2026). So:
// the session is set (prepareAudio), the mic is opened and reports 'start'
// (its engine is running), a short pause lets the route settle, the players
// made before it are let go, and the next sound fades in.
export function settleAudio(): Promise<void> {
  if (audioSettled()) return Promise.resolve();
  settling ??= prepareAudio()
    .then(() => (listener.open ? listener.whenUp(MIC_UP_MAX_MS).then(() => wait(SESSION_SETTLE_MS)) : undefined))
    .then(() => {
      host.renew();
      sounds.renew();
      fadeInNext();
      settledFor = listener.openings;
    })
    .finally(() => { settling = null; });
  return settling;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
