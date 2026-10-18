import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { judgeSpoken } from '../game/normalize';
import { current, type Round } from '../game/round';
import type { Answered, useRound } from '../game/useRound';
import { host, listener, prepareAudio, sounds } from './engine';
import { answerLine, clueLine, host as hostLine, type HostKey, type Line } from './lines';
import type { Heard, MicState } from './listener';

type Game = ReturnType<typeof useRound>;

const CORRECT: HostKey[] = ['correct1', 'correct2', 'correct3'];

// The voice layer of a round, as in the web game (js/game.js): the theme when
// the round opens, the bed under it, the host reading each clue with the
// clock stopped until the reading ends, the mic opened once at the start and
// kept open, spoken answers judged like typed ones, and a cue for every
// answer and for the last ten seconds. With `voice` off only the cues remain.
// While the app is in the background everything is silent, the mic closed and
// the clock stopped; coming back the bed, the mic and the clue start again.
//
// open: the round is really there (theme plays once it is). theme: false for
// later turns of a match. keepMic: the match screen owns the mic, so leaving a
// turn does not close it (the next "Sıra" screen listens for "hazırım").
export type VoiceOptions = { open?: boolean; theme?: boolean; keepMic?: boolean; rng?: () => number };

export function useVoiceRound(voice: boolean, { open = true, theme = true, keepMic = false, rng = Math.random }: VoiceOptions = {}) {
  const [reading, setReading] = useState(false);
  const [heard, setHeard] = useState('');
  const [mic, setMic] = useState<MicState>('off');
  const game = useRef<Game | null>(null);
  const readingRef = useRef(false);
  const readFor = useRef(-1);
  const first = useRef(true);
  const prefix = useRef<Line | null>(null);
  const wrongRun = useRef(0);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ended = useRef(false);
  const lastSec = useRef(Infinity);

  const stopReading = useCallback(() => {
    if (!readingRef.current) return;
    readingRef.current = false;
    host.cancel();
    setReading(false);
    game.current?.hold(false);
  }, []);

  // The round opens with the theme; leaving it closes the mic and the bed.
  useEffect(() => {
    if (!open) return;
    let live = true;
    prepareAudio().then(() => { if (live && theme) sounds.play('theme'); });
    return () => { live = false; };
  }, [open, theme]);
  const keepMicRef = useRef(keepMic);
  keepMicRef.current = keepMic;
  useEffect(() => {
    return () => {
      if (answerTimer.current) clearTimeout(answerTimer.current);
      if (!keepMicRef.current) listener.stop();
      sounds.stopBg();
      if (!ended.current) host.cancel();
    };
  }, []);

  const onHeard = useCallback((alts: string[], heard?: Heard) => {
    const g = game.current;
    const r = g?.round;
    if (!g || !r || g.phase !== 'playing' || away.current) return;
    const verdict = judgeSpoken(alts, current(r).question.answers);
    // Words heard while the host talks (or just after) may be the host itself:
    // they can give a right answer or a Pas, never a wrong one.
    if (verdict === 'wrong' && (readingRef.current || host.speaking || listener.hostRecent || heard?.duringHost)) return;
    setHeard('');
    g.judge(verdict, alts[0]);
  }, []);

  // From the Başla button: the bed starts and the mic opens for the whole round
  // (in a match it is already open and only gets this round's handler).
  const begin = useCallback(() => {
    started.current = true;
    prepareAudio();
    sounds.startBg();
    if (!voice) return;
    listener.onState = setMic;
    listener.onInterim = setHeard;
    listener.listen(onHeard);
  }, [voice, onHeard]);

  // The app went to the background (or a call, Control Centre): silence
  // everything, close the mic and stop the clock. Back in front: the bed and
  // the mic again, and the current clue is read anew.
  const away = useRef(false);
  const started = useRef(false);
  const [awayState, setAway] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const g = game.current;
      if (state === 'active') {
        if (!away.current) return;
        away.current = false;
        setAway(false);
        g?.pause(false);
        if (!started.current || ended.current || !g || g.phase === 'over') return;
        sounds.startBg();
        if (voice) {
          listener.listen(onHeard);
          readFor.current = -1;  // read the current clue again
        }
      } else if (state === 'background' || state === 'inactive') {
        if (away.current) return;
        away.current = true;
        setAway(true);
        g?.pause(true);
        if (answerTimer.current) clearTimeout(answerTimer.current);
        if (readingRef.current) {
          readingRef.current = false;
          setReading(false);
          g?.hold(false);
        }
        host.cancel();
        sounds.stopAll();
        listener.stop();
      }
    });
    return () => sub.remove();
  }, [voice, onHeard]);

  const read = useCallback((r: Round) => {
    const g = game.current;
    if (!g || away.current) return;
    if (answerTimer.current) clearTimeout(answerTimer.current);
    const lines: Line[] = [];
    if (first.current) lines.push(hostLine('go'));
    if (prefix.current) lines.push(prefix.current);
    first.current = false;
    prefix.current = null;
    lines.push(clueLine(current(r).question));
    readingRef.current = true;
    setReading(true);
    g.hold(true);
    host.speak(lines, () => {
      readingRef.current = false;
      setReading(false);
      game.current?.hold(false);
    });
  }, []);

  const onAnswer = useCallback(({ verdict, was }: Answered) => {
    stopReading();
    setHeard('');
    sounds.play(verdict === 'pass' ? 'pas' : verdict);
    if (!voice) return;
    if (verdict === 'correct') {
      wrongRun.current = 0;
      // The host now and then confirms out loud, as on the show.
      if (rng() < 0.6) prefix.current = hostLine(CORRECT[Math.floor(rng() * CORRECT.length)]);
    } else if (verdict === 'wrong') {
      wrongRun.current++;
      const lines = [hostLine('wrong'), answerLine(was.question)];
      if (wrongRun.current === 2) lines.push(hostLine('listen'));
      const release = game.current?.holdReveal();
      answerTimer.current = setTimeout(() => host.speak(lines, release), 400);
    }
  }, [voice, rng, stopReading]);

  const onOver = useCallback((r: Round) => {
    ended.current = true;
    stopReading();
    listener.stop();
    sounds.stopBg();
    if (!voice) return;
    const all = r.correct === r.letters.length;
    host.speak(all ? [hostLine('allcorrect')] : r.timeLeft <= 0 ? [hostLine('timeup'), hostLine('end')] : [hostLine('end')]);
  }, [voice, stopReading]);

  // A match turn whose round ran out: the mic stays open for the next player.
  const onTurnOver = useCallback((r: Round) => {
    ended.current = true;
    stopReading();
    sounds.stopBg();
    if (voice && r.timeLeft <= 0) host.speak([hostLine('timeup')]);
  }, [voice, stopReading]);

  // Called on every render with the round's current state.
  const bind = (g: Game) => {
    game.current = g;
  };

  return { reading, heard, mic, away: awayState, begin, read, onAnswer, onOver, onTurnOver, bind, readFor, lastSec, voice };
}

