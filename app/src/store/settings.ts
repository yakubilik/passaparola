import AsyncStorage from '@react-native-async-storage/async-storage';

export const SETTINGS_KEY = 'harfiyen.settings.v1';

// voice: the host reads the clues and the player answers by speaking (typed
// answers keep working either way). micChecked: the mic check before the
// first voice game has been seen.
export type Settings = { voice: boolean; micChecked: boolean };

export const DEFAULT_SETTINGS: Settings = { voice: true, micChecked: false };

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw);
    return { voice: s.voice ?? DEFAULT_SETTINGS.voice, micChecked: s.micChecked ?? DEFAULT_SETTINGS.micChecked };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Unavailable storage: the setting holds for this session.
  }
}
