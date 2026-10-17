import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, spotlight } from './theme';

// Navy studio floor with the spotlight from above; content inside the safe area.
export function Screen({ children, light = 'menu', style, bottomInset = true }: {
  children: ReactNode;
  light?: 'game' | 'menu' | 'intro' | 'none';
  style?: StyleProp<ViewStyle>;
  bottomInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: C.bg,
          backgroundImage: light === 'none' ? undefined : spotlight(light),
          paddingTop: insets.top,
          paddingBottom: bottomInset ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
