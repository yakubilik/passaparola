import { useCallback, useEffect, useRef, useState } from 'react';

import { judgeSpoken, norm } from '../game/normalize';
import { current, type Round } from '../game/round';
import type { Answered, useRound } from '../game/useRound';
import { host, listener, prepareAudio, sounds } from './engine';
import { answerLine, clueLine, host as hostLine, type HostKey, type Line } from './lines';
import type { MicState } from './listener';

type Game = ReturnType<typeof useRound>;

const CORRECT: HostKey[] = ['correct1', 'correct2', 'correct3'];

// The voice layer of a round, as in the web game (js/game.js): the theme when
// the round opens, the bed under it, the host reading each clue with the
// clock stopped until the reading ends, the mic opened once at the start and
// kept open, spoken answers judged like typed ones, and a cue for every
// answer and for the last ten seconds. With `voice` off only the cues remain.
export function useVoiceRound(voice: boolean, open = true, rng: () => number = Math.random) {
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
    prepareAudio().then(() => { if (live) sounds.play('theme'); });
    return () => { live = false; };
  }, [open]);
  useEffect(() => {
    return () => {
      if (answerTimer.current) clearTimeout(answerTimer.current);
      listener.stop();
      sounds.stopBg();
      if (!ended.current) host.cancel();
    };
  }, []);

  const onHeard = useCallback((alts: string[]) => {
    const g = game.current;
    const r = g?.round;
    if (!g || !r || g.phase !== 'playing') return;
    const verdict = judgeSpoken(alts, current(r).question.answers);
    // While the clue is still being read, longer talk is more likely the room than an answer.
    if (verdict === 'wrong' && readingRef.current && norm(alts[0]).split(' ').length > 2) return;
    setHeard('');
    g.judge(verdict, alts[0]);
  }, []);

  // From the Başla button: the bed starts and the mic opens for the whole round.
  const begin = useCallback(() => {
    prepareAudio();
    sounds.startBg();
    if (!voice) return;
    listener.onState = setMic;
    listener.onInterim = setHeard;
    listener.listen(onHeard);
  }, [voice, onHeard]);

  const read = useCallback((r: Round) => {
    const g = game.current;
    if (!g) return;
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

  // Called on every render with the round's current state.
  const bind = (g: Game) => {
    game.current = g;
  };

  return { reading, heard, mic, begin, read, onAnswer, onOver, bind, readFor, lastSec, voice };
}

// The effects that follow the round: read each new question, warn in the last ten seconds.
export function useVoiceEffects(v: ReturnType<typeof useVoiceRound>, g: Game) {
  v.bind(g);
  const { phase, asked, round } = g;
  useEffect(() => {
    if (!v.voice || phase !== 'playing' || !round || round.done || v.readFor.current === asked) return;
    v.readFor.current = asked;
    v.read(round);
  }, [phase, asked, v.voice]);

  const sec = round ? Math.ceil(round.timeLeft) : 0;
  useEffect(() => {
    if (phase === 'playing' && sec > 0 && sec <= 10 && sec < v.lastSec.current) sounds.play('warn');
    v.lastSec.current = sec;
  }, [sec, phase]);
}
