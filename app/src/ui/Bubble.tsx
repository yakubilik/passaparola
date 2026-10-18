import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BUBBLE, F, PENDING_GRADIENT, type BubbleKind } from './theme';

type Props = {
  label: string;
  kind: BubbleKind;
  size: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  // Drawn over the camera picture: the filled disc plus a dark halo keep it
  // readable on a bright face.
  halo?: boolean;
};

export const HALO = '0 1px 6px rgba(0,0,0,0.6)';

// One round letter (or level stop): a glowing disc, white-rimmed.
export function Bubble({ label, kind, size, style, testID, accessibilityLabel, halo }: Props) {
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
          boxShadow: halo ? `${c.glow}, ${HALO}` : c.glow,
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
