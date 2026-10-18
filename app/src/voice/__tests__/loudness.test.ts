import { CLIPS } from '../clips.generated';
import { BG_MAX, CUE_VOLUME, HOST_VOLUME } from '../sounds';

// The files' loudness, as measured by tools/normalize-loudness.py (EBU R128
// integrated loudness, ffmpeg loudnorm) and written to assets/loudness.json.
// Run the tool again after adding or replacing any clip.
const report: {
  targets: { voice: number; cue: number; theme: number; bed: number; maxTruePeak: number };
  sounds: Record<string, { lufs: number; truePeak: number }>;
  voice: Record<string, { lufs: number; truePeak: number }>;
} = require('../../../assets/loudness.json');

const db = (volume: number) => 20 * Math.log10(volume);
const CUES = ['correct', 'wrong', 'pas', 'warn'];

test('every host clip in the app is measured and sits at the voice target', () => {
  for (const key of Object.keys(CLIPS)) {
    expect(report.voice[key]).toBeDefined();
    expect(Math.abs(report.voice[key].lufs - report.targets.voice)).toBeLessThanOrEqual(1);
    expect(report.voice[key].truePeak).toBeLessThanOrEqual(report.targets.maxTruePeak + 0.5);
  }
  expect(report.targets.voice).toBe(-18);
});

test('cues and the theme are about 6 dB under the voice, the bed far below', () => {
  for (const cue of CUES) expect(Math.abs(report.sounds[cue].lufs - report.targets.cue)).toBeLessThanOrEqual(1);
  expect(Math.abs(report.sounds.theme.lufs - report.targets.theme)).toBeLessThanOrEqual(1);
  expect(Math.abs(report.sounds.bg.lufs - report.targets.bed)).toBeLessThanOrEqual(1);
  expect(report.targets.voice - report.targets.cue).toBe(6);
  expect(report.targets.voice - report.targets.theme).toBe(6);
  // The bed at its loudest Müzik step is still 20 dB and more under the host.
  expect(report.sounds.bg.lufs + db(BG_MAX)).toBeLessThan(report.targets.voice - 20);
});

test('at the player volumes no cue (nor the theme) is ever louder than the quietest host clip', () => {
  const quietestHost = Math.min(...Object.values(report.voice).map((v) => v.lufs)) + db(HOST_VOLUME);
  for (const name of [...CUES, 'theme']) expect(report.sounds[name].lufs + db(CUE_VOLUME)).toBeLessThan(quietestHost - 3);
});
