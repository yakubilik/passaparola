import { router } from 'expo-router';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';

import { MUSIC_LEVELS } from '../store/settings';
import { useSettings } from '../store/SettingsContext';
import { BackLink } from '../ui/BackLink';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';

// Settings: the voice game, the music under the round and the front camera inside the ring.
export default function SettingsScreen() {
  const { settings, update } = useSettings();
  const permission = useCameraPermission();
  const denied = settings.camera && !permission.hasPermission && !permission.canRequestPermission;

  return (
    <Screen light="none">
      <View style={{ paddingHorizontal: 22, paddingTop: 14, gap: 16 }}>
        <BackLink />
        <Text style={{ fontFamily: F.display, fontSize: 36, color: C.text, lineHeight: 40 }}>Ayarlar</Text>

        <View style={{ borderRadius: 20, padding: 16, gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.text }}>Sesli oyun</Text>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, lineHeight: 18 }}>
                Sunucu soruları okur, sen cevabı söylersin. Kapalıyken cevabı yazarsın.
              </Text>
            </View>
            <Switch
              testID="setting-voice"
              accessibilityLabel="Sesli oyun"
              value={settings.voice}
              onValueChange={(voice) => { update({ voice }); }}
              trackColor={{ true: C.accent, false: '#2a3256' }}
            />
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/mic')} hitSlop={8}>
            <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.accentSoft }}>Mikrofonu dene ›</Text>
          </Pressable>
        </View>

        <View style={{ borderRadius: 20, padding: 16, gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.text }}>Müzik</Text>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, lineHeight: 18 }}>
                Oyun boyunca arkada çalan hafif müzik. Sunucu konuşurken kısılır.
              </Text>
            </View>
            <Switch
              testID="setting-music"
              accessibilityLabel="Müzik"
              value={settings.music}
              onValueChange={(music) => { update({ music }); }}
              trackColor={{ true: C.accent, false: '#2a3256' }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: settings.music ? 1 : 0.4 }}>
            <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.dim, flex: 1 }}>Ses</Text>
            <LevelButton label="−" a11y="Müziği kıs" testID="music-down" disabled={!settings.music || settings.musicLevel <= 1}
              onPress={() => update({ musicLevel: settings.musicLevel - 1 })} />
            <View testID="music-level" accessibilityLabel={`Müzik sesi ${settings.musicLevel} / ${MUSIC_LEVELS}`}
              style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end' }}>
              {Array.from({ length: MUSIC_LEVELS }, (_, i) => (
                <View key={i} style={{ width: 6, height: 8 + i * 1.6, borderRadius: 2, backgroundColor: i < settings.musicLevel ? C.accent : '#2a3256' }} />
              ))}
            </View>
            <LevelButton label="+" a11y="Müziği aç" testID="music-up" disabled={!settings.music || settings.musicLevel >= MUSIC_LEVELS}
              onPress={() => update({ musicLevel: settings.musicLevel + 1 })} />
          </View>
        </View>

        <View style={{ borderRadius: 20, padding: 16, gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.text }}>Ön kamera</Text>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, lineHeight: 18 }}>
                Oyunda yüzün harf çemberinin ortasında görünür. Görüntü telefonundan çıkmaz.
              </Text>
            </View>
            <Switch
              testID="setting-camera"
              accessibilityLabel="Ön kamera"
              value={settings.camera}
              onValueChange={(camera) => { update({ camera }); }}
              trackColor={{ true: C.accent, false: '#2a3256' }}
            />
          </View>
          {denied && (
            <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} hitSlop={8}>
              <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.accentSoft }}>
                Kamera izni kapalı. Telefon ayarlarından aç ›
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Screen>
  );
}

function LevelButton({ label, a11y, testID, disabled, onPress }: { label: string; a11y: string; testID: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled }}
      disabled={disabled} onPress={onPress} hitSlop={6}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a3256', opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 20, color: C.text, lineHeight: 22 }}>{label}</Text>
    </Pressable>
  );
}
