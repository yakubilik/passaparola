import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BUBBLE, F, PENDING_GRADIENT, type BubbleKind } from './theme';

type Props = {
  label: string;
  kind: BubbleKind;
  size: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

// One round letter (or level stop): a glowing disc, white-rimmed.
export function Bubble({ label, kind, size, style, testID, accessibilityLabel }: Props) {
  const c = BUBBLE[kind];
  const active = kind === 'active';
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.bg,
          backgroundImage: kind === 'pending' ? PENDING_GRADIENT : undefined,
          borderWidth: 2,
          borderColor: active ? '#0a0d1f' : kind === 'locked' || kind === 'soon' ? 'rgba(255,255,255,0.12)' : '#ffffff',
          boxShadow: c.glow,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ color: c.fg, fontFamily: F.displayBold, fontSize: Math.round(size * 0.52), lineHeight: Math.round(size * 0.66) }}>
        {label}
      </Text>
    </View>
  );
}
