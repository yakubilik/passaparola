import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';

import { useProgress } from '../store/ProgressContext';
import { VOLUME_STEP } from '../store/settings';
import { useSettings } from '../store/SettingsContext';
import { BackLink } from '../ui/BackLink';
import { Screen } from '../ui/Screen';
import { Slider } from '../ui/Slider';
import { C, F } from '../ui/theme';

// Settings: the voice game, the game's loudness (Ses), the front camera inside
// the ring, and wiping the career saved on the phone.
export default function SettingsScreen() {
  const { settings, update } = useSettings();
  const { reset } = useProgress();
  const [confirm, setConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const permission = useCameraPermission();
  const denied = settings.camera && !permission.hasPermission && !permission.canRequestPermission;

  return (
    <Screen light="none">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 24, gap: 16 }}>
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
          {/* A long press opens the speech test (Ses tanıma testi), a debug screen. */}
          <Pressable testID="mic-try" accessibilityRole="button" onPress={() => router.push('/mic')}
            onLongPress={() => router.push('/speech-test')} delayLongPress={800} hitSlop={8}>
            <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.accentSoft }}>Mikrofonu dene ›</Text>
          </Pressable>
        </View>

        <View style={{ borderRadius: 20, padding: 16, gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.text }}>Ses</Text>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, lineHeight: 18 }}>
                Sunucu, efektler ve müzik birlikte. Telefonun ses tuşlarıyla da ayarlanır.
              </Text>
            </View>
            <Text testID="volume-value" style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.accentSoft }}>%{settings.volume}</Text>
          </View>
          <Slider testID="setting-volume" label="Ses" value={settings.volume} step={VOLUME_STEP}
            onChange={(volume) => { update({ volume }); }} />
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

        <View style={{ borderRadius: 20, padding: 16, gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.text }}>İlerleme</Text>
            <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, lineHeight: 18 }}>
              {cleared ? 'İlerleme sıfırlandı. Her kategori 1. bölümden başlıyor.' : 'Açtığın bölümler ve en iyi skorların bu telefonda saklanır.'}
            </Text>
          </View>
          {confirm ? (
            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.text, lineHeight: 19 }}>
                Tüm kategorilerdeki bölümler kilitlenir ve en iyi skorlar silinir. Emin misin?
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable testID="reset-cancel" accessibilityRole="button" onPress={() => setConfirm(false)}
                  style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2a3256' }}>
                  <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.text }}>Vazgeç</Text>
                </Pressable>
                <Pressable testID="reset-confirm" accessibilityRole="button"
                  onPress={async () => { await reset(); setConfirm(false); setCleared(true); }}
                  style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.red }}>
                  <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: '#fff' }}>Sıfırla</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable testID="reset-progress" accessibilityRole="button" onPress={() => { setCleared(false); setConfirm(true); }} hitSlop={8}>
              <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.red }}>İlerlemeyi sıfırla</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

