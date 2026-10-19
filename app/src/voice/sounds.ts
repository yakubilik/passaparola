import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { DEFAULT_MUSIC_LEVEL, DEFAULT_VOLUME, MUSIC_LEVELS } from '../store/settings';

// Sound cues (assets/sounds, the web game's clips): the theme when a game
// opens, a bed looped under the round and lowered while the host speaks,
// and a cue for each answer and for the last ten seconds.
const FILES = {
  theme: require('../../assets/sounds/theme.mp3'),
  bg: require('../../assets/sounds/bg.mp3'),
  correct: require('../../assets/sounds/correct.mp3'),
  wrong: require('../../assets/sounds/wrong.mp3'),
  pas: require('../../assets/sounds/pas.mp3'),
  warn: require('../../assets/sounds/warn.mp3'),
} as const;

export type Cue = Exclude<keyof typeof FILES, 'bg'>;

// The bed is only a faint background: the mic is open the whole round and
// everything the speaker plays is something it may hear. One step of the
// Müzik control in Ayarlar; the default (5 of 10) is a quarter of the 0.17
// it used to be, the loudest half of it.
export const BG_STEP = 0.0085;
export const musicVolume = (level: number) => Math.min(MUSIC_LEVELS, Math.max(1, Math.round(level))) * BG_STEP;
export const BG_VOLUME = musicVolume(DEFAULT_MUSIC_LEVEL);
export const BG_MAX = musicVolume(MUSIC_LEVELS);
/** While the host speaks the bed drops to this share of its level (the cues never do). */
export const DUCK = 0.3;
export const BG_DUCKED = BG_VOLUME * DUCK;
/**
 * Player volumes. The files carry the balance (tools/normalize-loudness.py,
 * measured in assets/loudness.json): the host at -18 LUFS, every cue and the
 * theme 6 dB under it, the bed far below at a few percent of its file. At these
 * volumes no cue is ever louder than the host.
 */
export const HOST_VOLUME = 1;
export const CUE_VOLUME = 1;

// The Ses control in Ayarlar: one gain over everything the game plays (the
// host, the cues and the bed), under the phone's own volume. A second safety
// next to the volume buttons; 70% unless the player changed it.
export const DEFAULT_GAIN = DEFAULT_VOLUME / 100;
let gain = DEFAULT_GAIN;
const gainListeners = new Set<() => void>();
/** The Ses gain, 0 to 1. */
export function masterGain(): number {
  return gain;
}
/** From Ayarlar (0 to 100): every player follows at once, the one sounding too. */
export function setMasterVolume(percent: number) {
  const g = Math.min(1, Math.max(0, percent / 100));
  if (g === gain) return;
  gain = g;
  gainListeners.forEach((f) => f());
}
export function onGainChange(f: () => void): () => void {
  gainListeners.add(f);
  return () => gainListeners.delete(f);
}

/** The first sound after the round's audio session is set up rises from silence over this long, so the switch never jumps or clicks. */
export const FADE_IN_MS = 150;
const FADE_STEPS = 6;

let fadeNext = false;
/** The next sound to start (a cue or a host clip) fades in; prepareAudio calls it once the session is in place. */
export function fadeInNext() {
  fadeNext = true;
}

// Starts a player at `volume` times the Ses gain, or from silence up to it
// when a fade is due. Returns the volume it ends at.
const fades = new WeakMap<AudioPlayer, ReturnType<typeof setTimeout>[]>();
export function startAt(p: AudioPlayer, volume: number): number {
  fades.get(p)?.forEach(clearTimeout);  // a fade still running on this player gives way
  fades.delete(p);
  const v = volume * gain;
  if (!fadeNext) {
    p.volume = v;
    return v;
  }
  fadeNext = false;
  p.volume = 0;
  const timers = Array.from({ length: FADE_STEPS }, (_, i) =>
    setTimeout(() => { p.volume = (volume * gain * (i + 1)) / FADE_STEPS; }, (FADE_IN_MS * (i + 1)) / FADE_STEPS));
  fades.set(p, timers);
  return v;
}

// A player takes a new gain at once (a fade still running on it gives way).
export function regain(p: AudioPlayer | null | undefined, volume: number) {
  if (!p) return;
  fades.get(p)?.forEach(clearTimeout);
  fades.delete(p);
  p.volume = volume * gain;
}

/** The host starts a line this long after an answer's cue, so the two never overlap. */
export const CUE_LEAD_MS = 250;
const SEEK_MAX_MS = 150;

// keepAudioSessionActive: expo-audio otherwise deactivates the iOS audio
// session ~100 ms after any clip ends or pauses while no other player is
// playing, which pulls the session out from under the open microphone (the
// recognizer stops or comes back without echo cancellation).
export const PLAYER_OPTIONS = { keepAudioSessionActive: true } as const;

// Players let go by renew() (Sounds, Host) are removed only once a newer
// player has started. expo-audio counts every player that played with
// keepAudioSessionActive as keeping the session active; remove() takes it off
// that list and, when it was the last one, deactivates the session 100 ms
// later if nothing is playing (AudioModule.swift: remove ->
// unregisterAudioSessionActivityKeeper -> deactivateSession ->
// AVAudioSession.setActive(false)). Every round's start let go of all of them
// at once, so the session the first round set up could go inactive under the
// next round's open mic. After a play() the new player is already on that
// list (both calls are queued in order on expo-audio's session queue), so the
// old ones can go without the session ever being left without one.
const retired: AudioPlayer[] = [];
export function retire(p: AudioPlayer) {
  retired.push(p);
}
/** A player has just been started: the retired ones are removed now. */
export function startedPlaying() {
  for (const p of retired.splice(0)) {
    try { p.remove(); } catch { /* gone */ }
  }
}
/** Players let go but not removed yet, for tests. */
export function retiredCount(): number {
  return retired.length;
}

