#!/usr/bin/env python3
"""Synthesises the game's sound cues and the background bed into assets/sounds/<cue>.mp3.

Modelled on the show, not copied from it: the correct cue is a bright bell strike
(partials near 1.05/5.2/7.2/11.5 kHz, as in the broadcast), the wrong cue a hard buzzer,
and `bg` is an original tense quiz loop that the game repeats under the ring round.

    tools/../.work/scripts/.venv/bin/python tools/gen-sounds.py   # needs numpy + ffmpeg
"""
import os, subprocess, tempfile, wave
import numpy as np

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sounds')
rng = np.random.default_rng(7)


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def env(n, a=0.003, d=1.0, sustain=None):
    t = np.arange(n) / SR
    e = np.minimum(t / a, 1.0) if a else np.ones(n)
    return e * (np.exp(-t / d) if sustain is None else sustain)


def bell(f0, dur, ratios, amps, decays, vol=1.0):
    t = t_(dur)
    y = np.zeros_like(t)
    for r, a, d in zip(ratios, amps, decays):
        y += a * np.sin(2 * np.pi * f0 * r * t + rng.random() * 6) * np.exp(-t / d)
    y *= np.minimum(t / 0.002, 1)
    return vol * y


def saw(f, t, harmonics=40):
    y = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if f * k > SR / 2.2:
            break
        y += np.sin(2 * np.pi * f * k * t) / k
    return y * 0.6


def square(f, t, harmonics=30):
    y = np.zeros_like(t)
    for k in range(1, 2 * harmonics, 2):
        if f * k > SR / 2.2:
            break
        y += np.sin(2 * np.pi * f * k * t) / k
    return y * 0.8


