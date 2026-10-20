# Speech recognition in Harfiyen (Apple, tr-TR)

Harfiyen hears spoken answers with Apple's `SFSpeechRecognizer`, through
[expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition)
58.0.0 (`app/node_modules/expo-speech-recognition`, README and
`ios/ExpoSpeechRecognizer.swift`). The code is in `app/src/voice/`:
`listener.ts` (the game's mic: requests, settling, echo of the host),
`recognizer.ts` (the options passed to the library, the mic check) and
`probe.ts` + `app/src/app/speech-test.tsx` (the measurement screen).

This page checks every option and behaviour we rely on against Apple's
documentation and against what the library really does in its Swift code
(it is the library, not Apple, that decides some of them). It was written
for ticket #351, where answers were sometimes heard late or not at all and
short words ("Ay") were missed.

## Audit

| # | Option / behaviour | What Harfiyen does | What Apple (and the library) says | Gap found → fix | Source |
|---|---|---|---|---|---|
| 1 | **On-device vs server** — `supportsOnDeviceRecognition`, `requiresOnDeviceRecognition` | Every request (game, mic check, test screen) sends `requiresOnDeviceRecognition: true`. The library applies it only `if recognizer.supportsOnDeviceRecognition` for the **tr-TR** recognizer (`prepareRequest`), so it is "on when available". If iOS refuses (error `service-not-allowed`, e.g. kLSRErrorDomain 102 "assets not installed"), the listener and the mic check retry the next request on Apple's servers before reporting the mic as off. | `supportsOnDeviceRecognition`: whether the recognizer works without the network. `requiresOnDeviceRecognition`: keep audio on the device; on-device has no network latency and none of the server limits (WWDC19 256: no per-request duration or per-day limits), but its accuracy can be lower than the server's and it has no continuous learning. The library's JS `supportsOnDeviceRecognition()` asks `SFSpeechRecognizer()` **without a locale**, i.e. the phone's own language, so it answers for tr-TR only on a phone set to Turkish. | Was **off** (server only, with its 1-minute and rate limits and network round trips). → On when supported, with server fallback. The test screen shows the mode and lets server mode be measured against on-device. | [supportsOnDeviceRecognition](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition), [requiresOnDeviceRecognition](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition), [WWDC19 256 Advances in Speech Recognition](https://developer.apple.com/videos/play/wwdc2019/256/) |
| 2 | **Task hint** — `iosTaskHint` → `SFSpeechRecognitionRequest.taskHint` | `'search'` (`RECOGNITION_OPTIONS.iosTaskHint`). | `SFSpeechRecognitionTaskHint`: `.dictation` for long free-form speech, `.search` for short phrases such as search keywords, `.confirmation` for short yes/no style commands. The library README suggests `confirmation` for single words that are otherwise held back. Our answers are one word or a short name from an open vocabulary (Merkür, Cimnastik, Reşat Nuri Güntekin), which is what `search` describes; `confirmation` targets a yes/no vocabulary. | Was **unset** (`unspecified`: no hint about the kind of speech). → `search`. The test screen can switch to `confirmation` / `dictation` / `unspecified` per run so the choice can be checked on the phone. | [taskHint](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/taskhint), [SFSpeechRecognitionTaskHint](https://developer.apple.com/documentation/speech/sfspeechrecognitiontaskhint), README "Improving accuracy of single-word prompts" |
| 3 | **contextualStrings** | **One list for the whole round** (a match: the whole match): the pass words (`pas`, `geç`, `pas geçiyorum`) and every answer of the round, shortest first, up to 100 (`contextFor`), set when the round's request starts. In a match the first "Sıra" screen opens the mic with the ready words (`hazırım`, `hazır`, `tamam`, `başla`) and every player's answers, and that request serves the whole match. A new question or a new screen does **not** restart the request; new words passed to `listen()` are used only by the next request iOS forces (row 10). | `contextualStrings`: "phrases that should be recognized, even if they are not in the system vocabulary"; a property of the request, read when recognition starts. Apple recommends a short list of names and terms; the ~100-phrase limit is a practical one. | #351 started a fresh request per question with only that question's answers. Every start rebuilds the library's audio engine (row 3a), which raised the output level question after question and swallowed the answer cues (#357). → Back to one list per round. | [contextualStrings](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/contextualstrings) |
| 3a | **"Keep the session and engine running"** | The recognizer is started once per round (once per match) and replaced only when iOS forces it (rows 7, 10). No start, stop or abort happens while a host clip or a cue is sounding (`listener.busy`, set in `engine.ts`: `host.speaking` or `sounds.cuePlaying`): it is retried every `QUIET_POLL_MS` (100 ms) until the game is silent. Closing the mic (round over, screen left) waits the same way; the mic check and the test screen take the recognizer at once (`listener.release()`). `SFSpeechRecognizer` and the library play no sound on iOS (the chime is Android's / Safari's). | — | The library cannot keep its `AVAudioEngine` across requests: every `start()` runs `reset()` (engine stopped and released, its voice-processing I/O unit with it), then `setupAudioSession` (`setCategory` + `setActive(true)`) and a new `AVAudioEngine` with `setVoiceProcessingEnabled(true)` on the input **and output** nodes. That reconfigures the output path and its ducking of the app's other sound under whatever is playing. #351 did this at every verdict, while the cue played (`CUE_LEAD_MS`): the cue was cut or swallowed and the level jumped each question (#357). → Once per round, and only in silence. | `ios/ExpoSpeechRecognizer.swift` (`startRecognizer`, `reset`, `prepareMicrophoneRecognition`, `setupAudioSession`) |
| 4 | **addsPunctuation** | `false`. | iOS 16+: adds punctuation to the transcription. Answers are compared as words; punctuation would only need stripping. | None (was already off). | [addsPunctuation](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/addspunctuation) |
| 5 | **maxAlternatives** | Game: 5 (all are judged, `judgeSpoken`); mic check: 1 (only shows what was heard); test screen: 5. | `SFSpeechRecognitionResult.transcriptions` is the n-best list, best first; the library truncates it to `maxAlternatives` (default 5). | None. | [transcriptions](https://developer.apple.com/documentation/speech/sfspeechrecognitionresult/transcriptions), README `maxAlternatives` |
| 6 | **Continuous mode, interim results** | Game and test: `continuous: true`, `interimResults: true` (`shouldReportPartialResults`). Answers are judged on interim results: a right answer or a Pas at once, others after `SETTLE_MS` (700 ms) without change. On iOS 18+ the library marks a result final when `speechRecognitionMetadata.speechDuration > 0` (Apple's end of an utterance) and the next transcript starts empty; the listener then starts counting words from zero (`used = 0`). Mic check: `continuous: false` (the library stops after 3 s of no results). | Partial results arrive while speaking; `isFinal` only when the task finishes. iOS 18 changed continuous recognition to finish utterances inside one task (library "iOS 18 hack", Apple forum thread). | None. | [shouldReportPartialResults](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/shouldreportpartialresults), [forum 762952](https://forums.developer.apple.com/forums/thread/762952) |
| 7 | **Apple's ~1-minute limit per request (server)** | Only for server recognition (after the on-device fallback, row 1): a request is renewed after `REQUEST_REFRESH_MS` (45 s) at the first quiet moment (no result for `QUIET_MS` = 1 s, nothing settling) and at `REQUEST_MAX_MS` (55 s) regardless of the player (`checkAge`), never while a host clip or a cue sounds (row 3a). An on-device request is never renewed; if iOS ends one on its own after `LIMIT_SEEN_MS` (50 s) anyway, the tr-TR recognizer was not on-device after all and the time limit applies from then on. | "Plan for a one-minute limit on audio duration" for server recognition; at the limit the task ends with an error / final result and the library emits `end`. On-device has no such limit (WWDC19 256). | Was **after the fact**: iOS cut the request at about a minute, possibly mid-answer, and the listener reopened it 250 ms later. → Renewed before the limit, in silence. | [SFSpeechRecognizer — Create a great user experience](https://developer.apple.com/documentation/speech/sfspeechrecognizer) |
| 8 | **iosVoiceProcessingEnabled** | `true` (game, mic check; switchable on the test screen). The library calls `setVoiceProcessingEnabled(true)` on the engine's input and output nodes: Apple's echo cancellation, so the host and cues coming out of the loudspeaker are not heard as answers (#337). | Voice processing on the I/O unit does echo cancellation, noise suppression and automatic gain; it can lower other playback (README note). | None; kept for #337. Its effect on quiet short words can be measured with the test screen (switch "Yankı engelleme"). | [setVoiceProcessingEnabled](https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:)), README "feedback from the speakers" |
| 9 | **Audio session category / mode** | `playAndRecord`, mode `default`, options `defaultToSpeaker`, `allowBluetooth`, `mixWithOthers`; set once when a round or the mic check starts (`prepareAudio` → `setVoiceSession`), the same values passed with every `start()` so the library's own `setCategory` changes nothing (#350). | `playAndRecord` for simultaneous input and output; `defaultToSpeaker` routes to the loudspeaker instead of the receiver. A category / mode change is a route change; the library rebuilds the engine on a route change (without voice processing) and stops on an interruption. The library's default mode `measurement` (and `voiceChat`) would change loudness. | None. | [playAndRecord](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord), [defaultToSpeaker](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/defaulttospeaker) |
| 10 | **'end' / 'error' events and restart policy** | `abort()` → `error: aborted` then `end`. A planned renewal (row 7) ignores both and starts the next request at its `end`; a late `end` of a dropped or closed request is not taken for the new one's. An `end` iOS sends on its own (interruption, limit, long silence) delivers what was pending and reopens the mic after 250 ms, or once the game is silent (row 3a). `no-speech` and `aborted` are not shown; `not-allowed` / `service-not-allowed` (after the server fallback) stop the mic and say why. | Library: every task end goes through `reset()` → one `end`; errors map kAFAssistantErrorDomain / kLSRErrorDomain codes to `no-speech` (1110), `network` (1101/1107), `busy` (1100), `service-not-allowed` (102/201), `not-allowed` (1700). | Restarts were only reactive. → Planned renewals (7), stale-`end` guard; none while the game sounds. | `ios/ExpoSpeechRecognitionModule.swift` (`handleRecognitionError`, `abort`) |
| 11 | **Permissions: microphone, speech recognition, Siri & Dictation** | `prepareMic()` asks for both (`requestPermissionsAsync`); refused → "Mikrofon ya da konuşma tanıma izni kapalı…". `isRecognitionAvailable()` false, or error `service-not-allowed` from the server too → "Siri ve Dikte kapalı…" (Ayarlar > Genel > Klavye > Dikte). | `SFSpeechRecognizer.requestAuthorization` states: notDetermined / denied / restricted / authorized; `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription` required. When Siri and Dictation are disabled the recognizer is unavailable / fails with kLSRErrorDomain 201. | None besides the on-device fallback (1). | [Asking permission to use speech recognition](https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition), [requestAuthorization](https://developer.apple.com/documentation/speech/sfspeechrecognizer/requestauthorization(_:)) |
| 12 | **Locale** | `lang: 'tr-TR'`; the library builds the recognizer once per locale and reports `language-not-supported` if tr-TR is missing from `supportedLocales()`. | `SFSpeechRecognizer(locale:)` returns nil for unsupported locales. | None. | [supportedLocales](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportedlocales()) |

## Measuring on the phone: Ses tanıma testi

Ayarlar → **long press** on "Mikrofonu dene ›" (0.8 s). The screen shows:

- **Etkin mod** — on-device or server (Apple's servers), and whether this
  iPhone has on-device recognition (Apple answers for the phone's language;
  see row 1). Switches: on-device on/off, task hint, voice processing.
- **Testi başlat** — ten words, one at a time: Ay, Su, Merkür, Cimnastik, Un,
  Ok, Pas, Ankara, Zürafa, Reşat Nuri Güntekin. Each is its own request
  (its answer as contextualStrings, the game's task hint, session and voice
  processing); the game itself keeps one request for the whole round (#357). Say the word once.
- **Live log** — every interim (`ara`) and final (`son`) result with its
  time since the start of the test, request opening times and errors.
- **Table** — per word: what was heard, **end of speech → first right
  result** (when the game would judge it), **end of speech → final result**,
  and the time a new request took to open. The end of speech is Apple's own:
  the end of the last word's segment in the final result, counted from the
  request's `audiostart`. A `*` marks a final that came only because the test
  stopped the request (iOS 17 and older do not finish utterances in
  continuous mode); its "first right result" figure is still exact.
  A negative "doğru" figure means the word was recognised before Apple's
  segment ended.
- **Summary** — right answers out of ten and the medians.

Run it once with on-device on and once with it off (and, if short words are
still missed, once with `confirmation`), and send the screenshots.

## Volume jumping on every question, cues gone (ticket #357)

Reported on the phone with main c6e257d (19 Oct 2026): the game got louder
at every new question and the correct / wrong / pas cues stopped playing.

**Cause.** #351 renewed the recognition request at every new question, right
after the verdict, while the answer's cue was playing. In
expo-speech-recognition each `start()` (`startRecognizer`) first runs
`reset()`, which stops and releases the `AVAudioEngine` and the
voice-processing I/O unit with it, then `setupAudioSession` sets the session
category again and calls `setActive(true)`, and `prepareMicrophoneRecognition`
builds a new engine with `setVoiceProcessingEnabled(true)` on the input and
the output node. Tearing down and bringing up voice processing reconfigures
the output path (and the ducking of other audio it applies) under the cue
that is playing: the cue is cut off or never heard, and the following host
clip starts on a re-applied output level, as the first host line did before
#355. Done once per question, it happened ten times in ten questions.

**Fix.** One request per round (per match), expecting every answer of the
round as before #351 (rows 3, 3a). It is replaced only when iOS forces it:
an `end` / error, or on Apple's servers the minute limit (row 7); on-device
recognition is never renewed. Nothing starts, stops or aborts the recognizer
while a host clip or a cue sounds; it waits for silence. The session itself
(`setAudioModeAsync`, the category, activation) is set once before the mic
opens and never again in the round. #355's order is unchanged: session, mic
`start`, `SESSION_SETTLE_MS`, then the first host line.

**Checked by** `app/src/__tests__/cuesAcrossQuestions.test.tsx`: ten
questions (correct, wrong, pas in turn) with the fake recognizer and fake
audio; each verdict plays exactly one cue, from its start at the cue level,
and no recognizer or session call happens after the round's start (nor any
while something sounds, through to time up). A second test ends the request
from iOS's side during a cue and checks the new one starts only after the
cue and the next clue. Unit tests in `src/voice/__tests__/listener.test.ts`
("never while the game is sounding", "Apple's time limit").

The Ses tanıma testi screen still opens one request per word: it measures
the recognizer, it is not the game.

## The host's voice in the mic (tickets #391, #393)

Reported on the phone with main fa30073 (20 Oct 2026), and many times
before (#318, #337, #342, #362): the host's own speech, heard through the
loudspeaker, is judged as the player's answer. Since voice processing was
turned off (ea5bc9c, 19 Oct) the mic hears everything the phone plays, and
only text filters keep the host out of the answers.

**Root cause, on main fa30073.** Three holes, found by the echo corpus
(below) run against main's rule:

1. `app/src/voice/useVoiceRound.ts:119` (fa30073) dropped a `wrong` only
   when `host.speaking || listener.hostRecent` held *when the answer was
   delivered*. Host words heard during the reading or in the 800 ms tail
   settle `SETTLE_MS` (or `PARTIAL_MS`) later, often after the tail: they
   were judged wrong. `heard.duringHost`, which the listener sets for
   exactly this, was computed (`hostTime`) and never used. A sample of the
   corpus (every 40th question) gave 587 such wrong verdicts.
2. `correct` and `pass` were never gated at all (same line). Host words iOS
   splits are not caught by the echo filter: "Atatürk olacaktı" heard as
   "ata türk olacaktı" is a right answer (60 in the sample).
3. `app/src/voice/listener.ts:321` (fa30073) let every pass word through
   unless the host said that exact word, so a piece of a host word is a Pas:
   "bas" of "basket", "geç" of "geçildi", "gec" of "geceyi", and the "baş"
   of the "... ile başlıyor" every clue ends with, when iOS writes it ahead
   of the rest (8 in the sample).

A fourth, found while fixing: host words heard while a player's answer was
settling were not marked handled (`listener.ts:496` and `:563`), so the
utterance's final replayed them after the tail as new words ("yen geç
bulutsusu olacaktı" → a Pas).

**Did #362 make it worse?** Not the verdicts above: none of the corpus
hits came from #362's long-run rule in `saidPass` (a run of four or more
words ending in "pas"); every Pas from host speech was a short "bas" or
"geç" piece, through the pass-word exemption from #337. The carried final
(b9870db) can deliver a right answer or a Pas from a final, ungated like the
rest. What did get worse in the same days is #342: c41363d (19 Oct) drops
every wrong answer said over the host, so "Merkür" said over the Mars clue
was lost again, exactly the #342 complaint.

**Fix.** `judgeHeard` in `app/src/game/normalize.ts` makes the verdict for
the round, from what the listener tells it about the words (`Heard`):
heard while the host talks or in the tail (`duringHost`, kept through the
settle and into the utterance's final), like the host's words (`hostLike`:
mostly near host words, joined they are in the host's text, or a single
word that is the start of one), or with a word a slip away from or a piece
of a host word (`hostNear`). Over the host: a Pas counts, a right answer
counts unless `hostLike`, a wrong answer is held and judged the moment the
host stops (#342), but only for one to three words starting with the
question's letter and none of them `hostNear`; anything else is dropped. In
the listener a pass word that starts or ends a host word is echo, and so is
any piece (three letters or more) of a longer host word.

**Checked by** `app/src/__tests__/regressions/voiceEcho.test.ts`: every
HOST_LINES entry (with every question's answers), every "-cevap" line (with
its own and the next question), every clue line whole and cut in half, and
every word of every eighth clue of each level misheard (its first sound
swapped for a near one) and split in two, each heard while the host speaks
and inside the tail after it: no verdict. `regressions/voice.test.tsx`
holds one test per voice complaint in #318-#391, all green together.

**What text cannot do.** The filter only knows what the words are, not who
said them. A host word iOS mishears into a player's word is the player's to
any text rule: "baş" heard as "paş" is a Pas, an answer's slip in its
"-cevap" line still sounds like the answer, a garbled host word that starts
with the question's letter and is near no host word is held as a wrong
answer. The corpus counts these and they stay few, but they are not zero,
and they cannot be: making them zero would drop the player's own "pas" and
"Merkür" said over the host, which #337, #342 and #362 require. A
recognizer that gives the host's words more than the tail late (800 ms) is
also out of the filter's reach. A "bas" said alone over the reading is now
the host's (every clue ends in "başlıyor"); "pas" still passes.

**Proposal (not implemented): voice processing back on, with another fix
for the volume.** Echo cancellation removes the host from the mic before
recognition, which no text rule can. It was turned off because, on the
phone (docs/selftest/2026-10-19-1826-phone.json), with it on iOS put the
session in `voiceChat`, raised `outputVolume` 0.55 → 1.0 step by step and
rebuilt the recognizer's audio engine every second (7 engines in 5 s). Those
are separate faults with their own fixes: set the session to
`playAndRecord` / `videoChat` once, before the first sound of the app, so
voice processing never switches the mode under a playing sound; patch
expo-speech-recognition (app/patches) so one engine with voice processing
lives for the whole round and a configuration change caused by voice
processing itself does not rebuild it; keep the ducking off as e9eb352 did;
then measure on the phone with the existing self-test (one engine per
round, `outputVolume` steady) before relying on it. The text filters stay
as the second line. This belongs to the harfiyen-audio lane (#394), which
owns the audio session.
