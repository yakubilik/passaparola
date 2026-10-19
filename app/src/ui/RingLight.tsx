import { Image, View } from 'react-native';

// The studio light around the letter ring, design variant 1b
// (docs/design/reference/ring-light-rays.png): soft blue rays radiating from
// behind the ring, a blue halo along its inner edge and a thin dashed circle.
// Static PNGs drawn by tools/gen-ring-light.mjs, sized in units of the ring
// radius R as in the design, so nothing moves and nothing runs per frame.
const RAYS = require('../../assets/ring-rays.png');
const GLOW = require('../../assets/ring-glow.png');
const RAYS_R = 1.94;
const GLOW_R = 1.19;
const DASH_R = 0.85;
// How strongly the rays show through over the camera square (behind it they
// are at full strength).
const RAYS_OVER_SQUARE = 0.55;

// The rays behind the camera square: fills its parent (the area around the
// ring) and is clipped to it, so the light never runs into the top bar or the
// question below. The ring sits in the middle of that area.
export function RingRays({ radius }: { radius: number }) {
  const d = Math.round(2 * RAYS_R * radius);
  return (
    <View testID="ring-rays" pointerEvents="none" style={{ position: 'absolute', inset: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <Image source={RAYS} style={{ width: d, height: d }} />
    </View>
  );
}

// The light drawn over the camera square and under the letters: the rays'
// inner part, the halo and the dashed circle. All of it stays outside 0.6 R,
// so the player's face in the middle of the picture is left clear. Clipped to
// the square (same corners as ui/Face), where the rays behind it take over.
export function RingGlow({ size, radius }: { size: number; radius: number }) {
  const at = (r: number) => {
    const d = Math.round(2 * r * radius);
    return { position: 'absolute' as const, width: d, height: d, left: (size - d) / 2, top: (size - d) / 2 };
  };
  return (
    <View testID="ring-glow" pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: Math.round(size * 0.04), overflow: 'hidden' }}>
      <Image source={RAYS} style={[at(RAYS_R), { opacity: RAYS_OVER_SQUARE }]} />
      <Image source={GLOW} style={at(GLOW_R)} />
      <View
        testID="ring-dash"
        style={[at(DASH_R), { borderRadius: size, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.28)' }]}
      />
    </View>
  );
}
