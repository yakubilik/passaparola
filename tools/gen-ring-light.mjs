#!/usr/bin/env node
// Draws the light behind the game's letter ring (design variant 1b,
// docs/design/reference/ring-light-rays.png) as two static PNGs, so the app
// shows it with a plain <Image> and no per-frame work:
//
//   app/assets/ring-rays.png  24 soft blue rays radiating from behind the ring
//   app/assets/ring-glow.png  the blue halo along the ring's inner edge
//
// Every length is in units of the ring radius R, as in the design's 1b
// (R = 165 px there): the rays image is 3.88 R across, the glow 2.38 R.
// Needs rsvg-convert (brew install librsvg):
//
//   node tools/gen-ring-light.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS = join(ROOT, 'app', 'assets');
const tmp = mkdtempSync(join(tmpdir(), 'ring-light-'));

function render(name, px, svg) {
  const src = join(tmp, name.replace('.png', '.svg'));
  writeFileSync(src, svg);
  execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '-o', join(ASSETS, name), src]);
  console.log(`${name} ${px}x${px}`);
}

// Rays: repeating-conic-gradient(rgba(90,140,255,.32) 0-4deg, clear 4-15deg)
// in a 1.94 R circle, masked by a radial gradient (clear up to 0.6 R, full at
// 0.82 R, 40 % at 1.31 R, clear from 1.86 R) and blurred a little.
{
  const S = 1000; // viewBox; the circle's radius 1.94 R = 500
  const c = S / 2;
  const R = 500 / 1.94;
  const far = Math.hypot(c, c); // CSS radial-gradient(circle) = farthest corner
  const stop = (r) => ((r * R) / far).toFixed(4);
  const wedges = [];
  for (let i = 0; i < 24; i++) {
    const a0 = ((i * 15 - 90) * Math.PI) / 180;
    const a1 = ((i * 15 + 4 - 90) * Math.PI) / 180;
    const p = (a) => `${(c + c * 1.5 * Math.cos(a)).toFixed(2)} ${(c + c * 1.5 * Math.sin(a)).toFixed(2)}`;
    wedges.push(`M${c} ${c}L${p(a0)}L${p(a1)}Z`);
  }
  render('ring-rays.png', 1024, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="m" cx="${c}" cy="${c}" r="${far}" gradientUnits="userSpaceOnUse">
      <stop offset="${stop(0.6)}" stop-color="#fff" stop-opacity="0"/>
      <stop offset="${stop(0.82)}" stop-color="#fff" stop-opacity="1"/>
      <stop offset="${stop(1.31)}" stop-color="#fff" stop-opacity="0.4"/>
      <stop offset="${stop(1.86)}" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}">
      <rect width="${S}" height="${S}" fill="url(#m)"/>
    </mask>
    <clipPath id="circle"><circle cx="${c}" cy="${c}" r="${c}"/></clipPath>
    <filter id="blur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${(2.5 * S) / 640}"/></filter>
  </defs>
  <g clip-path="url(#circle)" mask="url(#mask)">
    <path d="${wedges.join('')}" fill="rgb(90,140,255)" fill-opacity="0.32" filter="url(#blur)"/>
  </g>
</svg>`);
}

// Glow: radial-gradient(rgba(61,107,255,0) 0.61 R, rgba(110,160,255,.55) 0.76 R,
// rgba(61,107,255,0) 1.19 R) in a 1.19 R circle.
{
  const S = 1000;
  const c = S / 2;
  const R = 500 / 1.19;
  const far = Math.hypot(c, c);
  const stop = (r) => ((r * R) / far).toFixed(4);
  render('ring-glow.png', 512, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="g" cx="${c}" cy="${c}" r="${far}" gradientUnits="userSpaceOnUse">
      <stop offset="${stop(0.61)}" stop-color="rgb(61,107,255)" stop-opacity="0"/>
      <stop offset="${stop(0.76)}" stop-color="rgb(110,160,255)" stop-opacity="0.55"/>
      <stop offset="${stop(1.19)}" stop-color="rgb(61,107,255)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="${c}" cy="${c}" r="${c}" fill="url(#g)"/>
</svg>`);
}
