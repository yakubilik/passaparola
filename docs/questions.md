# Harfiyen questions

Harfiyen (the mobile game, design in `docs/design/harfiyen/`) reads its
questions from one JSON file per category in `app/assets/questions/`:

| file            | category | title    |
|-----------------|----------|----------|
| `tarih.json`    | tarih    | Tarih    |
| `cografya.json` | cografya | Coğrafya |
| `bilim.json`    | bilim    | Bilim    |
| `sanat.json`    | sanat    | Sanat    |
| `spor.json`     | spor     | Spor     |

Check them with

    node tools/validate-questions.mjs              # all five files
    node tools/validate-questions.mjs path/to.json # one file or folder

It prints every problem and exits with 1, or prints `OK` and exits with 0.
`npm test` runs the validator's own tests (`test/validate-questions.test.js`).

(The web game in `js/` keeps its own sets in `js/questions.js`; this format is
for the mobile app only.)

## The ring: 28 letters

The Turkish alphabet without Ğ (no good words start with it, and it is never
said on its own):

    A B C Ç D E F G H I İ J K L M N O Ö P R S Ş T U Ü V Y Z

`letter` is always one of these, upper case, written exactly like this
(`I` dotless, `İ` dotted). Files are UTF-8, NFC.

## Format

```json
{
  "category": "tarih",
  "title": "Tarih",
  "levels": [
    {
      "level": 1,
      "questions": [
        {
          "id": "tarih-1-A-1",
          "letter": "A",
          "type": "starts",
          "clue": "Türkiye Cumhuriyeti'nin kurucusu ve ilk cumhurbaşkanı.",
          "answers": ["Atatürk"]
        }
      ]
    }
  ]
}
```

- `category`: the file name without `.json`.
- `title`: what the app shows for the category.
- `levels`: one entry per difficulty level, `level` is 1, 2, 3, 4... and each
  appears once. A category with no questions yet has `"levels": []`.
- `questions`: the pool for that level. The app picks one question per letter
  from it for a round, so a level needs **at least 4 questions for every one of
  the 28 letters** (112 or more) before it is added to the file.
- `type`: `"starts"` — the answer starts with the letter ("A ile başlar");
  `"contains"` — the letter is somewhere in the answer ("İçinde Ö var").
- `clue`: the question as the host reads it, without the "A ile başlar" part
  (the app and the host voice add that from `letter` and `type`).
- `answers`: every accepted answer. The first one is the canonical answer, the
  one shown when the player gets it wrong. The rest are other spellings or
  fuller / shorter forms (`"Fatih"`, `"Fatih Sultan Mehmet"`). The app compares
  answers forgiving case, Turkish letters typed without dots, circumflexes and
  punctuation, so `"Istanbul"` for `"İstanbul"` does not need its own entry.

### Ids

`<category>-<level>-<letter>-<n>`, e.g. `tarih-1-Ç-3`, where `<letter>` is the
ring letter as written above and `<n>` counts from 1 within that letter and
level. The host voice for a clue is recorded as `assets/voice/<id>.mp3`, so an
id never changes once it exists:

- A new question takes the next free `<n>`.
- Fixing a clue's wording keeps the id (and the clip gets recorded again).
- A deleted question's id is not reused; the gap stays.
- A question that moves to another level is a new question with a new id.

## Difficulty

| level | who gets it                                                  |
|-------|--------------------------------------------------------------|
| 1     | Everyone knows it: primary-school knowledge, daily life.     |
| 2     | Most adults know it: secondary-school knowledge, the news.   |
| 3     | Someone who reads or follows the subject knows it.           |
| 4     | A well-read adult has to stop and think.                     |

When in doubt between two levels, pick the harder one.

## Rules for every question

Checked by the validator:

1. Every answer fits its letter under Turkish casing: `starts` answers begin
   with the letter, `contains` answers have it somewhere. `I` and `İ` are
   different letters (`Irmak` is I, `İzmir` is İ), and so are `Ç`/`C`, `Ö`/`O`,
   `Ş`/`S`, `Ü`/`U`. Every spelling in `answers` must fit, not only the first.
2. At least 4 questions for each of the 28 letters in every level.
3. Ids are unique across all files and follow the pattern above.
4. The clue does not contain its own answer, not even with a suffix
   (`Ankara'nın`, `Osmanlılar`).
5. One answer appears only once in a category, across all levels (two
   spellings in the same question are fine).
6. A clue is at most 140 characters.

Up to the writer (the validator can not see these):

7. Turkish, correct and unambiguous: the clue has one clear answer. If a fact
   is disputed or has changed recently, leave it out.
8. Prefer `starts`. Use `contains` only where the letter has no good `starts`
   answer at that level (J, Ö, Ü, Ş, I and similar).
9. The clue fits the category: a tarih clue asks about history, not about
   geography that happens to have a history.
10. The clue is one sentence that reads well aloud: no abbreviations the voice
    would stumble over, no parentheses, no "bu", "şu" pointing at a picture.
11. Do not give away other answers of the same letter and level in a clue when
    it can be avoided.
12. No clue takes a side on religious, political or other matters that divide
    players; stating a fact about them is fine.
