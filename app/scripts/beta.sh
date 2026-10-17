#!/usr/bin/env bash
# Ships the next Harfiyen beta to TestFlight Internal Testing in one command:
#
#   cd app && npm run beta
#
# Runs the fastlane `beta` lane (app/fastlane/Fastfile) under the machine-wide ustabasi
# build lock, then deletes ios/ and build/ because disk is tight. Needs the App Store
# Connect app record for com.skolalabs.harfiyen to exist.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCK=/Users/dilarakilic/projects/ustabasi/bin/ustabasi
cd "$APP_DIR"

if command -v yk-secrets >/dev/null && pass=$(yk-secrets get login-keychain-password 2>/dev/null); then
  security unlock-keychain -p "$pass" "$HOME/Library/Keychains/login.keychain-db"
fi

status=0
if [[ -x "$LOCK" ]]; then
  "$LOCK" build-lock -- fastlane beta || status=$?
else
  fastlane beta || status=$?
fi
rm -rf "$APP_DIR/ios" "$APP_DIR/build"
exit $status
