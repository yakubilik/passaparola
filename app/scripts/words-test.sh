#!/usr/bin/env bash
# #455: what the iPhone's recognizer makes of short spoken words, without a person.
#   app/scripts/words-test.sh <device id> [output dir]
# Speaks each word with the Mac's Turkish voice (say -v Yelda), pads it with
# silence into a 16 kHz mono WAV, copies the files to the app's Documents/words,
# launches Harfiyen with -harfiyenSelfTest words (src/voice/wordsTest.ts) and
# copies Documents/harfiyen-words.json back once every request has ended.
# Needs a build with the words mode installed; the phone must be unlocked.
set -euo pipefail
DEVICE="$1"
OUT="${2:-${TMPDIR:-/tmp}/harfiyen-words}"
BUNDLE=com.skolalabs.harfiyen
mkdir -p "$OUT/words"

python3 -I - "$OUT/words" <<'PY'
import os, subprocess, sys, tempfile, wave
out = sys.argv[1]
RATE = 16000

def spoken(text, rate=None):
    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, 'w.wav')
        cmd = ['say', '-v', 'Yelda', '--file-format=WAVE', f'--data-format=LEI16@{RATE}', '-o', f]
        if rate: cmd += ['-r', str(rate)]
        subprocess.run(cmd + [text], check=True)
        with wave.open(f) as w:
            assert w.getframerate() == RATE and w.getnchannels() == 1
            return w.readframes(w.getnframes())

def silence(s):
    return b'\0\0' * int(RATE * s)

def write(name, parts):
    with wave.open(os.path.join(out, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(parts))

alone = lambda word, rate=None, before=1.5: [silence(before), spoken(word, rate), silence(3)]
write('pas', alone('Pas'))
write('pas-fast', alone('Pas', 260))
for w in ['Ay', 'Su', 'Un', 'Kar', 'Buz', 'Ok', 'El', 'At', 'Sis', 'Kum']:
    write(w.lower(), alone(w))
write('pas-after-silence', alone('Pas', before=12))
write('ay-after-silence', alone('Ay', before=12))
# One request, as the game keeps one per round: a word, a pause, the next.
round_ = [silence(1.5)]
for w in ['Pas', 'Ay', 'Su', 'Kar', 'Buz', 'Sis']:
    round_ += [spoken(w), silence(3)]
write('round', round_)
PY

for f in "$OUT"/words/*.wav; do
  xcrun devicectl device copy to --device "$DEVICE" --domain-type appDataContainer \
    --domain-identifier "$BUNDLE" --source "$f" --destination "Documents/words/$(basename "$f")" >/dev/null
done
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE" -- -harfiyenSelfTest words >/dev/null
# 15 files, on-device and on the servers, each a few seconds of speech fed in real time.
for _ in $(seq 1 60); do
  sleep 10
  xcrun devicectl device copy from --device "$DEVICE" --domain-type appDataContainer \
    --domain-identifier "$BUNDLE" --source Documents/harfiyen-words.json --destination "$OUT/harfiyen-words.json" >/dev/null 2>&1 || continue
  grep -qE '"stage":"(done|failed|denied)"' "$OUT/harfiyen-words.json" && break
done
echo "$OUT/harfiyen-words.json"
