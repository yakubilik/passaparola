import { router } from 'expo-router';
import { Text, View, useWindowDimensions } from 'react-native';

import { LETTERS } from '../game/letters';
import { Button } from '../ui/Button';
import { Ring } from '../ui/Ring';
import { Screen } from '../ui/Screen';
import { C, F, type BubbleKind } from '../ui/theme';

// The splash ring's colours, as in design frame 1d.
const SPLASH: BubbleKind[] = LETTERS.map((_, i) =>
  (['correct', 'passed', 'wrong', 'pending'] as const)[i % 7 === 0 ? 1 : i % 9 === 0 ? 2 : i % 3 === 0 ? 0 : 3],
);

// 1d: intro. No accounts: everything stays on the phone, one tap to the menu.
export default function Intro() {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 30, 360);
  return (
    <Screen light="intro">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ring size={size} bubble={Math.round(size * 0.085)} items={LETTERS.map((l, i) => ({ label: l, kind: SPLASH[i] }))}>
          <Text style={{ fontFamily: F.display, fontSize: 56, color: C.text, letterSpacing: 1 }}>HARFİYEN</Text>
          <Text style={{ fontFamily: F.body, fontSize: 15, color: C.soft }}>A'dan Z'ye sesli bilgi yarışması</Text>
        </Ring>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 20 }}>
        <Button kind="primary" label="Başla" testID="intro-start" onPress={() => router.replace('/menu')} />
      </View>
    </Screen>
  );
}
