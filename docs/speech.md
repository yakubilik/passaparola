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
| 6 | **Continuous mode, interim results** | Game and test: `continuous: true`, `interimResults: true` (`shouldReportPartialResults`). Answers are judged on interim results: a right answer or a Pas at once, others after `SETTLE_MS` (700 ms) without change; lone letters are incomplete and never judged (#438, "Utterance states" below). On iOS 18+ the library marks a result final when `speechRecognitionMetadata.speechDuration > 0` (Apple's end of an utterance), not only when the task finishes, and the next transcript starts empty; the listener then starts counting words from zero (`used = 0`). Such a final may hold only the first letter of the word (after a long silence) and is not waited for: nothing depends on a final arriving. Mic check: `continuous: false` (the library stops after 3 s of no results). | Partial results arrive while speaking; `isFinal` when the task finishes. iOS 18 changed continuous recognition to finish utterances inside one task (library "iOS 18 hack", Apple forum thread). | A final or settled lone letter was judged wrong (#438). → Incomplete state. | [shouldReportPartialResults](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/shouldreportpartialresults), [forum 762952](https://forums.developer.apple.com/forums/thread/762952) |
| 7 | **Apple's ~1-minute limit per request (server)** | Only for server recognition (after the on-device fallback, row 1): a request is renewed after `REQUEST_REFRESH_MS` (45 s) at the first quiet moment (no result for `QUIET_MS` = 1 s, nothing settling) and at `REQUEST_MAX_MS` (55 s) regardless of the player (`checkAge`), never while a host clip or a cue sounds (row 3a). An on-device request is never renewed; if iOS ends one on its own after `LIMIT_SEEN_MS` (50 s) anyway, the tr-TR recognizer was not on-device after all and the time limit applies from then on. | "Plan for a one-minute limit on audio duration" for server recognition; at the limit the task ends with an error / final result and the library emits `end`. On-device has no such limit (WWDC19 256). | Was **after the fact**: iOS cut the request at about a minute, possibly mid-answer, and the listener reopened it 250 ms later. → Renewed before the limit, in silence. | [SFSpeechRecognizer — Create a great user experience](https://developer.apple.com/documentation/speech/sfspeechrecognizer) |
| 8 | **iosVoiceProcessingEnabled** | `true` (game, mic check; switchable on the test screen). The library calls `setVoiceProcessingEnabled(true)` on the engine's input and output nodes: Apple's echo cancellation, so the host and cues coming out of the loudspeaker are not heard as answers (#337). The patch (app/patches) gives a rebuilt engine the same voice processing, switches its ducking of other audio to the minimum, and keeps the engine when a route change leaves the ports as they were. | Voice processing on the I/O unit does echo cancellation, noise suppression and automatic gain; it can lower other playback (README note), and it puts a session in mode `default` into `voiceChat` (seen on the phone, row 9). | It was **off** from 19 Oct 2026 (ea5bc9c) to #438: on the phone it set off an engine rebuild every second and stepping volume (docs/selftest/2026-10-19-1826-phone.json). → On again, with the cause of the loop fixed ("Echo cancellation and a steady volume" below). Its effect on quiet short words can be measured with the test screen (switch "Yankı engelleme"). | [setVoiceProcessingEnabled](https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:)), README "feedback from the speakers" |
| 9 | **Audio session category / mode** | `playAndRecord`, mode `voiceChat`, options `defaultToSpeaker`, `allowBluetooth`, `mixWithOthers`; set once when a round or the mic check starts (`prepareAudio` → `setVoiceSession`), before the round's first sound, the same values passed with every `start()` so the library's own `setCategory` changes nothing (#350). | `playAndRecord` for simultaneous input and output; `defaultToSpeaker` routes to the loudspeaker instead of the receiver. A category / mode change is a route change; upstream, the library rebuilds the engine on every route change (without voice processing) and stops on an interruption. The library's default mode `measurement` would change loudness; `voiceChat` puts the output on the call-volume path. | Was `default` (#350, #355), which voice processing switched to `voiceChat` at every engine start and back at every release, under whatever was playing. → `voiceChat` from the start (#438): one output path for the whole round. | [playAndRecord](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord), [defaultToSpeaker](https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/defaulttospeaker) |
| 10 | **'end' / 'error' events and restart policy** | `abort()` → `error: aborted` then `end`. A planned renewal (row 7) ignores both and starts the next request at its `end`; a late `end` of a dropped or closed request is not taken for the new one's. An `end` iOS sends on its own (interruption, limit, long silence) delivers what was pending and reopens the mic after 250 ms, or once the game is silent (row 3a). `no-speech` and `aborted` are not shown; `not-allowed` / `service-not-allowed` (after the server fallback) stop the mic and say why. | Library: every task end goes through `reset()` → one `end`; errors map kAFAssistantErrorDomain / kLSRErrorDomain codes to `no-speech` (1110), `network` (1101/1107), `busy` (1100), `service-not-allowed` (102/201), `not-allowed` (1700). | Restarts were only reactive. → Planned renewals (7), stale-`end` guard; none while the game sounds. A route change that keeps the input and output ports no longer rebuilds the engine (patch, #438). | `ios/ExpoSpeechRecognitionModule.swift` (`handleRecognitionError`, `abort`) |
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
loudspeaker, is judged as the player's answer. With voice processing
turned off (ea5bc9c, 19 Oct, until #438 turned it on again) the mic heard
everything the phone played, and only text filters kept the host out of the
answers. They stay as the second line behind echo cancellation.

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
word for word counts unless the host is saying those very words (`hostSays`:
the host's words from the start of one, in a row, "zagor" of "Za-Gor-Te-Nay"
or "ay" of "aydınlık"), a right answer a slip away counts unless `hostLike`,
a wrong answer is held and judged the moment the host stops (#342), but only
for one to three words starting with the question's letter and none of them
`hostNear`; anything else is dropped. In the listener a pass word that starts
or ends a host word is echo, and so is any piece (three letters or more) of a
longer host word, except the words of a right answer to the clue being asked
the host is not saying itself; the start of a longer answer ("harf" of Harf
Devrimi) is not marked handled, so the answer is whole when the rest comes.

**#405: a right answer over the host was dropped again.** Until then the
echo rules ran before the answer: "Aşk-ı Memnu" said over its own clue
("...yasak aşkını anlatan romanı") reached the round as "ı memnu" ("aşk" is a
piece of "aşkını", `isEcho`), "Anı" not at all ("anı" of "tanık"), and
"Dörtlük" over "dört dizeden" was `hostLike` and dropped by `judgeHeard`.
The #342 audio test caught it in the rounds that draw Aşk-ı Memnu.
`regressions/voice.test.tsx` now says the right answer over the reading of
every clue of every level, alone and after half the clue in the mic: all are
judged correct except Zagor, whose clue says "Za-Gor".

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

**Voice processing back on (#438).** The proposal that stood here (echo
cancellation on, the session in a chat mode once before the first sound,
the engine not rebuilt for voice processing's own configuration changes,
the ducking kept off) is implemented: see "Echo cancellation and a steady
volume" below. The text filters stay as the second line.

## Utterance states (#438)

**Report (Yakup, 21 Oct 2026):** after a long wait a spoken word can be
reduced to its first letter and graded wrong; "Ay" and other two-letter
words are hard to get recognised; host speech still now and then becomes an
answer.

**Reproduction, before the fix (main e59de5c).** After a quiet spell iOS
writes the start of a word alone: the interim "a", and often the
utterance's final (iOS 18's `speechDuration` final, row 6) with just "a",
before the word or instead of it. `listener.ts` delivered both: the interim
after `SETTLE_MS` (700 ms) without change, the final at once
(`onResult` → `deliver`), and `judgeHeard` passed it to `judgeSpoken` with
no guard when the host was quiet: "a" for Ay is wrong. The word that came
next ("ay") then belonged to the next question. Driven tests, red on that
tree: `regressions/voice.test.tsx` "#438: after a long wait a spoken word is
reduced to its first letter and graded wrong" (20 s of silence, "a" interim,
its final, then "ay": `yanlış` instead of `sırada` then `doğru`) and 50 of
the 63 cases of `src/voice/__tests__/utterance.test.ts` (Ay, Su, El, Un, Ok
after 1, 20, 45 and 65 s of silence, on-device and on the servers with the
request renewed or ended by iOS; evolving, delayed and revised results;
isolation, two words, numbers, Pas).

A second hole found with it: whether an utterance's final counts as "over
the host" (`uttDuringHost`) was kept from the first word of the growing
result until a final came. With no final for a long while, a wrong answer
said long after the host stopped, whose final came at once, was taken for
the host's and held or dropped.

**What is heard is in one of these states** (listener.ts):

| State | What it is | Becomes |
|---|---|---|
| incomplete | Lone letters (`isFragment` in normalize.ts: every word one letter, not a digit) that are neither a right answer nor a Pas | an attempt, when words that complete it come (an interim letter is in the same growing result; a final letter is put in front of every result until its attempt is delivered: "a" + "y" is "a y", right for Ay); dropped without a verdict after `FRAGMENT_MS` (3 s) with nothing after it, its words then handled; dropped at `clueStarts` (never the next question's) |
| attempt | Words that settle (`SETTLE_MS`, `PARTIAL_MS` for the start of a longer answer), a right answer or a Pas (at once), or a final | delivered once to the round (`judgeHeard`): a verdict, a held wrong over the host, or none |
| uncertain | A final with no interim before it in the utterance whose best guess was all the host's words (the other guesses only moved up), or whose three or more guesses share no word: iOS guessing at noise (seen on the phone at request starts, 22 Oct) | dropped without a verdict unless it is a right answer or a Pas; a short answer said once keeps its own best guess and agreeing guesses, so it is judged |
| consumed | The delivered utterance's later words and revisions (`LATE_MS`), its final whenever it comes, and anything before the next clue | dropped; new words after a pause start a new utterance (and reset "over the host" for its final) |

A lone letter never waits for anything else: the words after it are judged
as soon as they would be without it (a right answer at once, a wrong one
after `SETTLE_MS`), so short answers are not delayed and nothing guesses
the expected answer. Nothing waits for a final either: in continuous mode
it may never come. `judgeHeard` also refuses a lone letter as a wrong
answer on its own (defence in depth), and for the "held wrong over the host"
check ignores lone letters before the word ("a armut"). Two-letter answers
(Ay, Su, Öd, Pi, Ud, Uç) and digits ("3" for Üç, "F1", "U2", "ilk 11") are
complete words and judged as before.

**Checked by** (fake recognizer, not the phone's recognizer):
`src/voice/__tests__/utterance.test.ts` (63 cases) and the two #438 tests in
`regressions/voice.test.tsx`; every earlier complaint test and the echo
corpus (`voiceEcho*.test.ts`) unchanged and green.

## Short words on the phone (#455)

**Report (Yakup, 22 Oct 2026, main 4d5c2e0c on Dilara's iPhone):** short
spoken words (2-3 letters: "pas", short answers) are not understood.

**Real results from the phone** (trace mode, `phone-2026-10-22.json` and
`phone-2026-10-22-dilara.json` in `src/voice/__tests__`, results and host
lines only):

| Said | What iOS returned | Where it went |
|---|---|---|
| "Pas" (Dilara, 23:53) | one final `" Pas"`, no interim before it, 1.4 s after the host stopped | judged a Pas (the final-only path) |
| "Aç" for Ağaç (Yakup, 17:57) | interim `"Aç"` 710 ms after "... A ile başlıyor." stopped, its final 1.7 s later, then `" Aç"` again | **no verdict**: inside `ECHO_TAIL_MS`, `hostNear` (listener.ts) took "aç" for a slip of the host's letter name "a"; judged wrong only when said again |
| "Pas" (Yakup, 23 Oct 20:34, this branch, AirPods off) | interim `" Pas"` 1.2 s after the clue, its final 1.7 s later | a Pas |
| "Ay" for Ay (same session) | one final `" Ay / Ay ay / I"`, no interim, 3.2 s after the clue | right (the final-only path) |
| "Cam" for Cam, "Diş" for Diş (same session) | interim with the word twice: `" Cam cam"`, `" Diş diş"`, then the final | right |
| "Çığ" for Çığ (same session) | interims `" ÇÇÇÇ"` → `" ÇÇÇÇÇ"` → `" ÇÇÇÇÇÇ"`, final `" ÇÇÇÇÇÇ / ÇÇÇÇCÇÇ / ÇÇÇÇÇ"` | **graded wrong**: `isFragment` (normalize.ts) took one letter written over and over for a word |
| "Far" → "Fare", "İn" → "İnek", "Dan" → "Danimarka", "Çak" → "Çakal" | the start of the word as an interim, the whole word 4-200 ms later | judged on the whole word |

**Fixed:** one letter written three or more times ("ÇÇÇÇ") is
incomplete, like a lone letter: no verdict, never a wrong answer (no answer
is spelt that way). And for host words of one or two letters (the letter names of "...
ile başlıyor") only a same-length slip counts in `hostNear` ("me" → "ma" is
the host, "aç" after "a" is the player). Replayed by
`phoneReplay.test.ts` (red on 4d5c2e0c, green after).

**Not measured:** Su, Un, Kar, Buz (Yakup's session reached J). The words
test below measures them without a person.
`-harfiyenSelfTest words` (`src/voice/wordsTest.ts`, run with
`app/scripts/words-test.sh <device id>`) plays `say -v Yelda` recordings of
them on the phone's loudspeaker into a mic request with the game's options
and logs every result. What stopped it on 23 Oct:

- Feeding the files to the recognizer directly (expo-speech-recognition's
  `audioSource`) gave, for every file including six words in a row,
  on-device and on the servers, only iOS's no-speech guess: an interim
  `"Evet"` at about 0.93 s, then a final `"Evet / Hayır / Gönder"`. That path
  hands the recognizer no speech, so the test now goes speaker → mic.
- Launched remotely (devicectl) on a phone that is unlocked but nobody is
  holding, every mic request failed at once with `audio-capture` ("Session
  activation failed", `otherAudioPlaying` true): iOS starts no recording for
  an app that is not in front. The test needs the phone's screen on, with
  Harfiyen in front, for about five minutes.
- 23 Oct, 10:36, with the phone unlocked: the mic opened and the first
  recording played, but the output route was Bluetooth (AirPods connected),
  so the recording went into the earbuds and the phone's mic heard nothing
  (no result at all); the app then stopped running. The test needs no
  Bluetooth audio device connected. Trace mode after it recorded no round.

## Echo cancellation and a steady volume (#438, scope of #439)

**Cause of the loop, read from the library.** On the phone (docs/selftest/
2026-10-19-1826-phone.json) voice processing switched the session from
`default` to `voiceChat`, `rebuilds` rose by one a second and
`outputVolume` stepped 0.8 → 0.9 → 1.0. In expo-speech-recognition every
`AVAudioSession.routeChangeNotification` while a request runs calls
`restartAudioEngineForRouteChange`, whatever the change: the old engine is
let go (the #361 patch turns its voice processing off), a new one is built
with voice processing on. Turning voice processing off and on switches the
session's mode, which is a route change of its own: the next rebuild.

**Fix.**

1. app/patches/expo-speech-recognition: the route-change observer reads the
   previous route from the notification. When the input and output ports
   are the same (by port UID), the running engine is kept (and started
   again if the change stopped it); only a real change of microphone or
   speaker (headphones, Bluetooth, the receiver) rebuilds it, with voice
   processing as before. The native state (`getVoiceProcessingStateIOS`)
   now also counts `routeChanges`, `routeChangesIgnored`, `engineRestarts`,
   the `lastRouteChange` (iOS's reason and whether the ports changed) and
   names the patch (`patch: harfiyen-438-route`).
2. `RECOGNITION_OPTIONS`: `iosVoiceProcessingEnabled: true`, session mode
   `voiceChat`, the mode voice processing puts the session in anyway. It is
   set once, before the round's first sound (`prepareAudio`), and passed
   with every start, so no engine start, release or renewal changes the mode
   under a playing sound. The output is on the call-volume path for the
   whole round; the volume buttons and the Ses setting move it.
3. Ducking stays at the minimum, not advanced (e9eb352); a rebuilt engine
   gets the same voice processing (#361); fresh players per cue (#415) and
   the round's settle order (#355) are unchanged.

**The playback path.** The host's clips and the cues play through
expo-audio's `AVPlayer`s, not through the recognizer's `AVAudioEngine`,
whose output node renders nothing. Whether iOS's voice-processing echo
canceller takes that playback as its reference is not stated in Apple's
documentation; the phone gave no host-echo complaint while voice processing
was on (#337 to 19 Oct), and the echo complaints #391 / #393 came after it
was turned off. Routing the host and the cues through the recognizer's
engine would be the next, larger step if the phone shows the host in the
mic with voice processing on.

**Delivery.** The delivery script regenerates `ios/` (`npm ci`, which
applies app/patches, then `expo prebuild`) only when app.json, the package
files, `assets/`, `plugins/` or `modules/` change, not `patches/`. #438
changes `modules/audio-session-info` (a `build()` call for the evidence
file), so the first delivery after it regenerates `ios/` and compiles the
new patch; derived data is kept. A later change to `patches/` alone would
not reach the phone without such a change.

**Evidence file.** Launched with `-harfiyenSelfTest trace` the app writes
Documents/harfiyen-voicetrace.json (`src/voice/trace.ts`): build and patch
identity, every raw result (all alternatives, interim or final, with
times), the listener's decisions (incomplete, attempt, consumed, dropped),
the round's verdicts by source, the host's lines and the cues (the game's
own sound), and the native audio state once a second (session mode, route,
`outputVolume`, voice processing, engines, route changes). The self-test
modes write it too, their own answers marked `selftest`: those are audio
state evidence only, not recognition.

**Checked by** (fake recognizer and fake audio: what the JS side asks for
and when, not what iOS does): `src/__tests__/voiceProcessing.test.tsx`
(three rounds, many questions, route changes, an interruption, server
renewals: one start per round plus what iOS forces, never while the game
sounds, the same options with voice processing every time, the session's
category and mode set once before any sound; the evidence file's
contents), `roundsAudio.test.tsx`, `regressions/audio.test.tsx`. The Swift
was typechecked against stand-ins for the Expo module types
(`swiftc -typecheck`, iOS 26.2 SDK); it is compiled for real only by the
delivery build.

**Not physically verified.** None of this has run on an iPhone yet. To
measure there, with the delivered build and the evidence file: at least 40
host-only passages over three rounds at about 30 %, 60 % and 85 % volume
with no verdict; voice processing reported on, `outputVolume` steady, no
engine-rebuild loop (`engines` one per round, `routeChangesIgnored` rising
instead of `rebuilds`); 30 spoken short words (Ay, Su, El, Un, Ok) with host
overlap and 20 / 45 / 65 s idle periods, at least 29 right once, no
lone-letter wrong verdict, no double grading or leak; normal answers, Pas,
two-word answers and wrong words; speech end to verdict p50 / p95 over at
least 30 recognised attempts (target p95 ≤ 1000 ms).
