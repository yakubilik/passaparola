import { Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { ProgressProvider } from '../store/ProgressContext';
import { SettingsProvider, useSettings } from '../store/SettingsContext';
import { C } from '../ui/theme';
import { sounds } from '../voice/engine';

// The Müzik choice from Ayarlar, applied to the bed wherever it plays.
function MusicSetting() {
  const { settings } = useSettings();
  useEffect(() => { sounds.setMusic(settings.music, settings.musicLevel); }, [settings.music, settings.musicLevel]);
  return null;
}

// No sound and no audio session at launch or on the menus: a round sets the
// session up when it opens (prepareAudio in voice/engine.ts).
export default function RootLayout() {
  const [loaded, error] = useFonts({
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
  });
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return (
    <SettingsProvider>
      <MusicSetting />
      <ProgressProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'fade' }}>
          <Stack.Screen name="game" options={{ gestureEnabled: false }} />
          <Stack.Screen name="result" options={{ gestureEnabled: false }} />
          <Stack.Screen name="match" options={{ gestureEnabled: false }} />
          <Stack.Screen name="match-result" options={{ gestureEnabled: false }} />
        </Stack>
      </ProgressProvider>
    </SettingsProvider>
  );
}
