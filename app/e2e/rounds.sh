#!/bin/bash
# #361: the three-round audio check on one simulator. Run inside the simulator
# lock with a built app:
#   e2e/rounds.sh <path/to/Harfiyen.app> <simulator udid> <output dir>
# Boots the simulator, installs and launches the app in its self-test mode,
# runs e2e/rounds.yaml (a screenshot of each round's SES OTURUMU), then copies
# the app's Documents/harfiyen-selftest.json next to the screenshots.
set -euo pipefail
APP="$1"; UDID="$2"; OUT="$3"
BUNDLE=com.skolalabs.harfiyen
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl install "$UDID" "$APP"
xcrun simctl privacy "$UDID" grant microphone "$BUNDLE" || true
xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE" -harfiyenSelfTest 1
LOG="$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)/Documents/harfiyen-selftest.json"
# Maestro photographs each round's SES OTURUMU; its result does not stop the run.
(cd "$OUT" && maestro --device "$UDID" test "$HERE/rounds.yaml" > maestro.log 2>&1; echo "maestro exit $?" >> maestro.log) &
MAESTRO=$!
# And a plain simulator screenshot of every result screen, once the self-test has scrolled to SES OTURUMU.
shot=1
for i in $(seq 1 1800); do
  if [ -f "$LOG" ] && [ "$(grep -o '"event":"result"' "$LOG" | wc -l)" -ge "$shot" ]; then
    sleep 3
    xcrun simctl io "$UDID" screenshot "$OUT/sim-round-$shot.png"
    shot=$((shot + 1))
  fi
  if [ -f "$LOG" ] && grep -q '"event":"done"' "$LOG"; then break; fi
  sleep 1
done
wait $MAESTRO || true
cp "$LOG" "$OUT/harfiyen-selftest.json"
xcrun simctl terminate "$UDID" "$BUNDLE" || true
python3 "$HERE/selftest-report.py" "$OUT/harfiyen-selftest.json"
