import { View } from 'react-native';

// The middle of the ring. For now a silhouette; the front camera with the
// player's face centred goes here in a later step.
export function Face({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundImage: 'radial-gradient(circle at 50% 35%, #24305e 0%, #141a36 70%)',
        backgroundColor: '#161d3c',
        boxShadow: '0 0 0 2px rgba(255,255,255,0.12), 0 0 60px rgba(61,107,255,0.35)',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size, backgroundColor: '#7fb0ff', marginBottom: size * 0.04 }} />
      <View style={{ width: size * 0.68, height: size * 0.34, borderTopLeftRadius: size, borderTopRightRadius: size, backgroundColor: '#5a92f0' }} />
    </View>
  );
}
