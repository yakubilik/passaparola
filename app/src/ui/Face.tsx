import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import {
  Camera, useCameraDevice, useCameraPermission, useObjectOutput, type CameraDevice, type CameraRef, type ScannedObject, type ScannedObjectType,
} from 'react-native-vision-camera';

import { clampCrop, ease, fullCrop, LOST_MS, mainFace, nextAim, settled, cropTransform, type Aim, type Box, type Crop } from '../camera/faceCrop';
import { useSettings } from '../store/SettingsContext';

const FACE_TYPES: ScannedObjectType[] = ['face'];

// The picture under the letter ring, as on the show: a square of the front
// camera, cover-cropped, with the player's head framed in the middle of the
// ring (camera/faceCrop.ts keeps it steady). With the camera switched off in
// settings, no permission, no front camera or no face in sight, the navy
// studio background with the silhouette shows instead and the game goes on.
export function Face({ size }: { size: number }) {
  const { settings, ready } = useSettings();
  const permission = useCameraPermission();
  const device = useCameraDevice('front');
  const wanted = ready && settings.camera && !!device;

  const { canRequestPermission, requestPermission } = permission;
  useEffect(() => {
    if (wanted && canRequestPermission) requestPermission().catch(() => {});
  }, [wanted, canRequestPermission, requestPermission]);

  return (
    <View
      testID="face"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.04),
        overflow: 'hidden',
        backgroundColor: '#161d3c',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 0 40px rgba(61,107,255,0.3)',
      }}
    >
      {wanted && permission.hasPermission ? <FaceCam size={size} device={device!} /> : <Placeholder size={size} />}
    </View>
  );
}

function FaceCam({ size, device }: { size: number; device: CameraDevice }) {
  const camera = useRef<CameraRef>(null);
  const [found, setFound] = useState(false);
  const { onFaces, style } = useFaceCrop(size, setFound);

  const onObjectsScanned = useCallback((objects: ScannedObject[]) => {
    const view = camera.current;
    if (!view) return;
    const boxes: Box[] = [];
    for (const o of objects) {
      try {
        boxes.push(view.convertScannedObjectCoordinatesToViewCoordinates(o).boundingBox);
      } catch {
        // Preview not ready yet.
      }
    }
    onFaces(boxes);
  }, [onFaces]);
  const faces = useObjectOutput({ types: FACE_TYPES, onObjectsScanned });

  return (
    <>
      <Animated.View testID="face-camera" style={[{ width: size, height: size }, style]}>
        <Camera ref={camera} style={{ width: size, height: size }} device={device} isActive outputs={[faces]} resizeMode="cover" />
      </Animated.View>
      {!found && <View style={{ position: 'absolute', inset: 0 }}><Placeholder size={size} /></View>}
    </>
  );
}

// Detector readings in, a steady transform out. The crop eases on every
// animation frame until it reaches its goal, then the loop rests.
export function useFaceCrop(size: number, setFound: (found: boolean) => void) {
  const aim = useRef<Aim | null>(null);
  const crop = useRef<Crop>(fullCrop(size));
  const raf = useRef(0);
  const last = useRef(0);
  const lost = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anim] = useState(() => ({ scale: new Animated.Value(1), x: new Animated.Value(0), y: new Animated.Value(0) }));

  const apply = useCallback((c: Crop) => {
    const t = cropTransform(c, size);
    anim.scale.setValue(t.scale);
    anim.x.setValue(t.translateX);
    anim.y.setValue(t.translateY);
  }, [anim, size]);

  const tick = useCallback((now: number) => {
    const goal = aim.current?.goal ?? fullCrop(size);
    const dt = last.current ? Math.min(100, now - last.current) : 1000 / 60;
    last.current = now;
    crop.current = ease(crop.current, goal, dt, size);
    apply(crop.current);
    raf.current = settled(crop.current, goal, size) ? 0 : requestAnimationFrame(tick);
  }, [apply, size]);

  const kick = useCallback(() => {
    if (raf.current) return;
    last.current = 0;
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const onFaces = useCallback((boxes: Box[]) => {
    const face = mainFace(boxes);
    if (!face) return;
    const first = !aim.current;
    aim.current = nextAim(aim.current, face);
    // The first face replaces the placeholder already framed, not sliding in.
    if (first) { crop.current = clampCrop(aim.current.goal, size); apply(crop.current); }
    setFound(true);
    if (lost.current) clearTimeout(lost.current);
    lost.current = setTimeout(() => {
      aim.current = null;
      setFound(false);
      kick();
    }, LOST_MS);
    kick();
  }, [apply, kick, setFound, size]);

  // A new circle size (window change): start over at the whole preview in the
  // new size instead of applying a crop measured for the old one.
  const shownSize = useRef(size);
  useEffect(() => {
    if (shownSize.current === size) return;
    shownSize.current = size;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    aim.current = null;
    crop.current = fullCrop(size);
    apply(crop.current);
  }, [size, apply]);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (lost.current) clearTimeout(lost.current);
  }, []);

  const style = { transform: [{ translateX: anim.x }, { translateY: anim.y }, { scale: anim.scale }] };
  return { onFaces, style };
}

// The square without a picture: the studio background and the player's
// silhouette, framed like the camera picture (head in the middle of the ring,
// shoulders under the bottom letters).
function Placeholder({ size }: { size: number }) {
  const head = size * 0.36;
  return (
    <View
      testID="face-placeholder"
      style={{
        width: size,
        height: size,
        backgroundImage: 'radial-gradient(circle at 50% 40%, #24305e 0%, #141a36 70%)',
        backgroundColor: '#161d3c',
      }}
    >
      <View style={{ position: 'absolute', left: (size - head) / 2, top: size * 0.42 - head * 0.55, width: head, height: head * 1.1, borderRadius: size, backgroundColor: '#7fb0ff' }} />
      <View style={{ position: 'absolute', left: size * 0.13, bottom: 0, width: size * 0.74, height: size * 0.3, borderTopLeftRadius: size * 0.37, borderTopRightRadius: size * 0.37, backgroundColor: '#5a92f0' }} />
    </View>
  );
}
