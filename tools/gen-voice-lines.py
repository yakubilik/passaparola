#!/usr/bin/env python3
"""Writes the recording lists for the host voice.

    ses-ornekleri/seslendirilecek-satirlar.csv  every spoken line of the app
    ses-ornekleri/yeniden-seslendirilecek.csv   the lines with no recording in app/assets/voice

Both have the columns dosya_adi, metin, tur (UTF-8 with BOM, so Excel opens them right).
The texts come from tools/gen-app-voice.py (host lines, then every question's clue and
answer line), the same wording the app reads. ses-ornekleri is not in git; a worktree
writes the lists into the main checkout, where tools/import-voice.py reads them.

    python3 tools/gen-voice-lines.py [--dir DIR]
"""
import argparse, csv, importlib.util, os, re, subprocess, sys, unicodedata

sys.dont_write_bytecode = True  # importing gen-app-voice.py must not leave a __pycache__ in tools/

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'app', 'assets', 'voice')
ALL = 'seslendirilecek-satirlar.csv'
AGAIN = 'yeniden-seslendirilecek.csv'


def default_dir():
    here = os.path.join(ROOT, 'ses-ornekleri')
    try:
        common = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
                                capture_output=True, text=True, check=True).stdout.strip()
        main = os.path.join(os.path.dirname(common), 'ses-ornekleri')
        return main if os.path.isdir(main) else here
    except (OSError, subprocess.CalledProcessError):
        return here


def load_lines():
    spec = importlib.util.spec_from_file_location('gen_app_voice', os.path.join(ROOT, 'tools', 'gen-app-voice.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.lines()


def kind(key):
    if key.endswith('-cevap'):
        return 'yanlışta doğru cevap'
    m = re.match(r'(.+)-(\d+)-.+-\d+$', key)
    return f'soru {m.group(1)} {m.group(2)}' if m else 'sunucu'


def rows():
    return [(k, t, kind(k)) for k, t in load_lines().items()]


def recorded(voice=VOICE):
    return {unicodedata.normalize('NFC', f[:-4]) for f in os.listdir(voice) if f.endswith('.mp3')}


def write(path, data):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, lineterminator='\r\n')
        w.writerow(['dosya_adi', 'metin', 'tur'])
        w.writerows(data)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--dir', default=default_dir(), help='where the two lists go (default: ses-ornekleri)')
    ap.add_argument('--voice', default=VOICE)
    args = ap.parse_args(argv)
    os.makedirs(args.dir, exist_ok=True)
    data = rows()
    have = recorded(args.voice)
    again = [r for r in data if r[0] not in have]
    write(os.path.join(args.dir, ALL), data)
    write(os.path.join(args.dir, AGAIN), again)
    print(f'{len(data)} lines -> {os.path.join(args.dir, ALL)}')
    print(f'{len(again)} without a recording -> {os.path.join(args.dir, AGAIN)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
