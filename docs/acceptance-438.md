# #438 voice repair: real-iPhone acceptance status

Status (22 Oct 2026, 18:00): **build and installation established; host-only
measured at ≈ 95 % and ≈ 45–50 %, with one phantom wrong verdict found; 11 natural spoken answers measured (9
right, 2 judged wrong); short-word, ≈ 30 %, Pas/two-word and latency trials
not performed.**
The blue-light removal (criterion 6) is on the ticket branch, not yet on the phone.

## Facts, kept apart

| What | Evidence | Result |
|---|---|---|
| Source | main `929c66e` (merge of `2e62a5a`); the `app/` tree of main equals `2e62a5a` | — |
| Tests | `cd app && npm test -- --watchAll=false && npx tsc --noEmit` on `2e62a5a`: 47 suites, 501/501, 5:04; tsc OK | fake recognizer and fake audio only |
| Build | Delivery build, 21 Oct 23:00, Release, `CFBundleVersion` 2: the binary contains `harfiyen-438-route`, the JS bundle the trace | patch compiled in |
| Installation | `devicectl device info apps`: `com.skolalabs.harfiyen` 1.0.0 (2) on Yakup iPhone (4A493A86-…) | installed |
| Launch | 16:17 refused (device locked); 16:29:12 launched with `-harfiyenSelfTest 1` | launched |
| Native identity on the phone | trace header `nativePatch: harfiyen-438-route`, `recognition: { voiceProcessing: true, mode: voiceChat, taskHint: search }` | confirmed on the running app |

## Host-only run, 22 Oct 16:29–16:39 (self-test, 3 rounds)

Self-test mode: the app reads every clue and answers it itself (84
answers, `selftest-answer`); its verdicts prove nothing about recognition.
What counts here is what the real recognizer heard while only the phone
was playing, and what the round's rule (`judgeHeard`, applied offline to
each delivered attempt with the host's words at that moment) would do with it.

