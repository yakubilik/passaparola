import { setAudioModeAsync } from 'expo-audio';

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

let modeSet = false;
// Play through the loudspeaker in silent mode, with the mic open.
export function prepareAudio() {
  if (modeSet) return;
  modeSet = true;
  setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, interruptionMode: 'mixWithOthers' }).catch(() => {
    modeSet = false;
  });
}
