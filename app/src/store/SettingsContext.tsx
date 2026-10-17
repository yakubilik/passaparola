import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './settings';

type Value = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
};

const Ctx = createContext<Value | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const ref = useRef(settings);

  useEffect(() => {
    let live = true;
    loadSettings().then((s) => {
      if (!live) return;
      ref.current = s;
      setSettings(s);
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...ref.current, ...patch };
    ref.current = next;
    setSettings(next);
    saveSettings(next);
  }, []);

  const value = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings outside SettingsProvider');
  return v;
}
