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

// Every cue gets a player of its own, made for it and removed when it reports
// its end or is stopped. A player is never rewound and replayed: on the device
// a seekTo(0) on a player that has played sometimes never completes, and the
// play() after it is then lost (the same failure as replace() in host.ts).
type Live = { cue: Cue; player: AudioPlayer; sub: { remove(): void } | null };

export class Sounds {
  private bg: AudioPlayer | null = null;
  private live = new Set<Live>();
  private bgOn = false;
  private ducked = false;
  private musicOn = true;
  private level = DEFAULT_MUSIC_LEVEL;
  /** Every cue played, for tests and logs. */
  readonly played: string[] = [];
  /** Every cue as it really started: its volume and whether from its beginning. */
  readonly started: { cue: Cue; volume: number; fromStart: boolean }[] = [];

  constructor() {
    onGainChange(() => {
      if (this.bg) this.bg.volume = this.bedVolume;
      for (const l of this.live) regain(l.player, CUE_VOLUME);
    });
  }

  /**
   * Players made before the round's audio session settled are let go (those
   * still sounding are kept): the next sound gets a player made on the
   * session as it now is. Called by settleAudio (engine.ts).
   */
  renew() {
    if (this.bg && !this.bg.playing) {
      retire(this.bg);
      this.bg = null;
    }
    for (const l of [...this.live]) if (!l.player.playing) this.end(l);
  }

  // A cue's player is done (it ended or was stopped). It is removed at once
  // while another player here still keeps the audio session active (the bed,
  // another cue); otherwise it is retired, i.e. removed once a newer player
  // has started, so expo-audio is never left without one (see retire).
  private end(l: Live) {
    if (!this.live.delete(l)) return;
    l.sub?.remove();
    try { l.player.pause(); } catch { /* not loaded */ }
    if (this.bg || this.live.size) {
      try { l.player.remove(); } catch { /* gone */ }
    } else {
      retire(l.player);
    }
  }

  // Always at CUE_VOLUME, whoever is speaking (the host waits for the cue
  // instead, see CUE_LEAD_MS), on a new player started at once. `loop`: it
  // plays over and over until stop() (or stopAll/hushCues).
  play(cue: Cue, loop = false) {
    this.played.push(cue);
    let p: AudioPlayer;
    try {
      p = createAudioPlayer(FILES[cue], PLAYER_OPTIONS);
    } catch {
      return;
    }
    const l: Live = { cue, player: p, sub: null };
    this.live.add(l);
    p.loop = loop;
    if (!loop) l.sub = p.addListener('playbackStatusUpdate', (st) => { if (st.didJustFinish) this.end(l); });
    this.started.push({ cue, volume: startAt(p, CUE_VOLUME), fromStart: !p.currentTime });
    p.play();
    startedPlaying();
  }

  /** A cue (a looping one included) stops now and its players go. */
  stop(cue: Cue) {
    for (const l of [...this.live]) if (l.cue === cue) this.end(l);
  }

  /** The bed's player, or the newest player of a cue not yet ended or stopped, for tests. */
  player(name: keyof typeof FILES): AudioPlayer | undefined {
    if (name === 'bg') return this.bg ?? undefined;
    return [...this.live].reverse().find((l) => l.cue === name)?.player;
  }

  /** Players of cues not yet ended or stopped, for tests. */
  get livePlayers(): AudioPlayer[] {
    return [...this.live].map((l) => l.player);
  }

  // The round wants the bed; it plays only with the music on in Ayarlar.
  startBg() {
    const was = this.bgOn;
    this.bgOn = true;
    if (!this.musicOn) return;
    let p = this.bg;
    if (!p) {
      try {
        p = this.bg = createAudioPlayer(FILES.bg, PLAYER_OPTIONS);
      } catch {
        return;
      }
    }
    if (!was) this.played.push('bg');
    p.loop = true;
    p.volume = this.bedVolume;
    p.play();
    startedPlaying();
  }

  stopBg() {
    this.bgOn = false;
    try { this.bg?.pause(); } catch { /* not loaded */ }
  }

  // Silence: the bed and any cue still sounding (the app went to the background).
  stopAll() {
    this.stopBg();
    for (const l of [...this.live]) this.end(l);
  }

  // A cue (the theme) still sounding stops: the mic is about to start and
  // nothing may play across that (see settleAudio in engine.ts).
  hushCues() {
    for (const l of [...this.live]) if (l.player.playing) this.end(l);
  }

  // From Ayarlar: the bed on or off and how loud (1 to MUSIC_LEVELS).
  setMusic(on: boolean, level: number) {
    this.level = level;
    if (on === this.musicOn) {
      if (this.bg) this.bg.volume = this.bedVolume;
      return;
    }
    this.musicOn = on;
    if (!on) {
      try { this.bg?.pause(); } catch { /* not loaded */ }
    } else if (this.bgOn) {
      this.bgOn = false;
      this.startBg();
    }
  }

  /** Each player's volume and whether it plays, for the self-test log. */
  playerStates(): { name: string; volume: number; playing: boolean }[] {
    const all = [...(this.bg ? [{ name: 'bg', p: this.bg }] : []), ...[...this.live].map((l) => ({ name: l.cue, p: l.player }))];
    return all.map(({ name, p }) => ({ name, volume: p.volume, playing: p.playing }));
  }

  /** A cue (or the theme) is sounding; the bed does not count. The mic listener's busy check. */
  get cuePlaying(): boolean {
    for (const l of this.live) if (l.player.playing) return true;
    return false;
  }

  get bgPlaying() {
    return this.bgOn && this.musicOn;
  }

  get bgVolume() {
    return this.bgPlaying ? this.bg?.volume ?? 0 : 0;
  }

  private get bedVolume() {
    return musicVolume(this.level) * (this.ducked ? DUCK : 1) * gain;
  }

  // While the host speaks the bed is lowered; the cues stay at CUE_VOLUME.
  duck(on: boolean) {
    this.ducked = on;
    if (this.bg) this.bg.volume = this.bedVolume;
  }
}
