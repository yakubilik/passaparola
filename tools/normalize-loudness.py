#!/usr/bin/env python3
"""Normalises the app's audio to a common loudness and records what it measured.

Every file gets one plain gain (ffmpeg `volume`, nothing dynamic), so the recordings
keep their sound and only their level changes. The loudness is EBU R128 integrated
loudness from ffmpeg's loudnorm filter, measured with a second of silence after the
clip (silence is gated out, and clips under 400 ms otherwise give no reading).

    host voice  app/assets/voice/*.mp3      -18 LUFS
    cues        correct, wrong, pas, warn   -24 LUFS  (6 dB under the voice)
    theme       theme                       -24 LUFS  (6 dB under the voice)
    bed         bg                          -24 LUFS  in the file; it plays at a few
                                                       percent volume (sounds.ts), far below

A gain that would push the true peak over -1 dBTP is held there instead. A clip that the
held gain would leave more than 1 LU under its target (a short line with one hard
consonant, typical of a synthetic voice) gets its full gain and a fast peak limiter
instead, which only touches those few milliseconds. Files already within 0.5 LU of
their target are left alone, so running it again changes nothing.
The re-encode keeps each file's channels, rate and bitrate. The measured loudness of
every file lands in app/assets/loudness.json, which the app's tests check.

    python3 tools/normalize-loudness.py            # normalise and write loudness.json
    python3 tools/normalize-loudness.py --check    # only measure and write loudness.json
"""
import argparse, concurrent.futures as cf, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'app', 'assets')
REPORT = os.path.join(ASSETS, 'loudness.json')

VOICE_LUFS = -18.0
CUE_LUFS = -24.0
THEME_LUFS = -24.0
BED_LUFS = -24.0
TARGETS = {'theme': THEME_LUFS, 'bg': BED_LUFS, 'correct': CUE_LUFS, 'wrong': CUE_LUFS, 'pas': CUE_LUFS, 'warn': CUE_LUFS}
MAX_TP = -1.0
TOLERANCE = 0.5
MISS = 1.0  # a held gain that misses the target by more than this is limited instead
# Sample-peak ceiling of the limiter, under MAX_TP: true peak and the mp3 encode overshoot it.
LIMIT_DB = MAX_TP - 2.0


def measure(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostdin', '-nostats', '-i', path,
                        '-af', 'apad=pad_dur=1,loudnorm=print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True)
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr)
    if r.returncode or not m:
        raise RuntimeError(f'{path}: no loudness reading\n{r.stderr[-500:]}')
    j = json.loads(m.group(0))
    return float(j['input_i']), float(j['input_tp'])


def stream(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
                        'stream=channels,sample_rate,bit_rate', '-of', 'json', path], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)['streams'][0]


def normalise(path, target, check):
    lufs, tp = measure(path)
    gain = target - lufs
    limit = False
    if tp + gain > MAX_TP:
        limit = target - (lufs + MAX_TP - tp) > MISS
        if not limit:
            gain = MAX_TP - tp
    if check or abs(gain) < TOLERANCE:
        return path, lufs, tp, 0.0
    s = stream(path)
    fd, tmp = tempfile.mkstemp(suffix='.mp3', dir=os.path.dirname(path))
    os.close(fd)
    try:
        # A limited clip loses some loudness to the limiter: encode it again from the
        # original with the shortfall added, until it lands within the tolerance.
        for _ in range(4 if limit else 1):
            af = f'volume={gain:.2f}dB'
            if limit:
                af += f',alimiter=limit={10 ** (LIMIT_DB / 20):.4f}:attack=1:release=40:level=0'
            subprocess.run(['ffmpeg', '-y', '-nostdin', '-loglevel', 'error', '-i', path, '-map', '0:a:0', '-map_metadata', '-1',
                            '-af', af, '-ac', str(s['channels']), '-ar', str(s['sample_rate']),
                            '-c:a', 'libmp3lame', '-b:a', str(int(s['bit_rate']) // 1000) + 'k', tmp], check=True)
            got, _ = measure(tmp)
            if abs(got - target) < TOLERANCE:
                break
            gain += target - got
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    lufs, tp = measure(path)
    return path, lufs, tp, gain


def files():
    out = []
    for name in sorted(os.listdir(os.path.join(ASSETS, 'sounds'))):
        key = name[:-4]
        if name.endswith('.mp3') and key in TARGETS:
            out.append((os.path.join(ASSETS, 'sounds', name), TARGETS[key]))
    for name in sorted(os.listdir(os.path.join(ASSETS, 'voice'))):
        if name.endswith('.mp3'):
            out.append((os.path.join(ASSETS, 'voice', name), VOICE_LUFS))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='measure only, change no file')
    args = ap.parse_args()
    todo = files()
    report = {'targets': {'voice': VOICE_LUFS, 'cue': CUE_LUFS, 'theme': THEME_LUFS, 'bed': BED_LUFS, 'maxTruePeak': MAX_TP},
              'sounds': {}, 'voice': {}}
    changed = 0
    with cf.ThreadPoolExecutor(os.cpu_count() or 4) as pool:
        for i, (path, lufs, tp, gain) in enumerate(pool.map(lambda f: normalise(f[0], f[1], args.check), todo), 1):
            group = 'sounds' if os.sep + 'sounds' + os.sep in path else 'voice'
            report[group][os.path.basename(path)[:-4]] = {'lufs': round(lufs, 1), 'truePeak': round(tp, 1)}
            changed += gain != 0
            if i % 250 == 0:
                print(f'{i}/{len(todo)}', file=sys.stderr)
    with open(REPORT, 'w') as f:
        json.dump(report, f, indent=0, sort_keys=True, ensure_ascii=False)
        f.write('\n')
    v = [x['lufs'] for x in report['voice'].values()]
    for k, x in report['sounds'].items():
        print(f'{k:10} {x["lufs"]:6.1f} LUFS  {x["truePeak"]:5.1f} dBTP')
    if v:
        print(f'voice      {len(v)} clips, {min(v):.1f} to {max(v):.1f} LUFS, mean {sum(v) / len(v):.1f}')
    print(f'{changed} file(s) changed; {os.path.relpath(REPORT, ROOT)} written')


if __name__ == '__main__':
    main()
