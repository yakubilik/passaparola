// Keeps the contestant's face centred in the ring. Each frame of the camera is
// drawn into a canvas inside the circle, cropped around the face that
// MediaPipe finds. Detection runs on the same drawn frame, so the face
// position always matches what is on screen (iOS can hand the raw <video>
// texture over in a different orientation), and the crop moves smoothly
// instead of following every jitter of the detector.
import { FaceDetector, FilesetResolver } from '../vendor/mediapipe/vision_bundle.mjs';

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
const FACE_SHARE = 0.5;    // face width as a share of the circle
const MOVE_EASE = 0.12;    // per frame, towards the target centre
const ZOOM_EASE = 0.04;    // per frame, towards the target zoom (slower: zoom pumping looks worst)
const DEAD_ZONE = 0.04;    // ignore face moves smaller than this share of the crop
const DETECT_PX = 320;     // detection frame size

let detector = null, loading = null, video = null, raf = 0, lastRun = 0;
const canvas = document.createElement('canvas');
canvas.className = 'facecam';
const ctx = canvas.getContext('2d');
const probe = document.createElement('canvas');
const pctx = probe.getContext('2d', { willReadFrequently: true });
let crop = null;     // what is drawn now: {cx, cy, size} in video pixels
let goal = null;     // where the face is

function load() {
  if (!loading) {
    loading = FilesetResolver.forVisionTasks(BASE + 'wasm')
      .then(files => FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: BASE + 'blaze_face_short_range.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5
      }))
      .then(d => (detector = d))
      .catch(err => { console.warn('face detector unavailable', err); loading = null; throw err; });
  }
  return loading;
}

function clampCrop(c, vw, vh) {
  const size = Math.min(c.size, vw, vh);
  const half = size / 2;
  return {
    size,
    cx: Math.min(vw - half, Math.max(half, c.cx)),
    cy: Math.min(vh - half, Math.max(half, c.cy))
  };
}

function detect(vw, vh) {
  const scale = DETECT_PX / Math.max(vw, vh);
  probe.width = Math.round(vw * scale);
  probe.height = Math.round(vh * scale);
  pctx.drawImage(video, 0, 0, probe.width, probe.height);
  const res = detector.detect(probe);
  const best = res.detections.sort((a, b) => b.boundingBox.width - a.boundingBox.width)[0];
  if (!best) return;
  const b = best.boundingBox;
  const next = {
    cx: (b.originX + b.width / 2) / scale,
    cy: (b.originY + b.height * 0.42) / scale,
    size: (b.width / scale) / FACE_SHARE
  };
  if (!goal) { goal = next; return; }
  // Small wobbles of the detector are not movements of the face.
  if (Math.abs(next.cx - goal.cx) > DEAD_ZONE * goal.size || Math.abs(next.cy - goal.cy) > DEAD_ZONE * goal.size) {
    goal.cx = next.cx;
    goal.cy = next.cy;
  }
  if (Math.abs(next.size - goal.size) > 0.12 * goal.size) goal.size = next.size;
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!video || video.readyState < 2 || !video.videoWidth) return;
  const vw = video.videoWidth, vh = video.videoHeight;

  if (detector && now - lastRun >= 100) {
    lastRun = now;
    try { detect(vw, vh); } catch (e) { /* frame not ready */ }
  }

  const fallback = { cx: vw / 2, cy: vh / 2, size: Math.min(vw, vh) };
  const target = clampCrop(goal || fallback, vw, vh);
  if (!crop) crop = target;
  crop = clampCrop({
    cx: crop.cx + (target.cx - crop.cx) * MOVE_EASE,
    cy: crop.cy + (target.cy - crop.cy) * MOVE_EASE,
    size: crop.size + (target.size - crop.size) * ZOOM_EASE
  }, vw, vh);

  const box = canvas.parentElement;
  if (!box) return;
  const px = Math.round(box.clientWidth * Math.min(2, window.devicePixelRatio || 1));
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  ctx.save();
  ctx.setTransform(-1, 0, 0, 1, px, 0);   // mirror, like a selfie
  ctx.drawImage(video, crop.cx - crop.size / 2, crop.cy - crop.size / 2, crop.size, crop.size, 0, 0, px, px);
  ctx.restore();
}

function start(v) {
  video = v;
  crop = null;
  goal = null;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
  load().catch(() => {});
}

// Moves the picture into a circle (the stage of the player whose turn it is).
function attach(el) { if (el && canvas.parentElement !== el) el.appendChild(canvas); }

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  video = null;
  canvas.remove();
}

window.PP = Object.assign(window.PP || {}, { Face: { start, stop, attach, preload: load } });
