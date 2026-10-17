import { useCallback, useEffect, useRef, useState } from 'react';

import type { Verdict } from './normalize';
import { answer as answerRound, current, settle, tick, type Round, type RoundLetter } from './round';

export const REVEAL_MS = 1700;

export type Phase = 'ready' | 'playing' | 'reveal' | 'over';

export type Reveal = { letter: RoundLetter; said: string };

export type Answered = { verdict: Verdict; was: RoundLetter; round: Round };

// Runs one contestant's round: the clock, the answers, the wrong-answer
// reveal. Typed answers come in through `submit`; a spoken answer calls
// `judge` with its own verdict. `hold` stops the clock while the host reads a
// clue; `holdReveal` keeps a wrong answer on screen until the host has said
// the right one. `asked` counts the answers, so a new question can be read
// even when it is the same letter again.
export function useRound(initial: Round | null, onOver: (r: Round) => void, onAnswer?: (a: Answered) => void) {
  const [round, setRound] = useState<Round | null>(initial);
  const [phase, setPhase] = useState<Phase>('ready');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [held, setHeld] = useState(false);
  const [asked, setAsked] = useState(0);
  const ref = useRef(round);
  ref.current = round;
  const overRef = useRef(onOver);
  overRef.current = onOver;
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealHolds = useRef(0);
  const revealTimeUp = useRef(false);

  const finish = useCallback((r: Round) => {
    setPhase('over');
    overRef.current(r);
  }, []);

  // The clock: total time for the round, stopped while a wrong answer is
  // shown and while a clue is being read.
  useEffect(() => {
    if (phase !== 'playing' || held) return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const r = ref.current;
      if (!r) return;
      const next = tick(r, (now - last) / 1000);
      last = now;
      ref.current = next;
      setRound(next);
      if (next.done) {
        clearInterval(id);
        finish(next);
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase, held, finish]);

  useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

  const endReveal = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = null;
    revealHolds.current = 0;
    revealTimeUp.current = false;
    setReveal(null);
    const r = ref.current;
    if (r?.done) finish(r);
    else setPhase('playing');
  }, [finish]);

  const holdReveal = useCallback(() => {
    revealHolds.current++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      revealHolds.current = Math.max(0, revealHolds.current - 1);
      if (!revealHolds.current && revealTimeUp.current && revealTimer.current === null) endReveal();
    };
  }, [endReveal]);

  const apply = useCallback((next: Round, verdict: Verdict, said: string, was: RoundLetter) => {
    setRound(next);
    ref.current = next;
    setAsked((n) => n + 1);
    if (verdict === 'wrong') {
      setReveal({ letter: { ...was, status: 'wrong' }, said });
      setPhase('reveal');
      revealTimeUp.current = false;
      revealHolds.current = 0;
      revealTimer.current = setTimeout(() => {
        revealTimer.current = null;
        revealTimeUp.current = true;
        if (!revealHolds.current) endReveal();
      }, REVEAL_MS);
    } else if (next.done) {
      finish(next);
    }
    answerRef.current?.({ verdict, was, round: next });
  }, [endReveal, finish]);

  const submit = useCallback((text: string) => {
    const r = ref.current;
    if (!r || phase !== 'playing' || !text.trim()) return;
    const was = current(r);
    const { round: next, verdict } = answerRound(r, text);
    apply(next, verdict, text.trim(), was);
  }, [phase, apply]);

  const judge = useCallback((verdict: Verdict, said = '') => {
    const r = ref.current;
    if (!r || phase !== 'playing') return;
    apply(settle(r, verdict), verdict, said, current(r));
  }, [phase, apply]);

  const pass = useCallback(() => judge('pass'), [judge]);
  const start = useCallback(() => { if (phase === 'ready') setPhase('playing'); }, [phase]);
  const hold = useCallback((on: boolean) => setHeld(on), []);

  return { round, phase, reveal, held, asked, start, submit, pass, judge, hold, holdReveal, skipReveal: endReveal };
}
