import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { clearProgress, EMPTY_PROGRESS, loadProgress, recordRound, saveProgress, type Progress } from './progress';

type Value = {
  progress: Progress;
  ready: boolean;
  record: (cats: string[], level: number, correct: number) => Promise<Progress>;
  reset: () => Promise<void>;
};

const Ctx = createContext<Value | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [ready, setReady] = useState(false);
  const ref = useRef(progress);

  useEffect(() => {
    let live = true;
    loadProgress().then((p) => {
      if (!live) return;
      ref.current = p;
      setProgress(p);
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  const record = useCallback(async (cats: string[], level: number, correct: number) => {
    const next = recordRound(ref.current, cats, level, correct);
    ref.current = next;
    setProgress(next);
    await saveProgress(next);
    return next;
  }, []);

  const reset = useCallback(async () => {
    ref.current = EMPTY_PROGRESS;
    setProgress(EMPTY_PROGRESS);
    await clearProgress();
  }, []);

  const value = useMemo(() => ({ progress, ready, record, reset }), [progress, ready, record, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProgress outside ProgressProvider');
  return v;
}
