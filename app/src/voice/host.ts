import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import { CLIPS } from './clips.generated';
import type { Line } from './lines';
import { PLAYER_OPTIONS } from './sounds';

// The host's voice. A line with a recording (assets/voice/<key>.mp3) plays
// it; any other line, and any recording that fails to play, is read by the
// phone's Turkish voice (expo-speech, tr-TR), so the game works before the
// recordings exist.
export class Host {
  private token = 0;
  private player: AudioPlayer | null = null;
  private sub: { remove(): void } | null = null;
  private safety: ReturnType<typeof setTimeout> | null = null;
  speaking = false;
  /** Called with the words about to be said, and with null when the host is quiet again. */
  onSpeaking: (texts: string[] | null) => void = () => {};
  /** Every line said, `clip:<key>` or `tts:<text>`, for tests and logs. */
  readonly said: string[] = [];

  constructor(private clips: Record<string, number> = CLIPS) {}

  hasClip(key: string): boolean {
    return key in this.clips;
  }

  // Says the lines one after another; `done` runs when the last one ends,
  // not when the host is cut off by cancel() or a newer speak().
  speak(lines: Line[], done?: () => void) {
    this.halt();
    const my = ++this.token;
    let i = 0;
    this.speaking = true;
    this.onSpeaking(lines.map((l) => l.text));
    const next = () => {
      if (my !== this.token) return;
      if (i >= lines.length) {
        this.speaking = false;
        this.onSpeaking(null);
        done?.();
        return;
      }
      const line = lines[i++];
      const clip = line.key ? this.clips[line.key] : undefined;
      if (clip != null) this.playClip(my, line, clip, next);
      else this.tts(my, line.text, next);
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
  }

  private halt() {
    if (this.safety) clearTimeout(this.safety);
    this.safety = null;
    this.sub?.remove();
    this.sub = null;
    try { this.player?.pause(); } catch { /* not loaded */ }
    Speech.stop().catch(() => {});
  }

  private playClip(my: number, line: Line, clip: number, next: () => void) {
    let over = false;
    const end = (fallback: boolean) => {
      if (over || my !== this.token) return;
      over = true;
      if (this.safety) clearTimeout(this.safety);
      this.sub?.remove();
      this.sub = null;
      if (fallback) this.tts(my, line.text, next);
      else next();
    };
    try {
      if (!this.player) this.player = createAudioPlayer(clip, PLAYER_OPTIONS);
      else this.player.replace(clip);
      const p = this.player;
      this.sub = p.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish) end(false); });
      p.seekTo(0).catch(() => {});
      p.play();
      this.said.push(`clip:${line.key}`);
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

  private tts(my: number, text: string, next: () => void) {
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
    // iOS sometimes never reports the end; don't let the game hang on it.
    this.safety = setTimeout(end, 1500 + text.length * 110);
  }
}
