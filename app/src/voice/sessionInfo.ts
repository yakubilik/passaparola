import { requireOptionalNativeModule } from 'expo';

// The iOS audio session as it is right now, for the diagnostic on the mic
// check screen (modules/audio-session-info, read only). Null where the native
// module is not there (Android, an older build).
type Native = {
  get(): {
    category: string;
    mode: string;
    categoryOptions: number;
    outputs: string[];
    inputs: string[];
    outputVolume: number;
    sampleRate: number;
    otherAudioPlaying: boolean;
  };
};

export type SessionInfo = {
  category: string;
  options: string[];
  mode: string;
  outputs: string[];
  inputs: string[];
  /** The phone's volume, 0 to 1: what the volume buttons set. */
  outputVolume: number;
  sampleRate: number;
  otherAudioPlaying: boolean;
};

// AVAudioSession.CategoryOptions bits.
const OPTIONS: [number, string][] = [
  [0x1, 'mixWithOthers'],
  [0x2, 'duckOthers'],
  [0x4, 'allowBluetooth'],
  [0x8, 'defaultToSpeaker'],
  [0x10, 'interruptSpokenAudioAndMixWithOthers'],
  [0x20, 'allowBluetoothA2DP'],
  [0x40, 'allowAirPlay'],
  [0x80, 'overrideMutedMicrophoneInterruption'],
];

// 'AVAudioSessionCategoryPlayAndRecord' -> 'playAndRecord', 'AVAudioSessionModeDefault' -> 'default'.
const short = (raw: string, prefix: string) => {
  const s = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  return s ? s[0].toLowerCase() + s.slice(1) : raw;
};

export function readAudioSession(): SessionInfo | null {
  try {
    const native = requireOptionalNativeModule<Native>('AudioSessionInfo');
    if (!native) return null;
    const s = native.get();
    return {
      category: short(s.category, 'AVAudioSessionCategory'),
      options: OPTIONS.filter(([bit]) => (s.categoryOptions & bit) !== 0).map(([, name]) => name),
      mode: short(s.mode, 'AVAudioSessionMode'),
      outputs: s.outputs,
      inputs: s.inputs,
      outputVolume: s.outputVolume,
      sampleRate: s.sampleRate,
      otherAudioPlaying: s.otherAudioPlaying,
    };
  } catch {
    return null;
  }
}
