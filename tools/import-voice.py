#!/usr/bin/env python3
"""Imports the recorded host voice into app/assets/voice/<dosya_adi>.mp3.

Takes the zips (or folders) the recordings arrive in, as they are: several batches
(parti_001, parti_001_v2, harfiyen_parti_002 ...), wav and mp3 of the same line, zips
inside zips, and test files whose names are not lines. For every line of the recording
list (ses-ornekleri/seslendirilecek-satirlar.csv: dosya_adi, metin, tur) the newest
recording wins: highest batch number, then highest _vN, then the latest timestamp (a
date in the path, else the file's own time), then mp3 over wav. Winners are re-encoded
to mono 44.1 kHz 64 kbps mp3. Names that are not in the list are skipped and listed.

Clips already in app/assets/voice that are not a recording (the synthetic placeholders)
are removed, so those lines fall back to the phone's voice; recordings from an earlier
import stay unless this one has a newer take (imported.json keeps track). Then the
app's clip index (app/src/voice/clips.generated.ts) is regenerated and a coverage
report is printed. Temporary files are always removed; --delete-sources also deletes
the zips and folders it was given once the import succeeded.

    python3 tools/import-voice.py ~/projects/passaparola/.work/inbox/*.zip --delete-sources
"""
import argparse, collections, csv, datetime as dt, json, os, re, shutil, subprocess, sys, tempfile, unicodedata
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'app', 'assets', 'voice')
CSV_REL = os.path.join('ses-ornekleri', 'seslendirilecek-satirlar.csv')
AUDIO = {'.mp3': 0, '.wav': 1, '.m4a': 2, '.flac': 2, '.ogg': 2, '.aac': 2}  # lower is preferred
MANIFEST = 'imported.json'


def nfc(s):
    return unicodedata.normalize('NFC', s)


