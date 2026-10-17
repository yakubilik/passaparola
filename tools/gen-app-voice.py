#!/usr/bin/env python3
"""Records every spoken line of the Harfiyen app into app/assets/voice/<name>.mp3.

Placeholder voice until the final host voice is made: Piper's Turkish dfki voice, run
locally (needs a venv with piper-tts and the model, see --model), or Edge 'Ahmet' with
--engine edge (online, rate-limited: thousands of lines take hours); the names are the
contract: <question id>.mp3 reads the clue, <question id>-cevap.mp3 says the answer after a
wrong guess, host lines use the keys of tools/host-lines.json. Lines already recorded with
the same text are skipped, so it can be stopped and run again.

    python3 tools/gen-app-voice.py [--jobs 8]
"""
import argparse, concurrent.futures as cf, glob, hashlib, json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'app', 'assets', 'voice')
EDGE = os.path.expanduser('~/.local/bin/edge-tts')
VOICE, RATE = 'tr-TR-AhmetNeural', '+5%'
NAMES = {'A': 'a', 'B': 'be', 'C': 'ce', 'Ç': 'çe', 'D': 'de', 'E': 'e', 'F': 'fe', 'G': 'ge', 'H': 'he', 'I': 'ı',
         'İ': 'i', 'J': 'je', 'K': 'ke', 'L': 'le', 'M': 'me', 'N': 'ne', 'O': 'o', 'Ö': 'ö', 'P': 'pe', 'R': 're',
         'S': 'se', 'Ş': 'şe', 'T': 'te', 'U': 'u', 'Ü': 'ü', 'V': 've', 'Y': 'ye', 'Z': 'ze'}


def lines():
    out = {k: v for k, v in json.load(open(os.path.join(ROOT, 'tools', 'host-lines.json'), encoding='utf-8')).items()
           if not k.startswith('_')}
    for f in sorted(glob.glob(os.path.join(ROOT, 'app', 'assets', 'questions', '*.json'))):
        for lv in json.load(open(f, encoding='utf-8'))['levels']:
            for q in lv['questions']:
                name = NAMES[q['letter']]
                tail = f"{name.capitalize()} ile başlıyor." if q['type'] == 'starts' else f"İçinde {name} var."
                out[q['id']] = f"{q['clue'].rstrip('.')}... {tail}"
                out[q['id'] + '-cevap'] = f"{q['answers'][0]} olacaktı."
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--engine', choices=['piper', 'edge'], default='piper')
    ap.add_argument('--model', default=os.path.join(ROOT, '.work', 'piper', 'tr_TR-dfki-medium.onnx'))
    args = ap.parse_args()
    global VOICE, RATE
    if args.engine == 'piper':
        VOICE, RATE = 'piper:' + os.path.basename(args.model), ''
    os.makedirs(OUT, exist_ok=True)
    stamp_file = os.path.join(OUT, 'stamps.json')
    stamps = json.load(open(stamp_file)) if os.path.exists(stamp_file) else {}
    all_lines = lines()
    todo = {}
    for key, text in all_lines.items():
        h = hashlib.sha1(f'{VOICE}|{RATE}|{text}'.encode()).hexdigest()[:12]
        if stamps.get(key) != h or not os.path.exists(os.path.join(OUT, key + '.mp3')):
            todo[key] = (text, h)
    # Host lines first, then level by level with the clues ahead of the answers, so a
    # partial run already covers the first levels completely.
    def order(key):
        if '-' not in key:
            return (0, 0, 0, key)
        parts = key.split('-')
        return (1, int(parts[1]), key.endswith('-cevap'), key)
    todo = dict(sorted(todo.items(), key=lambda kv: order(kv[0])))
    print(f'{len(todo)} to record of {len(all_lines)}', flush=True)

    if args.engine == 'piper':
        import io, threading, wave
        from piper import PiperVoice, SynthesisConfig
        voice = PiperVoice.load(args.model)
        cfg = SynthesisConfig(length_scale=1.0, noise_scale=0.55, noise_w_scale=0.7)
        lock = threading.Lock()

    def rec_piper(item):
        key, (text, h) = item
        buf = io.BytesIO()
        with lock, wave.open(buf, 'wb') as w:
            voice.synthesize_wav(text, w, syn_config=cfg)
        r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-ac', '1', '-b:a', '48k',
                            os.path.join(OUT, key + '.mp3')], input=buf.getvalue(), capture_output=True)
        return key, h, (r.stderr.decode()[-200:] if r.returncode else None)

    def rec(item):
        if args.engine == 'piper':
            return rec_piper(item)
        key, (text, h) = item
        tmp = os.path.join(OUT, key + '.tmp.mp3')
        err = ''
        for attempt in range(6):
            if attempt:
                time.sleep(2 * attempt)
            r = subprocess.run([EDGE, '--voice', VOICE, f'--rate={RATE}', '--text', text, '--write-media', tmp],
                               capture_output=True)
            if r.returncode == 0 and os.path.exists(tmp) and os.path.getsize(tmp) > 1000:
                os.replace(tmp, os.path.join(OUT, key + '.mp3'))
                return key, h, None
            err = r.stderr.decode()[-200:]
        if os.path.exists(tmp):
            os.remove(tmp)
        return key, h, err

    failed, done = [], 0
    with cf.ThreadPoolExecutor(args.jobs) as ex:
        for key, h, err in ex.map(rec, todo.items()):
            done += 1
            if err:
                failed.append((key, err))
            else:
                stamps[key] = h
            if done % 100 == 0:
                print(f'{done}/{len(todo)}', flush=True)
                json.dump(stamps, open(stamp_file, 'w'), indent=0, sort_keys=True)
    for key in [k for k in stamps if k not in all_lines]:
        stamps.pop(key)
        p = os.path.join(OUT, key + '.mp3')
        if os.path.exists(p):
            os.remove(p)
    json.dump(stamps, open(stamp_file, 'w'), indent=0, sort_keys=True)
    print(f'recorded {len(todo) - len(failed)}, failed {len(failed)}, total {len(stamps)}', flush=True)
    for key, err in failed:
        print('FAILED', key, err, file=sys.stderr)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
