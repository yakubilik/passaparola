# The loud first host line (ticket #355)

**Report (iPhone 17 Pro Max, 19 Oct 2026):** at round start the host's
"İşte sağ cepten sorular çıkıyor efendim" (clip `go`) is very loud and the
volume buttons do not change it. After that, during the round, the buttons
work for everything. The clip itself is normal (`go.mp3`: -18.1 LUFS,
-4.5 dBTP, like every other host clip, `app/assets/loudness.json`).

## Root cause

It is timing, not the file and not the session mode.

What happened when Başla was pressed (before this fix):

1. `useVoiceRound.begin()` called `listener.listen()` → `SR.start()` and
   returned at once. The native `start` runs in a Swift `Task`: it awaits the
   permission checks, then `prepareMicrophoneRecognition` sets the category,
   activates the session, **creates a new `AVAudioEngine`, calls
   `setVoiceProcessingEnabled(true)` on its input and output nodes** and
   starts the engine (`node_modules/expo-speech-recognition/ios/ExpoSpeechRecognizer.swift`,
   `prepareMicrophoneRecognition`, lines ~340–370 and `audioEngine.start()` ~727).
   That takes a few hundred milliseconds.
2. In the same render the round's first `read()` made the host player and
   started `go` right away, so the clip was already playing while step 1
   brought up the voice-processing I/O unit.

What Apple documents about that step:

- Enabling voice processing on an `AVAudioEngine` I/O node switches the
  app's audio I/O to the voice-processing I/O unit (echo cancellation,
  noise suppression, automatic gain): the engine reconfigures
  ([`setVoiceProcessingEnabled(_:)`](https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:)),
  [`AVAudioEngineConfigurationChange`](https://developer.apple.com/documentation/foundation/nsnotification/name/1389078-avaudioengineconfigurationchange)).
- While voice processing is on, the system ducks other audio (everything
  not going through that I/O unit, which includes our `AVPlayer`s); iOS 17
  made the level configurable
  ([`voiceProcessingOtherAudioDuckingConfiguration`](https://developer.apple.com/documentation/avfaudio/avaudioinputnode/voiceprocessingotheraudioduckingconfiguration),
  WWDC23 "What's new in voice processing"). The library README warns about
  the same ("it can lower other playback", see `docs/speech.md` row 8).
- The output volume the buttons control is the session's output volume
  ([`outputVolume`](https://developer.apple.com/documentation/avfaudio/avaudiosession/outputvolume));
  the voice-processing path applies its own gain on top while it comes up.

So the sounds that start after voice processing is up all sit on one path,
ducked and following the buttons, which is what Yakup hears during the
round. The one clip that started before it — the `go` line, together with
the theme still ringing from the "Hazır mısın?" screen — was carried across
the I/O switch at the level it started with: louder than everything after
it, and deaf to the buttons until it ended. That matches the report exactly
(only the first sentence, every round).

Ruled out: the session mode (it is `default`, not `voiceChat`, since #350),
the category switching while the mic is open (set once by `prepareAudio`,
the same values passed to every `start()`), and the file loudness.

## Fix (at the cause: nothing plays across the voice-processing start)

`settleAudio()` in `app/src/voice/engine.ts`, used by the round
(`useVoiceRound.begin/read`), the match's Sıra screen (`useReadyByVoice`)
and the match theme:

1. `prepareAudio()` — the session's category and mode, then active.
2. A theme still sounding is stopped (`sounds.hushCues()`), then the mic
   opens (`listener.listen`).
3. Wait for the recognizer's **`start` event** (`listener.whenUp`). The
   library sends it only after `prepareMicrophoneRecognition` returned, i.e.
   after `audioEngine.start()` with voice processing on. At most
   `MIC_UP_MAX_MS` (1.5 s) so a silent recognizer cannot hold the round.
4. `SESSION_SETTLE_MS` (300 ms) more for the route, ducking and gain to settle.
5. Players made before that are let go (`host.renew()`, `sounds.renew()`),
   so the first line gets a player made on the settled session.
6. The bed starts, and the host's first line plays, fading in over
   `FADE_IN_MS` (`fadeInNext`). The clock is held the whole time.

Coming back from the background reopens the mic (a new voice-processing
start), so the clue read again waits the same way.

Voice processing stays **on**: it is the echo protection of #337/#342, and
the report shows the buttons do control the volume once it is up. The
fix only makes sure no sound straddles its start.

`app/src/__tests__/roundStart.test.tsx` asserts the order on the fake
modules: `mode → category → active → rec:start → rec:up (start event) →
host player created → host clip plays`, at least `SESSION_SETTLE_MS` after
`rec:up`, nothing playing between `rec:start` and `rec:up`, and the fade.

## Second safety: Ses in Ayarlar

One gain over the host, the cues and the bed (`setMasterVolume`,
`app/src/voice/sounds.ts`), 0–100 % in steps of 10, default 70 %, saved
with the settings (`volume`). It is applied under the phone volume and moves
a line already playing.

## If it happens again: the diagnostic

Ayarlar → Mikrofonu dene: under the mic check, **SES OTURUMU** shows the
live `AVAudioSession` category with its options, mode, output and input
route, `outputVolume` (moves with the buttons), the game's Ses level and
whether the mic is open. It is read every 0.5 s by a small local Expo module,
`app/modules/audio-session-info` (read only; autolinked from `modules/` at
prebuild). A screenshot of it during the problem tells which path the sound
is on.

# Round 1 fine, round 2 loud phone and quiet game (ticket #361)

**Report (19 Oct 2026, build with e9eb352 and #357):** level 1 sounded right;
from level 2 on the old symptom was back: the phone volume jumps to call
level and the game's own sound gets quiet.

## What differs between round 1 and round 2

The JS side does the same thing every round (one recognizer start with the
same options, the session category set once, nothing ever calling
`setIsAudioActiveAsync(false)`); `app/src/__tests__/roundsAudio.test.tsx`
proves that on the fakes. The difference is native, in what one request
leaves behind and in a path that only sometimes runs:

1. **Route-change rebuild without voice processing.**
   `node_modules/expo-speech-recognition/ios/ExpoSpeechRecognizer.swift`
   (58.0.0 with the e9eb352 patch): an `AVAudioSession.routeChangeNotification`
   while a request is starting or running (observer at line 762,
   `handleAudioRouteChange` line 775) calls `restartAudioEngineForRouteChange`
   (line 799), which makes `AVAudioEngine()` (line 812) and starts it through
   `prepareEngine` **without `setVoiceProcessingEnabled(true)` and without
   `voiceProcessingOtherAudioDuckingConfiguration`**. Whether a round runs on
   the first engine (voice processing on, the call-style volume path) or on a
   rebuilt one (none of it) therefore depends on whether iOS happens to post a
   route change while that round's request comes up, which is not the same for
   the first voice-processing start of the app and for later ones.
2. **The old engine is let go with voice processing still on.** `reset()`
   (line 536) and `stopListening()` stop and drop the engine at the end of a
   round (`audioEngine = nil`, lines 554 / 529) but never switch voice
   processing off, so the next round's engine brings up its voice-processing
   I/O next to one still held by the old engine instead of from the clean state
   the first round started from. The ducking configuration was also only set
   before `audioEngine.start()`, i.e. before the voice-processing unit is
   initialised.
3. **expo-audio can deactivate the session at a round start.**
   `settleAudio()` let every idle player go with `remove()`
   (`app/src/voice/engine.ts` → `Sounds.renew` / `Host.renew`). In
   `node_modules/expo-audio/ios/AudioModule.swift` `remove` (line 269) calls
   `unregisterAudioSessionActivityKeeper`, and when the last player that kept
   the session active is gone and nothing plays, `deactivateSession()` (line
   956) calls `AVAudioSession.setActive(false)` 100 ms later, under the open
   mic. In the usual flow the host's first line starts within those 100 ms,
   so it is a race, not the steady cause; `src/voice/__tests__/retire.test.ts`
   shows the deactivation with the old code.

Items 1 and 2 are read from the library source, not observed on the phone:
the new per-round diagnostic line below shows which engine each round really
had (voice processing on/off, ducking, rebuild count).

## Fix

- `app/patches/expo-speech-recognition+58.0.0.patch`: one
  `configureVoiceProcessing` for the first engine and for a rebuilt one (voice
  processing on input and output, ducking off: no advanced ducking, level min),
  the ducking set again once the engine runs (`applyDucking` after
  `prepareEngine`), voice processing switched off on an engine being let go
  (`releaseVoiceProcessing` in `reset`, `stopListening` and the rebuild), and
  `getVoiceProcessingStateIOS()` reporting what the engine's input node really
  has after start (enabled, advanced ducking, ducking level, engines built,
  rebuilds).
- `app/src/voice/sounds.ts` `retire` / `startedPlaying`: players let go at a
  round start are removed only after a newer player has started, so expo-audio
  always has a player keeping the session active. The session set up by the
  first round stays configured and active for the life of the app.

## Diagnostic: one line per round

SES OTURUMU (the result screen after a voice round, and Ayarlar → Mikrofonu
dene) lists `Tur 1`, `Tur 2`, …: the session category with its options, mode,
phone volume (`outputVolume`), voice processing on/off and the ducking level as
each round found them once its mic was up and settled (`src/voice/roundAudio.ts`),
plus `yeniden kurulum N` when the engine was rebuilt after a route change. A
screenshot of the result screen after round 2 shows rounds 1 and 2 side by side.

## Checked natively on the simulator (#361)

A Release simulator build of this branch with the patched recognizer (iPhone 17,
iOS 26.3) ran the self-test: levels 1, 2 and 3 back to back, voice on, the mic
open all along. `app/e2e/selftest-report.py` on its log:

    round 1 @ 5s:   playAndRecord (mixWithOthers, allowBluetooth, defaultToSpeaker), mode default,
                    outputVolume 0.60, route Speaker; voice processing on, advanced ducking off,
                    ducking min, engines 1, rebuilds 0
    round 2 @ 178s: the same, engines 2, rebuilds 0
    round 3 @ 406s: the same, engines 3, rebuilds 0
    3 round starts; identical: True

A second run after the self-test fixes (`app/e2e/rounds.sh`, Maestro exit 0, a
screenshot of each result screen's SES OTURUMU with its Tur 1/2/3 lines, 28/28
answered in every level) gave the same three identical round starts at 5 s, 180 s
and 407 s. The session never changed after the first round set it up (one change in the whole
log: soloAmbient → playAndRecord at the first round), and no engine was rebuilt.
The simulator says nothing about how loud the iPhone's speaker gets; the same log
from the phone does.

## The self-test

Launch argument `-harfiyenSelfTest 1` (`src/voice/selfTest.ts`): the app plays tarih
levels 1-3 (quick, so nothing is locked and no progress is saved), voice on, each
clue answered right 0.7 s after it was read (what the mic hears is not judged), and
writes the session, the recognizer engine's voice processing and ducking, and every
player's volume to `Documents/harfiyen-selftest.json` every second and at each round
start. Each result screen stays 20 s, scrolled down to SES OTURUMU.

On the iPhone (after the delivery installed the build):

    xcrun devicectl device process launch --device <id> --terminate-existing \
      com.skolalabs.harfiyen -- -harfiyenSelfTest 1
    # about 8 minutes later
    xcrun devicectl device copy from --device <id> --domain-type appDataContainer \
      --domain-identifier com.skolalabs.harfiyen --source Documents/harfiyen-selftest.json \
      --destination ./harfiyen-selftest.json
    python3 app/e2e/selftest-report.py harfiyen-selftest.json

On the simulator: `app/e2e/rounds.sh <Harfiyen.app> <udid> <out dir>` (inside the
simulator lock) runs it with Maestro (`e2e/rounds.yaml`) and screenshots.

# Every sound complaint, tested together (#394)

`app/src/__tests__/regressions/audio.test.tsx` holds one test per sound or
volume complaint from #318 to #362, titled with its ticket and Yakup's words,
each over three rounds in a row (round, result screen, "Tekrar oyna") on the
fake player and recognizer, all in one app life: launch blast (#350), phone
volume ignored and the loud first line (#355), louder every question and lost
cues (#357), broken from round 2 (#361), music too loud and the Müzik setting,
quieter after question 1 and the host never lowered (#337), missing cues
(#342), sound in the background (#318), silent clues without and with a
recording (#362, 20 Oct). A change that brings one of them back fails there,
whichever ticket made it. The silent clue with its recording present is in
`docs/voice-fallback.md`.