def lowpass(y, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    out = np.empty_like(y)
    acc = 0.0
    for i, v in enumerate(y):
        acc = (1 - a) * v + a * acc
        out[i] = acc
    return out


def mix(*parts):
    n = max(len(p[1]) + int(p[0] * SR) for p in parts)
    y = np.zeros(n)
    for start, p in parts:
        s = int(start * SR)
        y[s:s + len(p)] += p
    return y


def norm(y, peak=0.89):
    return y / (np.max(np.abs(y)) + 1e-9) * peak


def write(name, y, br='160k'):
    y = norm(y)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((y * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-b:a', br, os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(tmp)
    print(name, f'{len(y) / SR:.2f}s')


# ---- cues ---------------------------------------------------------------

def correct():
    # Bell strike: the show's ding sits on ~1050 Hz with strong partials around 5.2, 7.2 and 11.5 kHz.
    b = bell(1050, 1.6, [1, 2.0, 4.95, 6.86, 10.95], [0.55, 0.12, 0.45, 0.4, 0.18], [0.55, 0.3, 0.6, 0.5, 0.35])
    shimmer = bell(1575, 1.2, [1, 3.3, 4.6], [0.25, 0.12, 0.1], [0.35, 0.25, 0.2])
    return mix((0, b), (0.07, 0.6 * shimmer))


def wrong():
    t = t_(0.62)
    y = saw(146.8, t) + saw(155.6, t) + 0.5 * square(73.4, t)
    y = lowpass(y, 2200)
    e = np.minimum(t / 0.006, 1) * np.clip((0.62 - t) / 0.06, 0, 1)
    return y * e


def pas():
    t = t_(0.45)
    f = 1400 * np.exp(-t * 3.2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = (np.sin(ph) + 0.3 * np.sin(2 * ph)) * np.exp(-t / 0.18)
    return y + 0.25 * lowpass(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.08)


def tick():
    return bell(2600, 0.06, [1, 2.7], [1, 0.4], [0.012, 0.008])


def warn():
    t = t_(0.16)
    return square(1046.5, t) * np.exp(-t / 0.06) * np.minimum(t / 0.002, 1)


def turn():
    a = bell(784, 0.5, [1, 2, 3.98], [0.6, 0.2, 0.15], [0.2, 0.12, 0.08])
    b = bell(1174.7, 0.8, [1, 2, 3.98], [0.6, 0.2, 0.15], [0.3, 0.15, 0.1])
    return mix((0, a), (0.13, b))


def theme():
    # Short rising fanfare + hit, in D minor -> D major.
    notes = [293.7, 349.2, 440, 587.3, 698.5, 880]
    parts = []
    for i, n in enumerate(notes):
        t = t_(0.22)
        parts.append((i * 0.1, (saw(n, t, 12) * 0.35 + square(n / 2, t, 8) * 0.2) * env(len(t), 0.004, 0.12)))
    hit_t = t_(1.8)
    chord = sum(saw(f, hit_t, 14) for f in [293.7, 370, 440, 587.3]) * 0.22
    chord = lowpass(chord, 4000) * env(len(hit_t), 0.01, 0.7)
    boom = np.sin(2 * np.pi * 55 * hit_t * (1 + np.exp(-hit_t * 30))) * np.exp(-hit_t / 0.35)
    cym = lowpass(rng.standard_normal(len(hit_t)), 9000) * np.exp(-hit_t / 0.5) * 0.25
    parts.append((0.62, chord + boom * 0.8 + cym))
    return mix(*parts)


def end():
    t = t_(2.8)
    y = sum(np.sin(2 * np.pi * f * t) * a * np.exp(-t / d)
            for f, a, d in [(98, 0.8, 1.4), (196, 0.5, 1.2), (293.7, 0.35, 1.0), (415.3, 0.25, 0.8), (587.3, 0.15, 0.6)])
    return y + 0.3 * lowpass(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.25)


def win():
    seq = [(523.3, 0), (659.3, 0.14), (784, 0.28), (1046.5, 0.42), (784, 0.62), (1046.5, 0.76)]
    parts = [(s, bell(f, 0.5, [1, 2, 3, 4.2], [0.6, 0.3, 0.15, 0.1], [0.25, 0.18, 0.1, 0.08])) for f, s in seq]
    t = t_(1.8)
    chord = lowpass(sum(saw(f, t, 14) for f in [523.3, 659.3, 784, 1046.5]) * 0.18, 5000) * env(len(t), 0.02, 0.8)
    parts.append((1.0, chord))
    return mix(*parts)


# ---- background bed -----------------------------------------------------

def bg():
    """Original tense quiz loop: 124 bpm, 8 bars of D minor, pulsing bass, offbeat hats, a ticking motif."""
    bpm = 124
    beat = 60 / bpm
    bars = 8
    total = bars * 4 * beat
    n = int(total * SR)
    y = np.zeros(n)

    def put(start, sig):
        s = int(start * SR) % n
        e = s + len(sig)
        if e <= n:
            y[s:e] += sig
        else:  # wrap so the loop is seamless
            y[s:] += sig[:n - s]
            y[:e - n] += sig[n - s:]

    # i - VI - III - VII, twice (Dm, Bb, F, C)
    prog = [(73.42, [293.7, 349.2, 440]), (58.27, [233.1, 293.7, 349.2]),
            (87.31, [349.2, 440, 523.3]), (65.41, [261.6, 329.6, 392])] * 2
    eighth = beat / 2
    for bi, (root, chord) in enumerate(prog):
        bar0 = bi * 4 * beat
        # bass: driving eighths, octave bounce on the offbeat
        for k in range(8):
            f = root if k % 2 == 0 else root * 2
            t = t_(eighth * 0.9)
            sig = lowpass(saw(f, t, 20), 600) * env(len(t), 0.003, 0.12) * 0.55
            put(bar0 + k * eighth, sig)
        # pad: soft sustained chord, filtered
        t = t_(4 * beat)
        pad = sum(saw(f, t, 10) for f in chord) * 0.06
        pad = lowpass(pad, 1200) * np.minimum(t / 0.25, 1) * np.clip((4 * beat - t) / 0.2, 0, 1)
        put(bar0, pad)
        # stab on beats 2 and 4
        for b in (1, 3):
            t = t_(0.18)
            st = sum(square(f * 2, t, 6) for f in chord) * 0.05 * env(len(t), 0.002, 0.05)
            put(bar0 + b * beat, st)
        # ticking motif: high pluck on every sixteenth, accented on the beat
        for k in range(16):
            t = t_(0.05)
            acc = 1.0 if k % 4 == 0 else 0.45
            put(bar0 + k * beat / 4, bell(2093, 0.05, [1, 2.76], [1, 0.3], [0.010, 0.006]) * 0.10 * acc)
        # arpeggio on the last two beats of every other bar
        if bi % 2 == 1:
            for k, f in enumerate(chord + [chord[0] * 2]):
                t = t_(0.2)
                put(bar0 + 2 * beat + k * eighth, bell(f * 2, 0.2, [1, 2, 3], [0.5, 0.2, 0.1], [0.12, 0.08, 0.05]) * 0.22)
    # drums
    for k in range(bars * 4):
        t = t_(0.3)
        kick = np.sin(2 * np.pi * 50 * t * (1 + 2.5 * np.exp(-t * 35))) * np.exp(-t / 0.12)
        put(k * beat, kick * 0.6)
        t = t_(0.06)
        hat = np.diff(rng.standard_normal(len(t) + 1)) * np.exp(-t / 0.015)
        put(k * beat + eighth, hat * 0.08)
        if k % 4 in (1, 3):
            t = t_(0.2)
            snare = (lowpass(rng.standard_normal(len(t)), 5000) * 0.5 + np.sin(2 * np.pi * 190 * t) * 0.4) * np.exp(-t / 0.06)
            put(k * beat, snare * 0.35)
    return y


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, fn in [('correct', correct), ('wrong', wrong), ('pas', pas), ('tick', tick), ('warn', warn),
                     ('turn', turn), ('theme', theme), ('end', end), ('win', win)]:
        write(name, fn())
    write('bg', bg(), br='128k')
