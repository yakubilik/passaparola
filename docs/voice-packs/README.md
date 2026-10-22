# Host voice packs

## #449: the new host voice in both games (22 Oct 2026)

One ticket, two repositories. The voice packs were read on Salure-5986
(Windows, Tailscale 100.117.81.91) through its registered Divan peer: listed,
hashed on Windows and copied (robocopy without move/purge) to
`C:\Users\YakupKeskinBrynQ\projects\_transfer_449`, then fetched over the
peer's `/files` and checked file by file against the Windows hashes. The
originals in `C:\Users\YakupKeskinBrynQ\Documents\Codex\2026-10-17\k\outputs`
were only read. The owner's own transfer, `oyun-sesleri-20261022-175051.zip`
(1,800,287,997 bytes, sha256 `b2b937c63f015fe0d3797ed5ca4d5ad17136485ed3cb2451d3c2e92eb298f76d`),
holds the same 8414 files with the same hashes.

| | Harfiyen (this repo) | Kelime Oyunu |
|---|---|---|
| pack | `kendi_ses_harfiyen`, 7105 files, 34 batches | `kendi_ses_kelime_oyunu`, 1309 files, 7 batches |
| recordings in pack | 3398 mp3 + the same 3398 as wav | 623 mp3 + 623 wav |
| mapped | 3397/3397 lines of `seslendirilecek-satirlar.csv` | 623/623 question ids |
| missing / duplicate | none / none | none / none |
| unknown | `wrong_next` ("Hayır, olmadı. Sıradaki yarışmacıya geçiyoruz."), no line in the app: left out | none |
| old clips | 3397, all moved out, none byte-identical to a new one | 623, all replaced, none identical |
| loudness | -18.9 to -17.5 LUFS, mono 64 kbps | -18.5 to -17.9 LUFS, mono 96 kbps |

Files here: `449-harfiyen-source-inventory.csv` (the whole pack, as hashed on
Windows) and `449-harfiyen-provenance.csv` (each clip: pack file, its hash,
the clip's hash, the hash of the clip it replaced). Kelime Oyunu keeps its own
pair in its `docs/voice-packs/`.

### Commands

Harfiyen, from the repo root:

    python3 tools/import-voice.py <kendi_ses_harfiyen> --replace --backup <folder outside the app>

(regenerates `app/src/voice/clips.generated.ts`, `app/assets/voice/imported.json`
and `app/assets/loudness.json`). Kelime Oyunu:

    python3 tools/import-voice.py <kendi_ses_kelime_oyunu> --backup <folder outside the app>

Checks, in each repo: `cd app && npm test && npx tsc --noEmit`; Harfiyen also
`npm test` at the root (the importer's tests).

### The Kelime Oyunu half

- repository `/Users/dilarakilic/projects/kelime-oyunu`, main at `23a5209`
- worktree `/Users/dilarakilic/projects/.ustabasi/wt/449-kelime-oyunu-voice`,
  branch `ustabasi/449-kelime-oyunu-voice`, three commits on `23a5209`
  (importer and index test; the 623 clips and index; inventory and provenance)
- integrating it after review is a normal merge of that branch into its main
  (`git -C /Users/dilarakilic/projects/kelime-oyunu merge --no-ff ustabasi/449-kelime-oyunu-voice`),
  not part of this repo's merge

### Listened to (Whisper large-v3-turbo, no ear)

All 19 host lines heard as written. Clues and most answers 0.95–1.00; the low
scores are short proper-noun answers the recogniser mishears (Pamir, Cannes,
Volkan Demirel, Zeugma) and, in Kelime Oyunu, the two one-word clues the pack
itself flags (Cömert, Cimri). The pack's own check flags 466 Harfiyen takes
(`sorunlu.json`) for a listen by ear. No source take clips, is silent, or has
more than 0.5 s of silence at the start, 1 s at the end, or 1.2 s inside.
