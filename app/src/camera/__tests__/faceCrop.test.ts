import {
  clampCrop, cropFor, cropTransform, ease, FACE_SHARE, FIRST_READINGS, fullCrop, mainFace, MAX_ZOOM, nextAim, settled, type Aim, type Box, type Crop,
} from '../faceCrop';

const VIEW = 240;
const DT = 1000 / 30; // the detector reports about 30 times a second

// Deterministic noise in [-1, 1].
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648) * 2 - 1;
  };
}

// A face held still at (cx, cy) with the given width, read by a detector
// that wobbles by up to `jitter` pixels and `sizeJitter` of the width.
function jitteryTrack(n: number, cx: number, cy: number, w: number, jitter: number, sizeJitter: number, seed = 1): Box[] {
  const r = noise(seed);
  return Array.from({ length: n }, () => {
    const width = w * (1 + r() * sizeJitter);
    return { x: cx + r() * jitter - width / 2, y: cy + r() * jitter - width / 2, width, height: width };
  });
}

// Runs readings through the goal and the easing, one frame per reading.
function run(track: Box[], start: Crop = fullCrop(VIEW)) {
  let aim: Aim | null = null;
  let crop = start;
  const shown: Crop[] = [];
  for (const face of track) {
    aim = nextAim(aim, face);
    crop = ease(crop, aim.goal, DT, VIEW);
    shown.push(crop);
  }
  return { shown, goal: aim!.goal, crop };
}

const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const steps = (xs: number[]) => xs.slice(1).map((x, i) => Math.abs(x - xs[i]));

test('a jittery track of a face held still comes out steady', () => {
  const track = jitteryTrack(300, 130, 110, 90, 5, 0.08);
  const inputX = track.map((f) => f.x + f.width / 2);
  const inputSize = track.map((f) => f.width / FACE_SHARE);
  expect(spread(inputX)).toBeGreaterThan(8);      // the raw readings shake by about 10 px
  expect(spread(inputSize)).toBeGreaterThan(15);

  const { shown } = run(track);
  // Once settled (after four seconds), the picture does not move at all.
  const after = shown.slice(120);
  expect(spread(after.map((c) => c.cx))).toBeLessThan(0.5);
  expect(spread(after.map((c) => c.cy))).toBeLessThan(0.5);
  expect(spread(after.map((c) => c.size))).toBeLessThan(0.5);
  // ...and it never jumps from frame to frame on the way there.
  expect(Math.max(...steps(shown.map((c) => c.cx)))).toBeLessThan(15);
  expect(Math.max(...steps(shown.map((c) => c.size)))).toBeLessThan(10);
});

test('the face ends up in the centre, filling about two thirds of the circle', () => {
  const { crop } = run(jitteryTrack(300, 130, 110, 90, 3, 0.05));
  const t = cropTransform(crop, VIEW);
  // Where the true face centre lands on screen: scale around the centre, then translate.
  const onScreen = (p: number) => VIEW / 2 + t.scale * (p - VIEW / 2);
  expect(Math.abs(onScreen(130) + t.translateX - VIEW / 2)).toBeLessThan(VIEW * 0.03);
  expect(Math.abs(onScreen(110) + t.translateY - VIEW / 2)).toBeLessThan(VIEW * 0.03);
  const faceOnScreen = (90 * t.scale) / VIEW;
  expect(faceOnScreen).toBeGreaterThan(0.6);
  expect(faceOnScreen).toBeLessThan(0.73);
});

test('a real move is followed, smoothly', () => {
  const still = jitteryTrack(90, 100, 120, 80, 3, 0.05, 2);
  const moved = jitteryTrack(90, 150, 120, 80, 3, 0.05, 3);
  const { shown } = run([...still, ...moved]);
  expect(Math.abs(shown[89].cx - 100)).toBeLessThan(3);
  expect(Math.abs(shown[179].cx - 150)).toBeLessThan(3);
  // No frame jumps more than a fraction of the way.
  expect(Math.max(...steps(shown.slice(89).map((c) => c.cx)))).toBeLessThan(15);
});

test('zoom only changes on a real move closer or further', () => {
  const face = (w: number): Box => ({ x: 120 - w / 2, y: 120 - w / 2, width: w, height: w });
  let aim = nextAim(null, face(80));
  for (let i = 1; i < FIRST_READINGS; i++) aim = nextAim(aim, face(80));
  const start = aim.goal.size;
  // The detector keeps saying the face is 10% bigger: not a move, zoom stays.
  for (let i = 0; i < 30; i++) aim = nextAim(aim, face(88));
  expect(aim.goal.size).toBe(start);
  // 40% bigger: the player leant in, zoom follows.
  for (let i = 0; i < 30; i++) aim = nextAim(aim, face(112));
  expect(aim.goal.size).toBeGreaterThan(start * 1.15);
  expect(run(Array(300).fill(face(112))).crop.size).toBeCloseTo(112 / FACE_SHARE, 0);
  // Zoom eases slower than position.
  const crop = ease({ cx: 100, cy: 100, size: 200 }, { cx: 120, cy: 100, size: 150 }, DT, VIEW);
  expect((crop.cx - 100) / 20).toBeGreaterThan((200 - crop.size) / 50);
});

test('the crop stays inside the picture and within the zoom limits', () => {
  expect(clampCrop({ cx: 5, cy: 300, size: 100 }, VIEW)).toEqual({ cx: 50, cy: 190, size: 100 });
  expect(clampCrop({ cx: 120, cy: 120, size: 1000 }, VIEW).size).toBe(VIEW);
  expect(clampCrop({ cx: 120, cy: 120, size: 10 }, VIEW).size).toBe(VIEW / MAX_ZOOM);
  // A face at the very edge: the picture slides as far as it can, never past the circle.
  const { crop } = run(jitteryTrack(200, 10, 230, 60, 2, 0.03));
  expect(crop.cx - crop.size / 2).toBeGreaterThanOrEqual(0);
  expect(crop.cy + crop.size / 2).toBeLessThanOrEqual(VIEW);
});

test('helpers: crop of a face, settled, the biggest face', () => {
  expect(cropFor({ x: 10, y: 20, width: 60, height: 80 })).toEqual({ cx: 40, cy: 60, size: 120 });
  const goal = { cx: 100, cy: 100, size: 120 };
  expect(settled({ cx: 100.1, cy: 99.9, size: 120.1 }, goal, VIEW)).toBe(true);
  expect(settled({ cx: 103, cy: 100, size: 120 }, goal, VIEW)).toBe(false);
  const small = { x: 0, y: 0, width: 20, height: 20 };
  const big = { x: 50, y: 50, width: 60, height: 60 };
  expect(mainFace([small, big])).toBe(big);
  expect(mainFace([])).toBeNull();
  expect(cropTransform(fullCrop(VIEW), VIEW)).toEqual({ scale: 1, translateX: 0, translateY: 0 });
});
