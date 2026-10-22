# #438 voice repair: real-iPhone acceptance status

Status (22 Oct 2026): **build and installation established; one host-only
run measured at a single volume (≈ 95 %), three spoken answers recognised;
the short-word, volume and latency trials are not performed.**
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

## Not performed

- 30 spoken short-word trials (Ay, Su, El, Un, Ok; overlap; 20/45/65 s idle).
- Normal answer / Pas / two-word / wrong-word trials and speech-end →
  verdict p50 / p95 (≥ 30 attempts, p95 ≤ 1000 ms).

## Evidence

The raw traces stay off git (they hold transcripts): copied from the phone's
`Documents/harfiyen-voicetrace.json` and `harfiyen-selftest.json` with
`xcrun devicectl device copy from --domain-type appDataContainer
--domain-identifier com.skolalabs.harfiyen`.
