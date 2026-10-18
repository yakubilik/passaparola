import {
  clampCrop, cropFor, cropTransform, ease, EYE_LINE, FACE_SHARE, FIRST_READINGS, fullCrop, mainFace, MAX_ZOOM, nextAim, settled, type Aim, type Box, type Crop,
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

// Where a point of the preview lands in the shown square: RN scales around
// the centre, then translates.
function onScreen(crop: Crop, x: number, y: number) {
  const t = cropTransform(crop, VIEW);
  return { x: VIEW / 2 + t.scale * (x - VIEW / 2) + t.translateX, y: VIEW / 2 + t.scale * (y - VIEW / 2) + t.translateY, scale: t.scale };
}

test('face box -> crop: head centred left to right, eyes at 40-45% from the top, head about half the square', () => {
  // A face anywhere in the preview, small or large (but within the zoom limits).
  for (const face of [
    { x: 80, y: 50, width: 70, height: 80 },
    { x: 60, y: 70, width: 90, height: 100 },
    { x: 100, y: 40, width: 60, height: 66 },
  ]) {
    const crop = cropFor(face);
    expect(clampCrop(crop, VIEW)).toEqual(crop);
    const centre = onScreen(crop, face.x + face.width / 2, face.y + face.height / 2);
    expect(centre.x / VIEW).toBeCloseTo(0.5, 5);
    const eyes = onScreen(crop, 0, face.y + face.height * EYE_LINE).y / VIEW;
    expect(eyes).toBeGreaterThanOrEqual(0.4);
    expect(eyes).toBeLessThanOrEqual(0.45);
    const head = (face.height * centre.scale) / VIEW;
    expect(head).toBeGreaterThan(0.45);
    expect(head).toBeLessThan(0.55);
    // The chin is above the bottom letters' band, so the ring encircles the
    // head and the lower letters sit over the shoulders.
    const chin = onScreen(crop, 0, face.y + face.height).y / VIEW;
    expect(chin).toBeLessThan(0.8);
    expect(onScreen(crop, 0, face.y).y / VIEW).toBeGreaterThan(0.1);
  }
});

test('a jittery face held still ends up framed the same way', () => {
  const { crop } = run(jitteryTrack(300, 130, 100, 80, 3, 0.05));
  const c = onScreen(crop, 130, 100);
  expect(Math.abs(c.x - VIEW / 2)).toBeLessThan(VIEW * 0.03);
  const eyes = onScreen(crop, 0, 100 - 40 + 80 * EYE_LINE).y / VIEW;
  expect(eyes).toBeGreaterThan(0.39);
  expect(eyes).toBeLessThan(0.46);
  const head = (80 * c.scale) / VIEW;
  expect(head).toBeGreaterThan(0.45);
  expect(head).toBeLessThan(0.56);
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
  expect(cropFor({ x: 10, y: 20, width: 60, height: 80 })).toEqual({ cx: 40, cy: 64.8, size: 160 });
  const goal = { cx: 100, cy: 100, size: 120 };
  expect(settled({ cx: 100.1, cy: 99.9, size: 120.1 }, goal, VIEW)).toBe(true);
  expect(settled({ cx: 103, cy: 100, size: 120 }, goal, VIEW)).toBe(false);
  const small = { x: 0, y: 0, width: 20, height: 20 };
  const big = { x: 50, y: 50, width: 60, height: 60 };
  expect(mainFace([small, big])).toBe(big);
  expect(mainFace([])).toBeNull();
  expect(cropTransform(fullCrop(VIEW), VIEW)).toEqual({ scale: 1, translateX: 0, translateY: 0 });
});
