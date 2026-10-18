// Stand-in for react-native-vision-camera in Jest: no native camera. By
// default there is no front camera (like the simulator); tests switch one on
// and feed scanned faces through `visionCamera`.
import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';

type Box = { x: number; y: number; width: number; height: number };
type Scanned = { type: 'face'; boundingBox: Box };

export const visionCamera = {
  device: undefined as undefined | { id: string; position: 'front' },
  status: 'not-determined' as 'not-determined' | 'authorized' | 'denied',
  requested: 0,
  onObjectsScanned: undefined as undefined | ((objects: Scanned[]) => void),
  reset() {
    this.device = undefined;
    this.status = 'not-determined';
    this.requested = 0;
    this.onObjectsScanned = undefined;
  },
};

export function useCameraDevice() {
  return visionCamera.device;
}

export function useCameraPermission() {
  const s = visionCamera.status;
  return {
    status: s,
    hasPermission: s === 'authorized',
    canRequestPermission: s === 'not-determined',
    requestPermission: requestPermission,
  };
}

async function requestPermission() {
  visionCamera.requested++;
  return visionCamera.status === 'authorized';
}

export function useObjectOutput({ onObjectsScanned }: { onObjectsScanned?: (o: Scanned[]) => void }) {
  visionCamera.onObjectsScanned = onObjectsScanned;
  return { kind: 'object-output' };
}

// The preview reports scanned objects already in view coordinates.
export const Camera = forwardRef<object, { style?: object }>(function Camera({ style }, ref) {
  useImperativeHandle(ref, () => ({ convertScannedObjectCoordinatesToViewCoordinates: (o: Scanned) => o }));
  return <View testID="camera-preview" style={style} />;
});
