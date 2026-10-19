import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import { CLIPS } from './clips.generated';
import type { Line } from './lines';
import { HOST_VOLUME, masterGain, onGainChange, PLAYER_OPTIONS, regain, retire, startAt, startedPlaying } from './sounds';

/** How long the phone voice may take to start a line before it is asked again (#362). */
export const TTS_START_MS = 1500;
/** Times a line is asked of the phone voice before the host gives up on it. */
export const TTS_ATTEMPTS = 3;

/**
 * What the phone voice did with a line (#362), for the self-test log, the
 * speech-state diagnostic and tests: asked (speak() called), started (iOS
 * reported the utterance started), done, stopped (cancelled without our
 * asking), error, nostart (no start within TTS_START_MS), silent (every
 * attempt failed: the clue is shown and the host moves on).
 */
export type SpeechEvent = { key?: string; text: string; state: 'asked' | 'started' | 'done' | 'stopped' | 'error' | 'nostart' | 'silent'; attempt: number; t: number };

// The host's voice. A line with a recording (assets/voice/<key>.mp3) plays
// it; any other line, and any recording that fails to play, is read by the
// phone's Turkish voice (expo-speech, tr-TR), so the game works before the
// recordings exist.
//
// The phone voice (#362): a line counts as started when iOS says it started
// (onStart), and only then does its clue appear. expo-speech is stopped only
// when one of our utterances may still be sounding: a Speech.stop() sent on
// every new line raced the next Speech.speak() on the synthesizer. An
// utterance iOS cancels by itself, or never starts, is asked for again, the
// second time on the synthesizer's own audio session; if every attempt fails
// the clue is shown anyway, and the failure is in speechLog.
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
  /** What the phone voice did, line by line (see SpeechEvent); the last 50. */
  readonly speechLog: SpeechEvent[] = [];
  /** Called with every new SpeechEvent. */
  onSpeech: (e: SpeechEvent) => void = () => {};
  private ttsLive = false;  // one of our utterances may be sounding: halt() must stop it

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

  /** The clip player's volume and whether it plays, for the self-test log. */
  playerState(): { name: string; volume: number; playing: boolean } | null {
    return this.player ? { name: 'host', volume: this.player.volume, playing: this.player.playing } : null;
  }

  private withheld: (key: string) => boolean = () => false;

  hasClip(key: string): boolean {
    return key in this.clips && !this.withheld(key);
  }

  /** Lines whose key matches are read by the phone voice although they have a clip (the speech self-test). */
  withholdClips(match: (key: string) => boolean) {
    this.withheld = match;
  }

  // Says the lines one after another; `done` runs when the last one ends,
  // not when the host is cut off by cancel() or a newer speak(): `cut` runs then.
  // `starts` runs with a line's index the moment that line starts sounding
  // (its clip's play(), or the phone voice when it reads the line instead).
  speak(lines: Line[], done?: () => void, cut?: () => void, starts?: (i: number) => void) {
    // The token first: whatever the old lines report while being stopped is theirs.
    const my = ++this.token;
    this.halt();
    this.cutOff();
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
      const clip = line.key && this.hasClip(line.key) ? this.clips[line.key] : undefined;
      if (clip != null) this.playClip(my, line, clip, next, begin);
      else this.tts(my, line, next, begin);
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
    if (this.ttsLive) {
      this.ttsLive = false;
      Speech.stop().catch(() => {});
    }
  }

  private playClip(my: number, line: Line, clip: number, next: () => void, begin: () => void) {
    let over = false;
    const end = (fallback: boolean) => {
      if (over || my !== this.token) return;
      over = true;
      if (this.safety) clearTimeout(this.safety);
      this.sub?.remove();
      this.sub = null;
      if (fallback) this.tts(my, line, next, begin);
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

  private note(line: Line, state: SpeechEvent['state'], attempt: number) {
    const e: SpeechEvent = { key: line.key, text: line.text, state, attempt, t: Date.now() };
    this.speechLog.push(e);
    if (this.speechLog.length > 50) this.speechLog.shift();
    this.onSpeech(e);
  }

  private tts(my: number, line: Line, next: () => void, begin: () => void) {
    const text = line.text;
    let over = false;
    let attempts = 0;
    let attempt = 0;  // the attempt whose events count; 0 while switching to the next
    const end = () => {
      if (over || my !== this.token) return;
      over = true;
      this.ttsLive = false;
      if (this.safety) clearTimeout(this.safety);
      next();
    };
    this.said.push(`tts:${text}`);
    const ask = () => {
      const mine = ++attempts;
      attempt = mine;
      let started = false;
      const live = () => !over && my === this.token && mine === attempt;
      const again = (why: 'stopped' | 'error' | 'nostart') => {
        if (!live()) return;
        this.note(line, why, mine);
        if (mine < TTS_ATTEMPTS) {
          attempt = 0;
          // Clear whatever the synthesizer holds (an utterance that never started blocks the queue).
          if (why === 'nostart') Speech.stop().catch(() => {});
          ask();
          return;
        }
        this.note(line, 'silent', mine);
        begin();
        if (this.safety) clearTimeout(this.safety);
        this.safety = setTimeout(end, 1500 + text.length * 60);
      };
      this.ttsLive = true;
      // The first attempt on the app's audio session, so the silent switch does
      // not mute it either; a retry on the synthesizer's own session.
      Speech.speak(text, {
        language: 'tr-TR',
        rate: 1.0,
        useApplicationAudioSession: mine === 1,
        onStart: () => {
          if (!live() || started) return;
          started = true;
          this.note(line, 'started', mine);
          begin();
          // iOS sometimes never reports the end; don't let the game hang on it.
          if (this.safety) clearTimeout(this.safety);
          this.safety = setTimeout(end, 1500 + text.length * 110);
        },
        onDone: () => {
          if (!live()) return;
          this.note(line, 'done', mine);
          end();
        },
        // Not stopped by us (halt() and a newer line move the token first): iOS dropped the utterance.
        onStopped: () => { if (!started) again('stopped'); else if (live()) { this.note(line, 'stopped', mine); end(); } },
        onError: () => { if (!started) again('error'); else if (live()) { this.note(line, 'error', mine); end(); } },
      });
      this.note(line, 'asked', mine);
      if (this.safety) clearTimeout(this.safety);
      this.safety = setTimeout(() => { if (!started) again('nostart'); }, TTS_START_MS);
    };
    ask();
  }
}
