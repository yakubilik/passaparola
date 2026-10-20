import { act } from '@testing-library/react-native';

import { audio, CLIP_MS, type FakePlayer } from '../../test-utils/fakeAudio';
import { listener, sounds } from '../engine';
import { CUE_VOLUME, DEFAULT_GAIN, retiredCount, Sounds } from '../sounds';

// Every cue plays on a player made for it and removed once it has ended or
// been stopped (#415). Rewinding a player that has played (seekTo) sometimes
// never completes on the device and the cue after it is lost.

// Node's fs, typed here: the app has no Node type definitions.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{ readFileSync: (file: string, enc: 'utf8') => string }>('fs');

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const made = (from: number) => audio.players.slice(from) as FakePlayer[];

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  sounds.stopAll();
  jest.useRealTimers();
});

test('sounds.ts never rewinds a player', () => {
  const src = readFileSync(`${__dirname}/../sounds.ts`, 'utf8');
  expect(src).not.toMatch(/\.seekTo\s*\(/);
});

test('three plays of the same cue make three players, each played once and removed after it reports its end', async () => {
  const s = new Sounds();
  s.startBg();  // the bed keeps the session, so an ended cue goes at once
  const from = audio.players.length;
  const plays = audio.plays;
  s.play('pas');
  await wait(400);
  s.play('pas');
  await wait(400);
  s.play('pas');
  const ps = made(from);
  expect(ps).toHaveLength(3);
  expect(audio.plays - plays).toBe(3);
  expect(ps.every((p) => p.playing && !p.removed)).toBe(true);
  expect(s.livePlayers).toHaveLength(3);
  // Each from its beginning at the cue volume.
  expect(s.started.slice(-3)).toEqual(Array(3).fill({ cue: 'pas', volume: CUE_VOLUME * DEFAULT_GAIN, fromStart: true }));
  // The first ends (didJustFinish) and goes; the others still sound.
  await wait(CLIP_MS - 800);
  expect(ps.map((p) => p.removed)).toEqual([true, false, false]);
  await wait(400);
  expect(ps.map((p) => p.removed)).toEqual([true, true, false]);
  await wait(400);
  expect(ps.map((p) => p.removed)).toEqual([true, true, true]);
  expect(s.livePlayers).toHaveLength(0);
  // None was ever played twice.
  for (let i = 0; i < 3; i++) expect(audio.log.filter((e) => e.e === `play#${from + i}`)).toHaveLength(1);
  s.stopAll();
});

test('a cue played on a loop keeps playing until stopped, then its player is removed', async () => {
  const s = new Sounds();
  s.startBg();
  const from = audio.players.length;
  s.play('warn', true);
  const [p] = made(from);
  expect(p.loop).toBe(true);
  await wait(CLIP_MS * 5);
  expect(p.playing).toBe(true);
  expect(p.removed).toBe(false);
  expect(s.cuePlaying).toBe(true);
  s.stop('warn');
  expect(p.playing).toBe(false);
  expect(p.removed).toBe(true);
  expect(s.livePlayers).toHaveLength(0);
  expect(s.cuePlaying).toBe(false);
  s.stopAll();
});

test('with nothing else keeping the audio session, an ended cue is removed once the next sound starts (never left without a keeper)', async () => {
  const s = new Sounds();
  audio.session.active = true;
  const from = audio.players.length;
  const retired = retiredCount();
  s.play('correct');
  await wait(CLIP_MS);
  const [p] = made(from);
  expect(s.livePlayers).toHaveLength(0);
  expect(p.removed).toBe(false);
  expect(retiredCount()).toBe(retired + 1);
  await wait(500);
  expect(audio.session.active).toBe(true);
  s.play('wrong');
  expect(p.removed).toBe(true);
  expect(retiredCount()).toBe(0);
  s.stopAll();
});

test("the mic listener is busy only while a cue's player really plays", async () => {
  expect(listener.busy()).toBe(false);
  sounds.play('correct');
  expect(listener.busy()).toBe(true);
  sounds.play('correct');
  await wait(CLIP_MS - 1);
  expect(listener.busy()).toBe(true);
  await wait(1);
  expect(listener.busy()).toBe(false);
  // A cue that iOS swallows (never plays, never ends) does not hold the mic either.
  audio.stalls.any = 1;
  sounds.play('pas');
  expect(listener.busy()).toBe(false);
  // ...and it is let go at the next round start.
  sounds.renew();
  expect(sounds.livePlayers).toHaveLength(0);
});
