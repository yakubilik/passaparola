# Clues without a recording, and "pas" said once (#362)

Reported on the iPhone, 19 Oct 2026: some clues were not read at all, and
"pas" had to be said twice.

## Silent clues

1. **Recordings not in the app.** `app/src/voice/clips.generated.ts` is what
   device builds bundle, and they never run `gen-voice-index.mjs`. After the
   import of Yakup's recordings (76d8f60) it still listed the old set: 232
   recorded clues and answers had no reference, so they were not in the app and
   went to the phone voice. Regenerated on main (ea5bc9c);
   `host.test.ts` ("the committed clip index lists every recording") now fails
   whenever the index and `assets/voice` differ.
2. **The phone-voice fallback could stay silent** (`app/src/voice/host.ts`
   before this ticket): `halt()` sent `Speech.stop()` before every line (line
   110), `tts()` (line 168) ignored `onStopped` and counted a line as started
   when speech was only asked for. An utterance iOS cancelled or never started
   left the host silent until the safety timer, with the clue already shown.
   Now: `Speech.stop()` only while our speech may be sounding; the clue appears
   on iOS's `speakingStarted`; an utterance dropped, failed or not started
   within `TTS_START_MS` (1.5 s) is asked again (from the second try on the
   synthesizer's own audio session); after `TTS_ATTEMPTS` (3) the clue is shown
   and the round goes on. Every event lands in `host.speechLog`.

Checked natively with the speech self-test: launch argument
`-harfiyenSelfTest speech` plays tarih level 2 with every clue recording of the
level withheld, the mic open, and shows the speech-state line
(`TELEFON SESİ · <id>: başladı (1. deneme) · başlayan N · sessiz 0`) on the
game screen. On a simulator (inside the simulator lock):

    app/e2e/speech.sh <Harfiyen.app> <udid> <out dir>

runs `e2e/speech.yaml` (waits for "başladı" on the first clue, screenshots it
and a few clues later) and prints the phone-voice events from the log.

### Simulator result (20 Oct 2026)

Debug simulator build of this branch (with main's ea5bc9c: voice processing off),
JS bundle embedded, on "Harfiyen iPhone 8fee1d5d" (iPhone 17 Pro, iOS 26.3):
`e2e/speech.yaml` passed. The first clue, tarih-2-A-1 (its recording withheld),
was on screen while the phone voice read it, and the line said
`TELEFON SESİ · tarih-2-A-1: başladı (1. deneme) · başlayan 1 · sessiz 0`
(`docs/shots/362/speech-first-clue.png`). Eight clues later it said
`başlayan 8 · sessiz 0` (`speech-later-clue.png`). The log: every clue was asked,
started and finished on the first attempt, with no retry and no silence.
An earlier run on the same build, across 17 clues, gave the same result.

The status line also shows "Duydum: Millet…": with voice processing off, the
mic hears the phone voice reading the clue. The self-test does not judge what
the mic hears; in a real round the listener's echo filter drops the host's words.

The Debug build skips bundling the JS even with `FORCE_BUNDLING=1` (the build
ran with `SKIP_BUNDLING` set), so the bundle was embedded afterwards:

    npx expo export:embed --platform ios --dev false --entry-file node_modules/expo-router/entry.js \
      --bundle-output <Harfiyen.app>/main.jsbundle --assets-dest <Harfiyen.app>

## A clue with its recording, silent (20 Oct 2026, #394)

On the build installed 20 Oct 10:33 (all 3397 clips, `sanat-2-C-2.mp3`
identical to the repo) the C clue sanat-2-C-2 ("Otuz Beş Yaş şiirinin şairi")
was not read at all; the answer line after it ("Cahit Sıtkı Tarancı olacaktı")
was. #362's fix covered only the phone voice (`tts()`); the clip path had no
check that a clip really sounded. `app/src/voice/host.ts` on main (fa30073):

- line 164: `this.player.replace(clip)` — one AVQueuePlayer for every host
  line, its item swapped. expo-audio's `replaceCurrentSource`
  (`AudioPlayer.swift`) pauses the player, which is sitting paused at the end
  of the last item (the clip before just reported `didJustFinish`), and puts a
  new AVPlayerItem in; that item is not `readyToPlay` yet.
- lines 169-170: `seekTo(0)` (an AsyncFunction, run later on another queue) and
  `play()` (`playImmediately`) are sent at once to that item.
- lines 172-173: the line counts as said, and the clue is shown, as soon as
  `play()` was called, whether or not anything sounded.
- line 175 and 186-188: the only check is `end(!p.isLoaded)` after 4 s, which
  `watchLength` replaces as soon as `isLoaded && duration > 0` with an
  `end(false)` at the clip's length + 1.5 s. A clip that loaded but never
  started (isLoaded true, no sound, no end) therefore ended silently on that
  timer, never fell back to the phone voice, and the round went on: the clock
  started and the next line (the answer, after a wrong) played on the next
  `replace()`.

Not reproduced on a device here (no native run in this ticket), so which of the
two native steps swallowed the play is not proven; what is proven is that main
had no path out of "loaded, never sounding" except silence. Fixed at that
point, `host.ts` `playClip`:

- every clip gets a player of its own (`createAudioPlayer`); the one before is
  retired and removed once the new one has started, so the session always keeps
  a player that holds it active (#361, `retire()` in `sounds.ts`);
- `watchStart`: a clip that is neither playing nor moving `CLIP_START_MS`
  (1 s) after `play()` is tried once more on a new player, and after
  `CLIP_ATTEMPTS` (2) read by the phone voice. Each miss is in
  `host.clipFailures`.

`src/__tests__/regressions/audio.test.tsx` ("#362 (20 Oct, sanat-2-C-2)")
plays three rounds with that clue: round 1 with every play after a
`replace()` swallowed by the fake player (`audio.stalls.afterReplace`), round 2
with the C clip's first play swallowed, round 3 with two in a row. On main the
B and C clues are silent in round 1 and the test fails; with the fix every clue
sounds, from its clip or the phone voice, before the wrong answer and its
answer line.

## Clues still without a recording

Each also lacks its `-cevap` answer clip; both are read by the phone voice:

    tarih-2-I-1 tarih-2-I-2 tarih-2-I-3 tarih-2-Ö-3 tarih-2-Ö-4
    tarih-2-Ü-1 tarih-2-Ü-2 tarih-2-Ü-4
    tarih-3-I-1 tarih-3-I-2 tarih-3-I-3 tarih-3-I-4 tarih-3-J-3 tarih-3-J-4
    tarih-3-Ö-3 tarih-3-Ö-4 tarih-3-Ü-1 tarih-3-Ü-2 tarih-3-Ü-3 tarih-3-Ü-4

## "pas" said twice

`app/src/voice/listener.ts`, #358's consumption of a verdict's tail:

- `revises()` treated every judged guess as the utterance still being
  revised, so a second "pas" said after a pause, within `LATE_MS` of a judged
  "pas", was swallowed. Now only words a judged guess had beyond its best guess
  ("aksu" of "sezen" / "sezen aksu") are a revision.
- A final that closes the judged utterance was dropped whole. iOS often gives
  no interim for a short word said alone and puts it only in the utterance's
  final (expo-speech-recognition README, "single-word prompts"), so a "pas"
  said before the previous answer's utterance ended was lost. A Pas or a right
  answer after a pause in such a final now counts.
- With voice processing off (ea5bc9c) the mic hears the whole reading; words
  iOS writes wrong get past the echo filter, and "<those words> pas" was four
  or more words, which `saidPass` (`app/src/game/normalize.ts`) did not take as a
  Pas. A longer run ending in "pas" (or "pas geçiyorum") is now one.

`app/src/__tests__/pasOnce.test.tsx` plays these on a fake recognizer that
behaves like iOS 18+ (final-like utterance ends, the next result afresh, short
words held back): "pas" alone, right after the clue, during it, after a
verdict's tail, after misheard host words — each passes once.
