import { useRef, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { C } from './theme';

// A horizontal slider from 0 to 100 in steps of `step`: drag or tap along the
// track, or swipe up and down with VoiceOver (adjustable). `onChange` runs
// only when the value moves to another step.
export function Slider({ value, step, onChange, label, testID }: {
  value: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const last = useRef(value);
  last.current = value;
  const set = (v: number) => {
    const next = Math.min(100, Math.max(0, Math.round(v / step) * step));
    if (next !== last.current) {
      last.current = next;
      onChange(next);
    }
  };
  const at = (e: GestureResponderEvent) => {
    if (width > 0) set((e.nativeEvent.locationX / width) * 100);
  };
  const share = `${value}%` as const;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: value, text: `%${value}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={at}
      onResponderMove={at}
      hitSlop={{ top: 12, bottom: 12 }}
      style={{ height: 32, justifyContent: 'center' }}
    >
      <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: '#2a3256' }}>
        <View style={{ width: share, height: 6, borderRadius: 3, backgroundColor: C.accent }} />
      </View>
      <View pointerEvents="none"
        style={{ position: 'absolute', left: share, marginLeft: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: C.text, borderWidth: 3, borderColor: C.accent }} />
    </View>
  );
}
