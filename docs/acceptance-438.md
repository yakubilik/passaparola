# #438 voice repair: real-iPhone acceptance status

Status (22 Oct 2026, 16:18 CEST): **build and installation established, acoustic trials not performed.**

## Facts, kept apart

| What | Evidence | Result |
|---|---|---|
| Source | main `929c66e` (merge of `2e62a5a`); the `app/` tree of main equals `2e62a5a` (`git diff 2e62a5a 929c66e -- app` is empty) | — |
| Tests | `cd app && npm test -- --watchAll=false && npx tsc --noEmit` on `2e62a5a`: 47 suites, 501/501, 5:04; tsc OK | fake recognizer and fake audio only |
| Build | Delivery build `~/projects/.ustabasi/builds/harfiyen/Harfiyen.app`, 21 Oct 23:00, Release, `CFBundleVersion` 2; the binary contains the native patch identity `harfiyen-438-route`; `main.jsbundle` contains the trace (`harfiyen-voicetrace/1`) | the patch is compiled in |
| Installation | `devicectl device info apps` on Yakup iPhone (4A493A86-…): `com.skolalabs.harfiyen` 1.0.0 (2); the delivery log records INSTALLED (21 Oct 23:01, retry 22 Oct 08:01) | installed |
| Launch | `devicectl device process launch … -- -harfiyenSelfTest 1` at 16:17: refused, *device locked* (FBSOpenApplicationErrorDomain 7) | not launched |
| Trace | `Documents/harfiyen-voicetrace.json`: absent (the build has not run with the trace yet); the only file is the 19 Oct self-test log from the old build | none |
| Host-only trials (≥ 40 passages, 3 rounds, ~30/60/85 % volume) | — | **not performed** |
| Short words (30 × Ay/Su/El/Un/Ok, overlap, 20/45/65 s idle, ≥ 29/30) | — | **not performed** |
| Normal / Pas / two-word / wrong trials, speech end → verdict p50/p95 (≤ 1000 ms) | — | **not performed** |

## What the session on the phone needs

The phone unlocked and on the table near the Mac, Harfiyen in front, about
20 minutes with Yakup speaking:

1. The host-only part runs by itself: `-harfiyenSelfTest 1` plays three
   rounds and answers itself (its verdicts are audio-state evidence only, not
   recognition); Yakup sets the volume to about 30 %, 60 % and 85 %, one round each.
2. Then `-harfiyenSelfTest trace`: Yakup plays and says the answers (Ay, Su,
   El, Un, Ok, with waits of 20, 45 and 65 s, over the host and after it), Pas,
   a two-word answer and some wrong words.
3. The trace (`Documents/harfiyen-voicetrace.json`) is copied off with
   `devicectl device copy from` and summarised here: counts, misses,
   latencies, route, volume, `nativePatch`. Transcripts stay off git.
