import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { LETTERS } from '../game/letters';
import { Button } from '../ui/Button';
import { Ring } from '../ui/Ring';
import { Screen } from '../ui/Screen';
import { C, F, type BubbleKind } from '../ui/theme';

// The splash ring's colours, as in design frame 1d.
const SPLASH: BubbleKind[] = LETTERS.map((_, i) =>
  (['correct', 'passed', 'wrong', 'pending'] as const)[i % 7 === 0 ? 1 : i % 9 === 0 ? 2 : i % 3 === 0 ? 0 : 3],
);

// 1d: intro. Sign-in comes later; guests play now.
export default function Intro() {
  const { width } = useWindowDimensions();
  const [note, setNote] = useState(false);
  const size = Math.min(width - 30, 360);
  return (
    <Screen light="intro">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ring size={size} bubble={Math.round(size * 0.085)} items={LETTERS.map((l, i) => ({ label: l, kind: SPLASH[i] }))}>
          <Text style={{ fontFamily: F.display, fontSize: 56, color: C.text, letterSpacing: 1 }}>HARFİYEN</Text>
          <Text style={{ fontFamily: F.body, fontSize: 15, color: C.soft }}>A'dan Z'ye sesli bilgi yarışması</Text>
        </Ring>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 20, gap: 12 }}>
        <Button kind="light" label="Apple ile devam et" onPress={() => setNote(true)} />
        <Button kind="ghost" label="Google ile devam et" onPress={() => setNote(true)} />
        {note && (
          <Text style={{ textAlign: 'center', color: C.accentSoft, fontFamily: F.bodySemi, fontSize: 13 }}>
            Hesapla giriş yakında. Şimdilik misafir olarak oynayabilirsin.
          </Text>
        )}
        <Pressable accessibilityRole="button" onPress={() => router.replace('/menu')} style={{ paddingVertical: 10 }}>
          <Text style={{ textAlign: 'center', fontSize: 15, color: C.dim, fontFamily: F.bodySemi }}>Misafir olarak oyna</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
