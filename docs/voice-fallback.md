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
