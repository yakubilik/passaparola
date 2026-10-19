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
