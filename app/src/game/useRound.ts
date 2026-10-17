import { useCallback, useEffect, useRef, useState } from 'react';

import type { Verdict } from './normalize';
import { answer as answerRound, current, settle, tick, type Round, type RoundLetter } from './round';

export const REVEAL_MS = 1700;

export type Phase = 'ready' | 'playing' | 'reveal' | 'over';

export type Reveal = { letter: RoundLetter; said: string };

// Runs one contestant's round: the clock, the answers, the wrong-answer
// reveal. Typed answers come in through `submit`; a spoken answer (later)
// can call `judge` with its own verdict.
export function useRound(initial: Round | null, onOver: (r: Round) => void) {
  const [round, setRound] = useState<Round | null>(initial);
  const [phase, setPhase] = useState<Phase>('ready');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const ref = useRef(round);
  ref.current = round;
  const overRef = useRef(onOver);
  overRef.current = onOver;
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback((r: Round) => {
    setPhase('over');
    overRef.current(r);
  }, []);

  // The clock: total time for the round, stopped while a wrong answer is shown.
  useEffect(() => {
    if (phase !== 'playing') return;
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
  }, [phase, finish]);

  useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

  const endReveal = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = null;
    setReveal(null);
    const r = ref.current;
    if (r?.done) finish(r);
    else setPhase('playing');
  }, [finish]);

  const apply = useCallback((next: Round, verdict: Verdict, said: string, was: RoundLetter) => {
    setRound(next);
    ref.current = next;
    if (verdict === 'wrong') {
      setReveal({ letter: { ...was, status: 'wrong' }, said });
      setPhase('reveal');
      revealTimer.current = setTimeout(endReveal, REVEAL_MS);
    } else if (next.done) {
      finish(next);
    }
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

  return { round, phase, reveal, start, submit, pass, judge, skipReveal: endReveal };
}
