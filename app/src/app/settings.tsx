import { router } from 'expo-router';
import { Linking, Pressable, Switch, Text, View } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';

import { useSettings } from '../store/SettingsContext';
import { BackLink } from '../ui/BackLink';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';

// Settings: the voice game and the front camera inside the ring.
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
