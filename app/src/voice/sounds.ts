import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { DEFAULT_MUSIC_LEVEL, MUSIC_LEVELS } from '../store/settings';

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
/** The first sound after the round's audio session is set up rises from silence over this long, so the switch never jumps or clicks. */
export const FADE_IN_MS = 150;
const FADE_STEPS = 6;

let fadeNext = false;
/** The next sound to start (a cue or a host clip) fades in; prepareAudio calls it once the session is in place. */
export function fadeInNext() {
  fadeNext = true;
}

// Starts a player at `volume`, or from silence up to it when a fade is due.
const fades = new WeakMap<AudioPlayer, ReturnType<typeof setTimeout>[]>();
export function startAt(p: AudioPlayer, volume: number) {
  fades.get(p)?.forEach(clearTimeout);  // a fade still running on this player gives way
  fades.delete(p);
  if (!fadeNext) {
    p.volume = volume;
    return;
  }
  fadeNext = false;
  p.volume = 0;
  const timers = Array.from({ length: FADE_STEPS }, (_, i) =>
    setTimeout(() => { p.volume = (volume * (i + 1)) / FADE_STEPS; }, (FADE_IN_MS * (i + 1)) / FADE_STEPS));
  fades.set(p, timers);
}

/** The host starts a line this long after an answer's cue, so the two never overlap. */
export const CUE_LEAD_MS = 250;
const SEEK_MAX_MS = 150;

// keepAudioSessionActive: expo-audio otherwise deactivates the iOS audio
// session ~100 ms after any clip ends or pauses while no other player is
// playing, which pulls the session out from under the open microphone (the
// recognizer stops or comes back without echo cancellation).
export const PLAYER_OPTIONS = { keepAudioSessionActive: true } as const;

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
      this.started.push({ cue, volume: CUE_VOLUME, fromStart: !p.currentTime });
      startAt(p, CUE_VOLUME);
      p.play();
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

  get bgPlaying() {
    return this.bgOn && this.musicOn;
  }

  get bgVolume() {
    return this.bgPlaying ? this.players.bg?.volume ?? 0 : 0;
  }

  private get bedVolume() {
    return musicVolume(this.level) * (this.ducked ? DUCK : 1);
  }

  // While the host speaks the bed is lowered; the cues stay at CUE_VOLUME.
  duck(on: boolean) {
    this.ducked = on;
    const p = this.players.bg;
    if (p) p.volume = this.bedVolume;
  }
}