export class Sounds {
  private players: Partial<Record<keyof typeof FILES, AudioPlayer>> = {};
  private bgOn = false;
  private ducked = false;
  private musicOn = true;
  private level = DEFAULT_MUSIC_LEVEL;
  private gen = 0;  // stopAll() bumps it: a cue still waiting for its seek stays quiet
  /** Every cue played, for tests and logs. */
  readonly played: string[] = [];
  /** Every cue as it really started: its volume and whether from its beginning. */
  readonly started: { cue: Cue; volume: number; fromStart: boolean }[] = [];

  constructor() {
    onGainChange(() => {
      for (const [name, p] of Object.entries(this.players)) {
        if (name === 'bg') { if (p) p.volume = this.bedVolume; }
        else regain(p, CUE_VOLUME);
      }
    });
  }

  /**
   * Players made before the round's audio session settled are let go (those
   * still sounding are kept): the next cue gets a player made on the session
   * as it now is. Called by settleAudio (engine.ts).
   */
  renew() {
    for (const [name, p] of Object.entries(this.players) as [keyof typeof FILES, AudioPlayer][]) {
      if (p.playing) continue;
      retire(p);
      delete this.players[name];
    }
  }

  private get(name: keyof typeof FILES): AudioPlayer | null {
    try {
      return (this.players[name] ??= createAudioPlayer(FILES[name], PLAYER_OPTIONS));
    } catch {
      return null;
    }
  }

  // Always at CUE_VOLUME, whoever is speaking (the host waits for the cue
  // instead, see CUE_LEAD_MS). A replayed cue is rewound first and only then
  // started: on iOS a play() racing the seek can be skipped.
  play(cue: Cue) {
    const p = this.get(cue);
    this.played.push(cue);
    if (!p) return;
    const gen = this.gen;
    const start = () => {
      if (gen !== this.gen) return;
      const fromStart = !p.currentTime;
      this.started.push({ cue, volume: startAt(p, CUE_VOLUME), fromStart });
      p.play();
      startedPlaying();
    };
    if (!p.currentTime) { start(); return; }
    let go = true;
    const once = () => { if (go) { go = false; start(); } };
    p.seekTo(0).then(once, once);
    setTimeout(once, SEEK_MAX_MS);  // a seek that never answers must not swallow the cue
  }

  // The round wants the bed; it plays only with the music on in Ayarlar.
  startBg() {
    const was = this.bgOn;
    this.bgOn = true;
    if (!this.musicOn) return;
    const p = this.get('bg');
    if (!p) return;
    if (!was) this.played.push('bg');
    p.loop = true;
    p.volume = this.bedVolume;
    p.play();
    startedPlaying();
  }

  stopBg() {
    this.bgOn = false;
    try { this.players.bg?.pause(); } catch { /* not loaded */ }
  }

  // Silence: the bed and any cue still sounding (the app went to the background).
  stopAll() {
    this.gen++;
    this.stopBg();
    for (const p of Object.values(this.players)) {
      try { p?.pause(); } catch { /* not loaded */ }
    }
  }

  // A cue (the theme) still sounding stops: the mic is about to start and
  // nothing may play across that (see settleAudio in engine.ts).
  hushCues() {
    for (const [name, p] of Object.entries(this.players)) {
      if (name === 'bg' || !p?.playing) continue;
      try { p.pause(); } catch { /* not loaded */ }
    }
  }

  // From Ayarlar: the bed on or off and how loud (1 to MUSIC_LEVELS).
  setMusic(on: boolean, level: number) {
    this.level = level;
    if (on === this.musicOn) {
      const p = this.players.bg;
      if (p) p.volume = this.bedVolume;
      return;
    }
    this.musicOn = on;
    if (!on) {
      try { this.players.bg?.pause(); } catch { /* not loaded */ }
    } else if (this.bgOn) {
      this.bgOn = false;
      this.startBg();
    }
  }

  /** Each player's volume and whether it plays, for the self-test log. */
  playerStates(): { name: string; volume: number; playing: boolean }[] {
    return Object.entries(this.players).map(([name, p]) => ({ name, volume: p?.volume ?? 0, playing: !!p?.playing }));
  }

  /** A cue (or the theme) is sounding; the bed does not count. */
  get cuePlaying(): boolean {
    return Object.entries(this.players).some(([name, p]) => name !== 'bg' && !!p?.playing);
  }

  get bgPlaying() {
    return this.bgOn && this.musicOn;
  }

  get bgVolume() {
    return this.bgPlaying ? this.players.bg?.volume ?? 0 : 0;
  }

  private get bedVolume() {
    return musicVolume(this.level) * (this.ducked ? DUCK : 1) * gain;
  }

  // While the host speaks the bed is lowered; the cues stay at CUE_VOLUME.
  duck(on: boolean) {
    this.ducked = on;
    const p = this.players.bg;
    if (p) p.volume = this.bedVolume;
  }
}
