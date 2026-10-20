#!/bin/bash
# #362: the phone-voice check on one simulator. Run inside the simulator lock
# with a built app:
#   e2e/speech.sh <path/to/Harfiyen.app> <simulator udid> <output dir>
# Installs the app and runs e2e/speech.yaml (which launches it with
# -harfiyenSelfTest speech) (screenshots once the phone voice has started reading the
# first clue, and a few clues later), then copies the app's self-test log
# (its "speech" list: every phone-voice event) next to the screenshots.
set -euo pipefail
APP="$1"; UDID="$2"; OUT="$3"
BUNDLE=com.skolalabs.harfiyen
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$APP"
xcrun simctl privacy "$UDID" grant microphone "$BUNDLE" || true
xcrun simctl privacy "$UDID" grant speech-recognition "$BUNDLE" 2>/dev/null || true
rm -f "$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)/Documents/harfiyen-selftest.json"
LOG="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)/Documents/harfiyen-selftest.json"
set +e
(cd "$OUT" && maestro --device "$UDID" test "$HERE/speech.yaml")
STATUS=$?
set -e
xcrun simctl io "$UDID" screenshot "$OUT/sim-speech.png" || true
cp "$LOG" "$OUT/harfiyen-selftest.json" 2>/dev/null || true
xcrun simctl terminate "$UDID" "$BUNDLE" || true
python3 - "$OUT/harfiyen-selftest.json" <<'PY'
import json, sys
try:
    log = json.load(open(sys.argv[1]))
except Exception as e:
    sys.exit(f'no self-test log: {e}')
ev = log.get('speech', [])
print(f"phone-voice events: {len(ev)}")
for e in ev[:12]:
    print(f"  {e.get('key')}: {e['state']} (attempt {e['attempt']})")
print('started:', sum(e['state'] == 'started' for e in ev), 'silent:', sum(e['state'] == 'silent' for e in ev))
PY
exit $STATUS
