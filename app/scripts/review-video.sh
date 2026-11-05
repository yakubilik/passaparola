#!/usr/bin/env bash
# Records the App Review screen recording on a simulator (iPhone 17 Pro Max):
#   scripts/store-screenshots.sh --build   # once, the Release simulator app
#   ustabasi sim -- scripts/review-video.sh <out.mp4>
# Boots the simulator, starts simctl recordVideo, runs e2e/review.yaml with Maestro
# (launch, menu, categories, levels, a game, a pass-and-play round), stops the recording.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT=${1:?out.mp4}
SIM_NAME="Harfiyen Review"
APP="$APP_DIR/build/DerivedData/Build/Products/Release-iphonesimulator/Harfiyen.app"
export PATH="$HOME/.maestro/bin:$PATH"
udid=$(xcrun simctl list devices -j | python3 -c "import json,sys;n=sys.argv[1];print(next((d['udid'] for r in json.load(sys.stdin)['devices'].values() for d in r if d['name']==n),''))" "$SIM_NAME")
[[ -n "$udid" ]] || udid=$(xcrun simctl create "$SIM_NAME" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max)
xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
xcrun simctl install "$udid" "$APP"
sleep 20   # first-boot banners settle before the recording starts
xcrun simctl terminate "$udid" com.skolalabs.harfiyen 2>/dev/null || true
xcrun simctl io "$udid" recordVideo --codec h264 --force "$OUT" & rec=$!
sleep 2
status=0
maestro --device "$udid" test "$APP_DIR/e2e/review.yaml" || status=$?
sleep 2
kill -INT $rec; wait $rec || true
xcrun simctl shutdown "$udid" || true
xcrun simctl delete "$udid" || true
exit $status
