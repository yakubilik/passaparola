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

## App Store (version 1.0.0)

The App Store Connect record exists: "Harfiyen - Kelime Yarışması" (plain "Harfiyen" was
taken), app id `6824316208`, SKU `harfiyen001`, primary language Turkish. The name on the
home screen stays "Harfiyen".

- Store texts: `docs/store/tr.md`; privacy policy (Turkish + English): `docs/store/privacy.md`.
  `app/src/__tests__/storeReadiness.test.ts` checks the limits, the trademark rule, app.json
  and the screenshots.
- Push the texts (name, subtitle, description, keywords, promotional text; plus the privacy
  policy URL once it is published): `python3 app/scripts/push-store-metadata.py [--privacy-url URL]`.
- Categories, age rating (4+), free price, all territories, App Review contact/notes,
  copyright, no IDFA: `uv run --with pyjwt --with cryptography --with requests python3 app/scripts/asc-store-setup.py`
  (`check` prints the current values).
- App Privacy is "Data Not Collected" (set and published in the web UI; the API cannot).
- Screenshots: `cd app && scripts/store-screenshots.sh` (one iPhone 17 Pro Max simulator
  under the simulator lock, Maestro flow `app/e2e/store.yaml`) writes
  `docs/store/screenshots/6.9/` and `6.5/`; upload with
  `ascelerate apps media upload com.skolalabs.harfiyen --folder <dir>`.
- Build: `cd app && scripts/release.sh` runs the fastlane `release` lane under the build lock:
  build number = latest on App Store Connect + 1, signed App Store IPA, uploaded for version
  1.0.0. It never submits for review. Attach it with
  `ascelerate apps build attach-latest com.skolalabs.harfiyen`.
- Content rights (no third-party content) are also set by asc-store-setup.py.
- State on 19 Oct 2026: build 2 (1.0.0) is processed, attached and in a draft submission
  ("Item Ready to Submit"). Build 1 was rejected in processing (ITMS-90683: photo-library
  purpose string), hence the NSPhotoLibrary* strings in app.json.
- The main checkout's node_modules (which a worktree's symlink points at) can be reinstalled
  mid-build; a long release build is safer from a snapshot copy of app/ (`cp -cR` the
  node_modules) inside the worktree's gitignored `.work/`.
- State on 4 Nov 2026: build 3 (1.0.0, main 06ac2b2a) uploaded, attached and submitted for
  review on Yakup's word ("Waiting For Review"). `scripts/release.sh` built and signed it but
  `upload_to_app_store` refused while the version sat in READY_FOR_REVIEW ("You cannot create
  a new version of the App in the current state"); it was exported from the Xcode archive
  (`xcodebuild -exportArchive`, manual signing, profile "Harfiyen App Store") and uploaded with
  `ascelerate builds upload <ipa>`, then `ascelerate apps build attach-latest` and
  `ascelerate apps review submit`.
- 9 Nov 2026: 1.0.0 is live (released 6 Nov). Version 1.0.1 was created only for new keywords
  (`oyun,oyunu,…`; name words dropped), copyright "2026 Yakup Keskin", What's New "Küçük
  iyileştirmeler."; same code as build 3. The release lane now takes the version from
  `expo.version` in app.json instead of a hard-coded 1.0.0. Download counts: sales reports with
  vendor number 94106965.
- Submit for Review only when Yakup says so.

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
