import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { C, F } from './theme';

export function BackLink({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Geri"
      hitSlop={12}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/menu')))}
      style={{ alignSelf: 'flex-start' }}
    >
      <Text style={{ fontFamily: F.bodySemi, fontSize: 15, color: C.dim }}>‹ Geri</Text>
    </Pressable>
  );
}
