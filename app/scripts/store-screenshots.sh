#!/usr/bin/env bash
# Takes the App Store screenshots into docs/store/screenshots/{6.9,6.5}/:
#
#   cd app && scripts/store-screenshots.sh
#
# 1. builds a Release app for the simulator (JS bundled, no Metro) under the ustabasi build lock;
# 2. under the simulator lock boots ONE iPhone 17 Pro Max simulator (1320x2868, the 6.9"
#    size), sets a clean status bar, installs the app and runs e2e/store.yaml with Maestro;
# 3. writes the 6.9" PNGs as they are and the 6.5" ones (1284x2778) scaled from them,
#    both without alpha (tools/store-shots.py), then deletes ios/ and build/.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$APP_DIR/.." && pwd)"
UST=/Users/dilarakilic/projects/ustabasi/bin/ustabasi
TAG="$(cd "$ROOT" && pwd | shasum | cut -c1-8)"
SIM_NAME="Harfiyen Shots $TAG"
DERIVED="$APP_DIR/build/DerivedData"
APP="$DERIVED/Build/Products/Release-iphonesimulator/Harfiyen.app"
RAW="$APP_DIR/build/store-shots"

log() { echo "→ $*" >&2; }

if [[ "${1:-}" == "--build" ]]; then
  cd "$APP_DIR"
  npx expo prebuild --platform ios --clean
  xcodebuild -workspace ios/Harfiyen.xcworkspace -scheme Harfiyen -configuration Release \
    -sdk iphonesimulator -destination "generic/platform=iOS Simulator" -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO build -quiet
  exit 0
fi

if [[ "${1:-}" == "--shoot" ]]; then
  udid=$(xcrun simctl list devices -j | python3 -c "import json,sys;n=sys.argv[1];print(next((d['udid'] for r in json.load(sys.stdin)['devices'].values() for d in r if d['name']==n),''))" "$SIM_NAME")
  [[ -n "$udid" ]] || udid=$(xcrun simctl create "$SIM_NAME" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max)
  log "simulator $SIM_NAME ($udid)"
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b
  xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
    --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
  xcrun simctl install "$udid" "$APP"
  rm -rf "$RAW" && mkdir -p "$RAW"
  status=0
  (cd "$RAW" && maestro --device "$udid" test "$APP_DIR/e2e/store.yaml") || status=$?
  xcrun simctl shutdown "$udid" || true
  exit $status
fi

"$UST" build-lock -- "$0" --build
"$UST" sim -- "$0" --shoot
uv run -q --with pillow python3 "$ROOT/tools/store-shots.py" "$RAW" "$ROOT/docs/store/screenshots"
rm -rf "$APP_DIR/ios" "$APP_DIR/build"
log "done: $(ls "$ROOT/docs/store/screenshots"/*/ | grep -c png) screenshots"
