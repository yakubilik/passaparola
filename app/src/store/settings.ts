import AsyncStorage from '@react-native-async-storage/async-storage';

export const SETTINGS_KEY = 'harfiyen.settings.v1';

// Device-local preferences.
export type Settings = {
  camera: boolean; // show the front camera inside the ring
};

export const DEFAULT_SETTINGS: Settings = { camera: true };

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw);
    return { camera: typeof s.camera === 'boolean' ? s.camera : DEFAULT_SETTINGS.camera };
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