def default_csv():
    here = os.path.join(ROOT, CSV_REL)
    if os.path.exists(here):
        return here
    # The list is not in git; a worktree finds it in the main checkout.
    try:
        common = subprocess.run(['git', '-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
                                capture_output=True, text=True, check=True).stdout.strip()
        return os.path.join(os.path.dirname(common), CSV_REL)
    except (OSError, subprocess.CalledProcessError):
        return here


def read_lines(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return {nfc(r['dosya_adi'].strip()): (r['metin'], r['tur']) for r in csv.DictReader(f)}


def zip_name(info):
    """Member name as the recorder meant it: zips made on Windows without the UTF-8 flag
    come back from zipfile as cp437 mojibake."""
    name = info.filename
    if not info.flag_bits & 0x800:
        raw = name.encode('cp437', 'replace')
        for enc in ('utf-8', 'cp857', 'cp1254'):
            try:
                name = raw.decode(enc)
                break
            except UnicodeDecodeError:
                pass
    return nfc(name.replace('\\', '/'))


STAMP = re.compile(r'(20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)(?:[T _-]?([0-2]\d)[-_.:]?([0-5]\d)(?:[-_.:]?([0-5]\d))?)?')


def rank(path, mtime, ext):
    """Sort key of one recording: bigger is newer."""
    low = path.lower()
    parts = [int(n) for n in re.findall(r'part[iy]?[ _-]*0*(\d+)', low)]
    vers = [int(n) for n in re.findall(r'(?:^|[_ -])v(\d+)(?=$|[_ ./-])', low)]
    stamp = ''
    for m in STAMP.finditer(path):
        stamp = max(stamp, ''.join(g or '00' for g in m.groups()))
    return (max(parts, default=0), max(vers, default=0), stamp, -AUDIO[ext], mtime)


class Scan:
    def __init__(self, names, tmp):
        self.names, self.tmp = names, tmp
        self.best = {}  # dosya_adi -> (rank, label, opener)
        self.unknown = collections.Counter()
        self.files = 0

    def add(self, label, mtime, opener):
        base = os.path.basename(label)
        stem, ext = os.path.splitext(base)
        ext = ext.lower()
        if base.startswith('._') or '__MACOSX' in label:
            return
        if ext == '.zip':
            path = opener()
            self.source(path, label)
            return
        if ext not in AUDIO:
            return
        self.files += 1
        stem = nfc(stem.strip())
        if stem not in self.names:
            self.unknown[stem] += 1
            return
        r = rank(label, mtime, ext)
        if stem not in self.best or r > self.best[stem][0]:
            self.best[stem] = (r, label, opener)

    def source(self, path, label=None):
        label = label or os.path.abspath(path)
        if os.path.isdir(path):
            for d, _, fs in os.walk(path):
                for f in sorted(fs):
                    p = os.path.join(d, f)
                    self.add(os.path.join(label, os.path.relpath(p, path)), os.path.getmtime(p),
                             lambda p=p: p)
            return
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                if info.is_dir():
                    continue
                name = zip_name(info)
                mtime = dt.datetime(*info.date_time).timestamp()
                self.add(f'{label}!/{name}', mtime,
                         lambda path=path, info=info: self.extract(path, info))

    def extract(self, zpath, info):
        fd, out = tempfile.mkstemp(dir=self.tmp, suffix=os.path.splitext(info.filename)[1])
        with os.fdopen(fd, 'wb') as dst, zipfile.ZipFile(zpath) as z, z.open(info) as src:
            shutil.copyfileobj(src, dst)
        return out


def encode(src, dst):
    tmp = dst + '.tmp.mp3'
    r = subprocess.run(['ffmpeg', '-y', '-nostdin', '-loglevel', 'error', '-i', src, '-map', '0:a:0', '-map_metadata', '-1',
                        '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', tmp], capture_output=True)
    if r.returncode or not os.path.exists(tmp) or os.path.getsize(tmp) < 500:
        if os.path.exists(tmp):
            os.remove(tmp)
        return r.stderr.decode(errors='replace')[-300:] or 'empty output'
    os.replace(tmp, dst)
    return None


def group(name, tur):
    if tur == 'sunucu':
        return 'sunucu'
    m = re.match(r'(.+?)-(\d+)-', name)
    return f'{m.group(1)} {m.group(2)}' if m else tur


def coverage(names, have):
    rows = collections.OrderedDict()
    for name, (_, tur) in names.items():
        g = group(name, tur)
        kind = 'cevap' if name.endswith('-cevap') else ('sunucu' if g == 'sunucu' else 'soru')
        row = rows.setdefault(g, collections.Counter())
        row[kind + '_all'] += 1
        row[kind] += name in have
    lines = [f'coverage: {sum(n in have for n in names)}/{len(names)} lines have a recording']
    for g, c in rows.items():
        if g == 'sunucu':
            lines.append(f'  {g:12} {c["sunucu"]}/{c["sunucu_all"]}')
        else:
            lines.append(f'  {g:12} soru {c["soru"]}/{c["soru_all"]}  cevap {c["cevap"]}/{c["cevap_all"]}')
    missing = [n for n in names if n not in have]
    lines.append(f'missing ({len(missing)}):' + (' ' + ' '.join(missing) if missing else ' none'))
    return '\n'.join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('sources', nargs='+', help='zips and/or folders with the recordings')
    ap.add_argument('--csv', default=default_csv())
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--index', default=os.path.join(ROOT, 'app', 'scripts', 'gen-voice-index.mjs'),
                    help="the app's clip index generator, '' to skip")
    ap.add_argument('--delete-sources', action='store_true', help='delete the given zips/folders after a clean import')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args(argv)

    names = read_lines(args.csv)
    os.makedirs(args.out, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='import-voice-')
    failed = []
    try:
        scan = Scan(names, tmp)
        for s in args.sources:
            scan.source(s)
        print(f'{scan.files} audio files scanned, {len(scan.best)} lines found')
        if scan.unknown:
            print(f'skipped, not in the list ({len(scan.unknown)}): ' + ' '.join(sorted(scan.unknown)))
        if args.dry_run:
            for n, (_, label, _) in sorted(scan.best.items()):
                print(f'  {n} <- {label}')
            return 0
        mpath = os.path.join(args.out, MANIFEST)
        manifest = json.load(open(mpath, encoding='utf-8')) if os.path.exists(mpath) else {}
        for i, (n, (r, label, opener)) in enumerate(sorted(scan.best.items()), 1):
            src = opener()
            err = encode(src, os.path.join(args.out, n + '.mp3'))
            if src.startswith(tmp):
                os.remove(src)
            if err:
                failed.append((n, label, err))
            else:
                manifest[n] = label.split('/')[-1] if '!/' in label else os.path.basename(label)
            if i % 200 == 0:
                print(f'{i}/{len(scan.best)}', flush=True)
        # Anything else is a placeholder or a line that left the list: the phone reads it.
        removed = 0
        for f in os.listdir(args.out):
            stem = nfc(f[:-4])
            if f.endswith('.mp3') and (stem not in manifest or stem not in names):
                os.remove(os.path.join(args.out, f))
                manifest.pop(stem, None)
                removed += 1
        with open(mpath, 'w', encoding='utf-8') as f:
            json.dump(dict(sorted(manifest.items())), f, ensure_ascii=False, indent=0)
            f.write('\n')
        print(f'imported {len(scan.best) - len(failed)}, failed {len(failed)}, removed {removed} other clips')
        for n, label, err in failed:
            print(f'FAILED {n} <- {label}: {err}', file=sys.stderr)
        if args.index:
            subprocess.run(['node', args.index], check=True)
        print(coverage(names, set(manifest)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if failed:
        return 1
    if args.delete_sources:
        for s in args.sources:
            if os.path.isdir(s):
                shutil.rmtree(s)
            elif os.path.exists(s):
                os.remove(s)
        print('deleted the sources')
    return 0


if __name__ == '__main__':
    sys.exit(main())