// The effects that follow the round: read each new question, warn in the last ten seconds.
export function useVoiceEffects(v: ReturnType<typeof useVoiceRound>, g: Game) {
  v.bind(g);
  const { phase, asked, round } = g;
  useEffect(() => {
    if (!v.voice || v.away || phase !== 'playing' || !round || round.done || v.readFor.current === asked) return;
    v.readFor.current = asked;
    v.read(round);
  }, [phase, asked, v.voice, v.away]);

  const sec = round ? Math.ceil(round.timeLeft) : 0;
  useEffect(() => {
    if (phase === 'playing' && sec > 0 && sec <= 10 && sec < v.lastSec.current) sounds.play('warn');
    v.lastSec.current = sec;
  }, [sec, phase]);
}

const READY = /hazır|hazir|başla|basla|tamam|evet|hadi/;

// The "Sıra: <name>" screen of a match: the host hands over and the player
// can start by saying "hazırım" (or tap). Opens the mic the first time; later
// turns keep the session that is already open.
export function useReadyByVoice(voice: boolean, onReady: () => void) {
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    if (!voice) return;
    let live = true;
    const open = () => listener.listen((alts) => { if (alts.some((a) => READY.test(a))) ready.current(); });
    prepareAudio().then(() => {
      if (!live) return;
      open();
      host.speak([hostLine('turn')]);
    });
    // In the background: quiet and the mic closed; back in front the mic opens again.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') open();
      else { host.cancel(); listener.stop(); }
    });
    return () => { live = false; sub.remove(); };
  }, [voice]);
}
