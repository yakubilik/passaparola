import AsyncStorage from '@react-native-async-storage/async-storage';

export const SETTINGS_KEY = 'harfiyen.settings.v1';

// Device-local preferences. voice: the host reads the clues and the player
// answers by speaking (typed answers keep working either way). micChecked:
// the mic check before the first voice game has been seen. music: the bed
// under the round, musicLevel its loudness from 1 to MUSIC_LEVELS.
export type Settings = {
  camera: boolean; // show the front camera inside the ring
  voice: boolean;
  micChecked: boolean;
  music: boolean;
  musicLevel: number;
};

export const MUSIC_LEVELS = 10;
export const DEFAULT_MUSIC_LEVEL = 5;

export const DEFAULT_SETTINGS: Settings = { camera: true, voice: true, micChecked: false, music: true, musicLevel: DEFAULT_MUSIC_LEVEL };

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const level = (v: unknown, d: number) =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(MUSIC_LEVELS, Math.max(1, Math.round(v))) : d);

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw);
    return {
      camera: bool(s.camera, DEFAULT_SETTINGS.camera),
      voice: bool(s.voice, DEFAULT_SETTINGS.voice),
      micChecked: bool(s.micChecked, DEFAULT_SETTINGS.micChecked),
      music: bool(s.music, DEFAULT_SETTINGS.music),
      musicLevel: level(s.musicLevel, DEFAULT_SETTINGS.musicLevel),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable: the choice holds for this session.
  }
}
