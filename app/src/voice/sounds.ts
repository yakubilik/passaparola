import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

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

export const BG_VOLUME = 0.17;
export const BG_DUCKED = 0.06;

export class Sounds {
  private players: Partial<Record<keyof typeof FILES, AudioPlayer>> = {};
  private bgOn = false;
  private ducked = false;
  /** Every cue played, for tests and logs. */
  readonly played: string[] = [];

  private get(name: keyof typeof FILES): AudioPlayer | null {
    try {
      return (this.players[name] ??= createAudioPlayer(FILES[name]));
    } catch {
      return null;
    }
  }

  play(cue: Cue) {
    const p = this.get(cue);
    this.played.push(cue);
    if (!p) return;
    p.seekTo(0).catch(() => {});
    p.play();
  }

  startBg() {
    const p = this.get('bg');
    if (!p) return;
    if (!this.bgOn) this.played.push('bg');
    this.bgOn = true;
    p.loop = true;
    p.volume = this.ducked ? BG_DUCKED : BG_VOLUME;
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

  get bgPlaying() {
    return this.bgOn;
  }

  get bgVolume() {
    return this.players.bg?.volume ?? 0;
  }

  // Lower the bed while the host speaks.
  duck(on: boolean) {
    this.ducked = on;
    const p = this.players.bg;
    if (p) p.volume = on ? BG_DUCKED : BG_VOLUME;
  }
}
