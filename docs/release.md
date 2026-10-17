# Harfiyen: getting a build onto the iPhone

For now builds go straight to Yakup's iPhone, not through TestFlight or the App Store.

## Reinstall on the iPhone (one command)

```bash
cd app && npm run iphone
```

This runs `app/scripts/install-iphone.sh`, which:

1. regenerates `app/ios/` with `expo prebuild --clean` (pod install included);
2. builds a **Release** build (the JS is bundled into the app, so it runs without Metro
   or the Mac) under the machine-wide ustabasi build lock;
3. signs it for development with team `23N6H4HW39` (automatic signing; xcodebuild uses
   the App Store Connect API key `~/.ascelerate/AuthKey_8JZ7JZN7Z9.p8`, so it works from a
   non-GUI shell);
4. installs it with `xcrun devicectl device install app` on "Yakup iPhone'u"
   (`4A493A86-2B04-52F2-9B9C-64C93E275180`) and launches it;
5. deletes `app/ios/` and `app/build/` (disk is tight). Pass `--keep` to keep them:
   `npm run iphone -- --keep`.

Another device: `HARFIYEN_DEVICE=<devicectl id> npm run iphone` (ids from
`xcrun devicectl list devices`). The phone must be paired, unlocked and in Developer Mode.

The app includes every clip in `app/assets/voice/` as it is at build time (the
`expo-asset` plugin in `app.json` copies the folder into the app bundle); the build log
prints how many `.mp3` files went in.

## Icon and splash

`app/assets/icon.png`, `splash-icon.png` and the Android icon layers are drawn by
`tools/gen-app-icon.py` (navy sky, the letter ring, a big H):

```bash
uv run --with pillow python3 tools/gen-app-icon.py
```

## Later: TestFlight beta (prepared, not used)

```bash
cd app && npm run beta
```

`app/scripts/beta.sh` runs the fastlane `beta` lane (`app/fastlane/Fastfile`) under the
build lock: it runs `expo prebuild`, sets the build number to the latest TestFlight build + 1
(`latest_testflight_build_number`), builds a signed App Store IPA (Apple Distribution, team
`23N6H4HW39`, profile "Harfiyen App Store") and uploads it to TestFlight Internal Testing
only. It never adds external testers and never submits for App Store review. Then it deletes
`app/ios/` and `app/build/`.

Already in place: bundle id `com.skolalabs.harfiyen` and the "Harfiyen App Store"
provisioning profile. Before the first run, create the App Store Connect app record
(`asc-create-app --name "Harfiyen" --bundle com.skolalabs.harfiyen --sku harfiyen001`; it
needs Yakup to approve the Apple sign-in on his phone) and add Yakup as an internal
tester. Yakup wants direct iPhone installs for now (store and TestFlight come later), so
this lane has never been run. Do not run it until he asks for TestFlight.
