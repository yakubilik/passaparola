#!/usr/bin/env python3
"""Spot-checks the recorded host clips: transcribes N random clips of app/assets/voice
with Whisper (mlx-whisper, large-v3-turbo, run through uvx) and compares each with its
line in the recording list. Prints a similarity per clip and lists the mismatches.

    python3 tools/check-voice.py [-n 20] [--seed 334] [--min 0.8]
"""
import argparse, difflib, importlib.util, json, os, random, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('import_voice', os.path.join(HERE, 'import-voice.py'))
iv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(iv)

MODEL = 'mlx-community/whisper-large-v3-turbo'


def norm(s):
    s = iv.nfc(s).replace('İ', 'i').replace('I', 'ı').lower()
    s = re.sub(r"[^\w\s]", ' ', s)
    return ' '.join(s.split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-n', type=int, default=20)
    ap.add_argument('--seed', type=int, default=334)
    ap.add_argument('--min', type=float, default=0.8, help='similarity below this is a mismatch')
    ap.add_argument('--csv', default=iv.default_csv())
    ap.add_argument('--out', default=iv.OUT)
    args = ap.parse_args()

    names = iv.read_lines(args.csv)
    have = sorted(iv.nfc(f[:-4]) for f in os.listdir(args.out) if f.endswith('.mp3') and iv.nfc(f[:-4]) in names)
    pick = random.Random(args.seed).sample(have, min(args.n, len(have)))
    tmp = tempfile.mkdtemp(prefix='check-voice-')
    try:
        # Plain numbered copies, so the transcripts come back under names we know.
        files = []
        for i, n in enumerate(pick):
            files.append(os.path.join(tmp, f'{i:03}.mp3'))
            shutil.copy(os.path.join(args.out, n + '.mp3'), files[-1])
        # One file per run: given several, mlx_whisper writes every transcript to the first name.
        for f in files:
            subprocess.run(['uvx', '--from', 'mlx-whisper', 'mlx_whisper', '--model', MODEL, '--language', 'tr',
                            '--output-format', 'json', '--output-dir', tmp, '--verbose', 'False', f],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        bad = []
        for i, n in enumerate(pick):
            heard = json.load(open(os.path.join(tmp, f'{i:03}.json'), encoding='utf-8'))['text'].strip()
            want = names[n][0]
            sim = difflib.SequenceMatcher(None, norm(want), norm(heard)).ratio()
            print(f'{sim:.2f} {n}\n     list:  {want}\n     heard: {heard}')
            if sim < args.min:
                bad.append((n, sim))
        print(f'{len(pick) - len(bad)}/{len(pick)} match (similarity >= {args.min})')
        for n, sim in bad:
            print(f'MISMATCH {n} {sim:.2f}')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