- Rounds: 3 completed, 84 clue passages read; 4 recognition requests (one
  per round, plus one at the first round's start).
- Voice processing **on** in every sample; session `playAndRecord` /
  `voiceChat`; route Speaker / built-in microphone throughout.
- Engines: 8 over the run, 2 per round (the start, plus one rebuild at the
  first route change, reason 3 *ports changed*). Route changes with the same
  ports: kept the engine (`routeChangesIgnored` 6). **No rebuild loop**
  (the 19 Oct build rebuilt once a second).
- `outputVolume`: 0.40 at launch (mode `default`, before any round), 1.00
  two seconds later when the session was set to `voiceChat` (before the mic
  opened), 0.95 from 8 s on and through all three rounds. The step is iOS
  switching to the voice-chat volume, which is stored apart from the media
  volume; the app sets no volume. Whether 1.00 → 0.95 was a button press
  is not known. **The run covered one volume only (≈ 95 %), not 30/60/85 %.**
- Recognizer results: 10. Seven are three answer words at 11.5–23.8 s
  (`Atatürk`, `Bayrak`, `Cengiz` → `Cengiz Han`). **Yakup confirmed he said
  them himself** (22 Oct): they are player speech, not host leakage, and they
  were recognised during and right after the host's reading (double-talk).
  The round's rule, applied offline, judges the third (`cengiz`, said as the
  C clue ended) correct; the first two came after the self-test had already
  answered their question and get no verdict (no next-question leakage).
  Speech-end times are not in the trace, so no latency is claimed. Three
  results are iOS's no-speech finals at a round start (`Evet / Hayır /
  Gönder / Tamam` and similar), each *no verdict*.
- Host-only part: from 24 s to the end (≈ 9 min, 81 passages over three
  rounds) the recognizer gave **no result at all** from the host's voice:
  zero answer / pass / wrong verdicts, at one volume (≈ 95 %).

Not yet established: the same at ≈ 30 % and ≈ 60 % volume.

## Second session, 22 Oct 17:28–18:00

**Silent self-test (3 rounds, 84 passages), launched 17:28:42.** Volume as
read from the session: round 1 0.95 (not yet lowered), round 2 0.95 → 0.45
at ≈ 265 s (Yakup lowered it then and heard the game get quieter: the
buttons drive this path), round 3 0.50. So the host-only data now covers
≈ 95 % (two runs) and ≈ 45–50 %; **≈ 30 % was not reached**. Voice
processing on, `voiceChat`, Speaker / built-in mic, 2 engines per round, no
rebuild loop. The recognizer gave 5 results in ≈ 9 min, all finals with no interim
before them, each at the start of a request or right after the host's
opening line: iOS's no-speech guesses (`Evet / Hayır / Siri / Gönder /
Tamam`, `Kapan / Kapat`, `Aç / Murat / Çık`, `İşte / Ara / Kapat / İsterim /
Evet`). Run through the round's rule with the host's words of the moment,
four get no verdict. **One fails:** at 362.8 s (round 3, question
tarih-3-A-1, volume 0.45, host reading its opening line, source main
`929c66e`), `İşte / Ara / Kapat / İsterim / Evet` loses `İşte` as the host's
word, and `ara` is a one-word attempt starting with the question's letter A,
near no host word: `judgeHeard` returns `hold`, i.e. a **wrong verdict from
no player speech** once the host stops. (Self-test rounds skip the verdict,
so the phone did not show it; the trace and the offline rule do.) The same
kind of final in run 1 (16:29) got no verdict only because its words did not
start with the letter. Implementation to resume on: a final with no interim
before it, holding iOS's no-speech vocabulary, must not be an attempt.

**Trace mode, Bilim level 1 (seed 11), 17:38 and 17:44.** Yakup reads this
chat on the same phone: each time he switched to it, Harfiyen went to the
background a few seconds after the first clue (mic closed, engine stopped,
trace paused). No crash (the phone's crash logs have nothing after 19 Oct).
Back in the game at ≈ 17:57 he answered 11 questions naturally:

| Question | Heard (interim → final) | Over the host | Verdict |
|---|---|---|---|
| A (Ağaç) | `Aç`, then `Aç` again | first yes, second no | first: none (near a host word), second: **wrong** |
| B (Böbrek) | `Böbrek` | yes | correct |
| C (Ceviz) | `Ceviz` | yes | correct |
| Ç (Çakal) | `Çak` → `Çakal` | yes | correct |
| D (Deprem) | `Deprem` | no | correct |
| E (Etobur) | `Erik` / `Eric` | no | **wrong** |
| F (Fare) | `Far` → `Fare` | no | correct |
| G (Güneş) | `Güneş` | no | correct |
| H (Horoz) | `Horoz` | no | correct |
| I (Ihlamur) | `Ihlamur` | no | correct |
| İ (İnek) | `İn` → `İnek` | yes | correct |

Every utterance's final came 1.6–2 s after its first interim and was
consumed by the tail rule: no double grading, nothing judged for the next
question, no lone-letter verdict. A right answer is judged on the interim
that completes it (0–1 ms after that result); a wrong one 700 ms after its
last interim (`SETTLE_MS`). **Speech-end → verdict cannot be computed**:
the trace records result times, not Apple's end-of-speech; so criterion 4's
p50 / p95 is not measured. Whether `Aç` was a misrecognised "Ağaç" is not
known yet.

## Not performed

- 30 spoken short-word trials (Ay, Su, El, Un, Ok; overlap; 20/45/65 s idle):
  none yet (the instructions reached the phone only through the chat on it).
- Pas, two-word and deliberately wrong trials; ≥ 30 recognised attempts
  (11 so far); speech-end → verdict p50 / p95, which needs end-of-speech
  times the trace does not record yet.
- Host-only at ≈ 30 % volume.

## Evidence

The raw traces stay off git (they hold transcripts): copied from the phone's
`Documents/harfiyen-voicetrace.json` and `harfiyen-selftest.json` with
`xcrun devicectl device copy from --domain-type appDataContainer
--domain-identifier com.skolalabs.harfiyen`.
