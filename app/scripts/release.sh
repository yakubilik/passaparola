#!/usr/bin/env bash
# Builds the App Store IPA and uploads it to App Store Connect for version 1.0.0:
#
#   cd app && scripts/release.sh
#
# Runs the fastlane `release` lane (app/fastlane/Fastfile) under the machine-wide ustabasi
# build lock, then deletes ios/ and build/. Never submits for review.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCK=/Users/dilarakilic/projects/ustabasi/bin/ustabasi
cd "$APP_DIR"

if command -v yk-secrets >/dev/null && pass=$(yk-secrets get login-keychain-password 2>/dev/null); then
  security unlock-keychain -p "$pass" "$HOME/Library/Keychains/login.keychain-db"
fi

status=0
if [[ -x "$LOCK" ]]; then
  "$LOCK" build-lock -- fastlane release || status=$?
else
  fastlane release || status=$?
fi
rm -rf "$APP_DIR/ios" "$APP_DIR/build"
exit $status
