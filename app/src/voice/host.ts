import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import { CLIPS } from './clips.generated';
import type { Line } from './lines';
import { HOST_VOLUME, masterGain, onGainChange, PLAYER_OPTIONS, regain, retire, startAt, startedPlaying } from './sounds';

// The host's voice. A line with a recording (assets/voice/<key>.mp3) plays
// it; any other line, and any recording that fails to play, is read by the
// phone's Turkish voice (expo-speech, tr-TR), so the game works before the
// recordings exist.
export class Host {
  private token = 0;
  private player: AudioPlayer | null = null;
  private sub: { remove(): void } | null = null;
  private safety: ReturnType<typeof setTimeout> | null = null;
  private onCut: (() => void) | null = null;
  speaking = false;
  /** Called with the words about to be said, and with null when the host is quiet again. */
  onSpeaking: (texts: string[] | null) => void = () => {};
  /** Every line said, `clip:<key>` or `tts:<text>`, for tests and logs. */
  readonly said: string[] = [];

  constructor(private clips: Record<string, number> = CLIPS) {
    onGainChange(() => regain(this.player, HOST_VOLUME));
  }

  /** The host's clip volume (1 = full): HOST_VOLUME under the Ses gain. */
  get volume(): number {
    return this.player?.volume ?? HOST_VOLUME * masterGain();
  }

  /**
   * The player is let go unless a line is playing: the next clip gets a new
   * one, made on the audio session as it is now. Called by settleAudio (engine.ts).
   */
  renew() {
    if (this.speaking || !this.player) return;
    retire(this.player);  // removed once the next player has started (see retire)
    this.player = null;
  }

  hasClip(key: string): boolean {
    return key in this.clips;
  }

  // Says the lines one after another; `done` runs when the last one ends,
  // not when the host is cut off by cancel() or a newer speak(): `cut` runs then.
  // `starts` runs with a line's index the moment that line starts sounding
  // (its clip's play(), or the phone voice when it reads the line instead).
  speak(lines: Line[], done?: () => void, cut?: () => void, starts?: (i: number) => void) {
    this.halt();
    this.cutOff();
    const my = ++this.token;
    this.onCut = cut ?? null;
    let i = 0;
    this.speaking = true;
    this.onSpeaking(lines.map((l) => l.text));
    const next = () => {
      if (my !== this.token) return;
      if (i >= lines.length) {
        this.onCut = null;
        this.speaking = false;
        this.onSpeaking(null);
        done?.();
        return;
      }
      const at = i;
      const line = lines[i++];
      let begun = false;
      const begin = () => {
        if (begun || my !== this.token) return;
        begun = true;
        starts?.(at);
      };
      const clip = line.key ? this.clips[line.key] : undefined;
      if (clip != null) this.playClip(my, line, clip, next, begin);
      else this.tts(my, line.text, next, begin);
    };
    next();
  }

  cancel() {
    this.token++;
    this.halt();
    if (this.speaking) {
      this.speaking = false;
      this.onSpeaking(null);
    }
    this.cutOff();
  }

  private cutOff() {
    const cut = this.onCut;
    this.onCut = null;
    cut?.();
  }

  private halt() {
    if (this.safety) clearTimeout(this.safety);
    this.safety = null;
    this.sub?.remove();
    this.sub = null;
    try { this.player?.pause(); } catch { /* not loaded */ }
    Speech.stop().catch(() => {});
  }

  private playClip(my: number, line: Line, clip: number, next: () => void, begin: () => void) {
    let over = false;
    const end = (fallback: boolean) => {
      if (over || my !== this.token) return;
      over = true;
      if (this.safety) clearTimeout(this.safety);
      this.sub?.remove();
      this.sub = null;
      if (fallback) this.tts(my, line.text, next, begin);
      else next();
    };
    try {
      if (!this.player) this.player = createAudioPlayer(clip, PLAYER_OPTIONS);
      else this.player.replace(clip);
      const p = this.player;
      // Always HOST_VOLUME under the Ses gain: nothing else in the app may lower the host (the bed and cues sit under it).
      startAt(p, HOST_VOLUME);
      this.sub = p.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish) end(false); });
      p.seekTo(0).catch(() => {});
      p.play();
      startedPlaying();
      this.said.push(`clip:${line.key}`);
      begin();
      // A clip that never loads is read aloud instead; one that never reports its end must not hang the game.
      this.safety = setTimeout(() => end(!p.isLoaded), 4000);
      this.watchLength(p, () => over || my !== this.token, () => end(false));
    } catch {
      end(true);
    }
  }

  // Once the clip's length is known, end it a little after that at the latest.
  private watchLength(p: AudioPlayer, gone: () => boolean, end: () => void) {
    const poll = () => {
      if (gone()) return;
      if (p.isLoaded && p.duration > 0) {
        if (this.safety) clearTimeout(this.safety);
        this.safety = setTimeout(end, Math.max(0, p.duration - p.currentTime) * 1000 + 1500);
      } else {
        setTimeout(poll, 250);
      }
    };
    setTimeout(poll, 250);
  }

  private tts(my: number, text: string, next: () => void, begin: () => void) {
    let over = false;
    const end = () => {
      if (over || my !== this.token) return;
      over = true;
      if (this.safety) clearTimeout(this.safety);
      next();
    };
    this.said.push(`tts:${text}`);
    // On the app's audio session, so the silent switch does not mute it either.
    Speech.speak(text, { language: 'tr-TR', rate: 1.0, useApplicationAudioSession: true, onDone: end, onError: end });
    begin();
    // iOS sometimes never reports the end; don't let the game hang on it.
    this.safety = setTimeout(end, 1500 + text.length * 110);
  }
}
