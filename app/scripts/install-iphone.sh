#!/usr/bin/env bash
# Builds a standalone Release build of Harfiyen (JS bundled into the app, no Metro needed),
# signs it for development with team 23N6H4HW39 and installs + launches it on Yakup's iPhone.
#
#   cd app && npm run iphone            # or: app/scripts/install-iphone.sh [--keep]
#
# The native build runs under the machine-wide ustabasi build lock when that exists.
# Signing is automatic: xcodebuild talks to Apple with the App Store Connect API key, so it
# works from a non-GUI shell. Build products (ios/, build/) are deleted afterwards because
# disk is tight; pass --keep to leave them.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE="${HARFIYEN_DEVICE:-4A493A86-2B04-52F2-9B9C-64C93E275180}"  # "Yakup iPhone'u"
TEAM=23N6H4HW39
BUNDLE_ID=com.skolalabs.harfiyen
ASC_KEY_ID=8JZ7JZN7Z9
ASC_ISSUER=62d07b1a-10e1-471f-8372-36397d375ba6
ASC_KEY="$HOME/.ascelerate/AuthKey_${ASC_KEY_ID}.p8"
LOCK=/Users/dilarakilic/projects/ustabasi/bin/ustabasi
DERIVED="$APP_DIR/build/DerivedData"
APP="$DERIVED/Build/Products/Release-iphoneos/Harfiyen.app"

log() { echo "→ $*" >&2; }

build() {
  cd "$APP_DIR"
  if command -v yk-secrets >/dev/null && pass=$(yk-secrets get login-keychain-password 2>/dev/null); then
    security unlock-keychain -p "$pass" "$HOME/Library/Keychains/login.keychain-db"
  fi
  log "expo prebuild (regenerates ios/, runs pod install)"
  npx expo prebuild --platform ios --clean
  log "xcodebuild Release for device"
  xcodebuild -workspace ios/Harfiyen.xcworkspace -scheme Harfiyen -configuration Release \
    -destination generic/platform=iOS -derivedDataPath "$DERIVED" \
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
    -authenticationKeyPath "$ASC_KEY" -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER" \
    DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" \
    build -quiet
}

if [[ "${1:-}" == "--build" ]]; then
  build
  exit 0
fi

if [[ -x "$LOCK" ]]; then
  "$LOCK" build-lock -- "$0" --build
else
  build
fi

[[ -d "$APP" ]] || { echo "✗ no app at $APP" >&2; exit 1; }
log "voice clips in the app: $(find "$APP" -name '*.mp3' | wc -l | tr -d ' ')"
log "installing on device $DEVICE"
xcrun devicectl device install app --device "$DEVICE" "$APP"
log "launching $BUNDLE_ID"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE_ID"

if [[ "${1:-}" != "--keep" ]]; then
  log "removing build products (ios/, build/)"
  rm -rf "$APP_DIR/ios" "$APP_DIR/build"
fi
log "done: Harfiyen is installed and running on the iPhone"
