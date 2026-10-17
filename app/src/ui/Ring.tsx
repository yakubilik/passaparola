import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Bubble } from './Bubble';
import type { BubbleKind } from './theme';

export type RingItem = { label: string; kind: BubbleKind; accessibilityLabel?: string; testID?: string };

type Props = {
  items: RingItem[];
  size: number;
  bubble: number;
  children?: ReactNode;
  testID?: string;
};

// Letters on a circle, A at twelve o'clock, clockwise; children sit in the middle.
export function Ring({ items, size, bubble, children, testID }: Props) {
  const r = (size - bubble - 12) / 2;
  const c = size / 2;
  return (
    <View testID={testID} style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      {items.map((it, i) => {
        const a = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
        const s = it.kind === 'active' ? bubble + Math.round(bubble * 0.35) : bubble;
        return (
          <Bubble
            key={it.label + i}
            label={it.label}
            kind={it.kind}
            size={s}
            testID={it.testID}
            accessibilityLabel={it.accessibilityLabel}
            style={{ position: 'absolute', left: c + r * Math.cos(a) - s / 2, top: c + r * Math.sin(a) - s / 2 }}
          />
        );
      })}
    </View>
  );
}
