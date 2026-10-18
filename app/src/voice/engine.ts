import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

import { Host } from './host';
import { AnswerListener } from './listener';
import { nativeRecognizer } from './recognizer';
import { Sounds } from './sounds';

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
// The iOS audio session for the whole app: play and record at once, on the
// loudspeaker (not the earpiece), and not muted by the ring/silent switch.
// Until this is set iOS uses its default category, which the switch silences,
// so nothing is played before it resolves.
export function prepareAudio(): Promise<void> {
  ready ??= setIsAudioActiveAsync(true)
    .then(() => setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldRouteThroughEarpiece: false, interruptionMode: 'mixWithOthers' }))
    .catch(() => { ready = null; });
  return ready;
}
