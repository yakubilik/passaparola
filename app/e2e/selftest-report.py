#!/usr/bin/env python3
"""Summarises a self-test log (Documents/harfiyen-selftest.json, #361).

    python3 e2e/selftest-report.py harfiyen-selftest.json

Prints the native audio state at each round start side by side, says whether the
session, voice processing and ducking were the same in every round, and lists every
change of the session seen in the per-second samples. Exit 1 when the rounds differ.
"""
import json, sys

log = json.load(open(sys.argv[1]))
samples = log['samples']


def session(s):
    x = s.get('session') or {}
    return (x.get('category'), tuple(x.get('options') or []), x.get('mode'))


def engine(s):
    v = s.get('vp') or {}
    return (v.get('enabled'), v.get('advancedDucking'), v.get('duckingLevel'))


starts = [s for s in samples if s['event'] == 'round-start']
for s in starts:
    x, v = s.get('session') or {}, s.get('vp') or {}
    players = ', '.join(f"{p['name']} {p['volume']:.2f}{' ▶' if p['playing'] else ''}" for p in s.get('players', []))
    print(f"round {s['round']} @ {s['t'] / 1000:.0f}s: {x.get('category')} ({', '.join(x.get('options') or [])}), "
          f"mode {x.get('mode')}, outputVolume {x.get('outputVolume')}, route {x.get('outputs')}; "
          f"voice processing {v.get('enabled')} running {v.get('running')}, advanced ducking {v.get('advancedDucking')}, "
          f"ducking {v.get('duckingLevel')}, engines {v.get('engines')}, rebuilds {v.get('rebuilds')}; gain {s.get('gain')}; players: {players}")

same = len({(session(s), engine(s), (s.get('session') or {}).get('outputVolume')) for s in starts}) == 1
print(f"{len(starts)} round starts; identical: {same}")

last = None
for s in samples:
    cur = session(s)
    if cur != last:
        print(f"  {s['t'] / 1000:6.0f}s round {s['round']} {s['event']}: session {cur}")
        last = cur
rebuilds = max((s.get('vp') or {}).get('rebuilds') or 0 for s in samples)
print(f"engine rebuilds after a route change: {rebuilds}")
sys.exit(0 if same and len(starts) == log.get('levels', 3) else 1)
