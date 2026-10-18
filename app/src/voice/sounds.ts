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
/** While the host speaks the bed and the cues drop to this share of their level. */
export const DUCK = 0.3;
export const BG_DUCKED = BG_VOLUME * DUCK;

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
  /** Every cue played, for tests and logs. */
  readonly played: string[] = [];

  private get(name: keyof typeof FILES): AudioPlayer | null {
    try {
      return (this.players[name] ??= createAudioPlayer(FILES[name], PLAYER_OPTIONS));
    } catch {
      return null;
    }
  }

  play(cue: Cue) {
    const p = this.get(cue);
    this.played.push(cue);
    if (!p) return;
    p.volume = this.ducked ? DUCK : 1;
    p.seekTo(0).catch(() => {});
    p.play();
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

  // While the host speaks everything else is lowered: the bed and any cue still sounding.
  duck(on: boolean) {
    this.ducked = on;
    for (const [name, p] of Object.entries(this.players)) {
      if (!p) continue;
      p.volume = name === 'bg' ? this.bedVolume : on ? DUCK : 1;
    }
  }
}
