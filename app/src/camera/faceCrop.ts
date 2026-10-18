// Keeps the player's face centred in the ring. The camera preview is a square
// as big as the circle; we zoom into a smaller square of it (the crop) and
// slide that square so the face sits in the middle. Lesson from the web
// version (js/face.js): following every detector reading makes the picture
// shake, so readings go through a dead zone first and the crop then eases
// towards them, zoom slower than position.

// A face box or a point, in the preview's own view coordinates (pixels).
export type Box = { x: number; y: number; width: number; height: number };
// The visible square of the preview: centre and side length, same coordinates.
export type Crop = { cx: number; cy: number; size: number };

export const FACE_SHARE = 2 / 3;      // face size as a share of the circle
export const DEAD_ZONE = 0.06;        // ignore face moves under this share of the crop
export const ZOOM_DEAD_ZONE = 0.15;   // re-zoom only when the face grows or shrinks this much
export const MOVE_EASE = 0.15;        // per 60 fps frame, towards the goal centre
export const ZOOM_EASE = 0.05;        // per 60 fps frame, towards the goal size (zoom pumping looks worst)
export const MAX_ZOOM = 3;            // a face far away is not blown up beyond this
export const LOST_MS = 1200;          // no face for this long: show the placeholder

const FRAME_MS = 1000 / 60;

// The crop that puts this face in the middle at FACE_SHARE of the circle.
export function cropFor(face: Box): Crop {
  return {
    cx: face.x + face.width / 2,
    cy: face.y + face.height / 2,
    size: Math.max(face.width, face.height) / FACE_SHARE,
  };
}

// The whole preview, unzoomed: what is shown before a face is found.
export function fullCrop(view: number): Crop {
  return { cx: view / 2, cy: view / 2, size: view };
}

// Keeps the crop inside the preview and between 1x and MAX_ZOOM.
export function clampCrop(c: Crop, view: number): Crop {
  const size = Math.min(view, Math.max(view / MAX_ZOOM, c.size));
  const half = size / 2;
  return {
    size,
    cx: Math.min(view - half, Math.max(half, c.cx)),
    cy: Math.min(view - half, Math.max(half, c.cy)),
  };
}

// What the detector has been saying lately (a short running average, so one
// odd reading counts for little) and where the crop is heading.
export type Aim = { seen: Crop; goal: Crop; readings: number };

export const READING_WEIGHT = 0.3;    // share of a new reading in the running average
export const FIRST_READINGS = 10;     // the goal follows the average this long, so one odd first reading does not stick

// Folds a new detector reading into the aim. Small wobbles are not
// movements of the face; zoom only follows a real move closer or further.
export function nextAim(aim: Aim | null, face: Box): Aim {
  const now = cropFor(face);
  if (!aim) return { seen: now, goal: now, readings: 1 };
  const w = READING_WEIGHT;
  const seen = {
    cx: aim.seen.cx + (now.cx - aim.seen.cx) * w,
    cy: aim.seen.cy + (now.cy - aim.seen.cy) * w,
    size: aim.seen.size + (now.size - aim.seen.size) * w,
  };
  const readings = aim.readings + 1;
  if (readings <= FIRST_READINGS) return { seen, goal: seen, readings };
  const { goal } = aim;
  const moved = Math.abs(seen.cx - goal.cx) > DEAD_ZONE * goal.size || Math.abs(seen.cy - goal.cy) > DEAD_ZONE * goal.size;
  const zoomed = Math.abs(seen.size - goal.size) > ZOOM_DEAD_ZONE * goal.size;
  if (!moved && !zoomed) return { seen, goal, readings };
  return {
    seen,
    readings,
    goal: {
      cx: moved ? seen.cx : goal.cx,
      cy: moved ? seen.cy : goal.cy,
      size: zoomed ? seen.size : goal.size,
    },
  };
}

// One animation step of dt milliseconds from the shown crop towards the goal.
export function ease(crop: Crop, goal: Crop, dt: number, view: number): Crop {
  const frames = Math.max(0, dt) / FRAME_MS;
  const move = 1 - Math.pow(1 - MOVE_EASE, frames);
  const zoom = 1 - Math.pow(1 - ZOOM_EASE, frames);
  const target = clampCrop(goal, view);
  return clampCrop({
    cx: crop.cx + (target.cx - crop.cx) * move,
    cy: crop.cy + (target.cy - crop.cy) * move,
    size: crop.size + (target.size - crop.size) * zoom,
  }, view);
}

// True when the shown crop is close enough to the goal to stop animating.
export function settled(crop: Crop, goal: Crop, view: number): boolean {
  const t = clampCrop(goal, view);
  return Math.abs(crop.cx - t.cx) < 0.25 && Math.abs(crop.cy - t.cy) < 0.25 && Math.abs(crop.size - t.size) < 0.25;
}

// The transform that shows the crop filling a view-sized circle. RN scales
// around the view's centre, then translates.
export function cropTransform(crop: Crop, view: number): { scale: number; translateX: number; translateY: number } {
  const scale = view / crop.size;
  return { scale, translateX: scale * (view / 2 - crop.cx), translateY: scale * (view / 2 - crop.cy) };
}

// The largest of the faces, the one nearest the camera.
export function mainFace(faces: Box[]): Box | null {
  let best: Box | null = null;
  for (const f of faces) if (!best || f.width * f.height > best.width * best.height) best = f;
  return best;
}
