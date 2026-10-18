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
