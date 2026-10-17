import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';

import { C, F } from './theme';

type Props = {
  label: string;
  onPress?: () => void;
  kind?: 'primary' | 'light' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({ label, onPress, kind = 'primary', disabled, style, testID }: Props) {
  const bg = { primary: C.accent, light: C.text, ghost: 'rgba(255,255,255,0.08)' }[kind];
  const fg = kind === 'light' ? C.bg : C.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 56,
          borderRadius: 16,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
          borderWidth: kind === 'ghost' ? 1 : 0,
          borderColor: 'rgba(255,255,255,0.14)',
          boxShadow: kind === 'primary' && !disabled ? '0 12px 30px rgba(61,107,255,0.35)' : undefined,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontFamily: F.bodyBold, fontSize: 17 }}>{label}</Text>
    </Pressable>
  );
}

export function SoonTag() {
  return (
    <Text
      style={{
        fontFamily: F.bodyBold,
        fontSize: 11,
        letterSpacing: 1.2,
        color: C.accentSoft,
        backgroundColor: 'rgba(61,107,255,0.14)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      YAKINDA
    </Text>
  );
}
