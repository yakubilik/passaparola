# Passaparola (web)

The word-wheel round of the Passaparola quiz in the browser: 29 Turkish letters
in a ring around the contestant, one question per letter, Pas sends it to the
next lap, the clock decides.

    npm start      # http://localhost:5173
    npm test

- One or two players. With two, a wrong answer or Pas hands the turn over and
  stops your clock, as on the show.
- Host mode: one person reads the questions, sees the answer, presses
  Doğru / Yanlış / Pas (keys D / Y / P).
- Camera: your own face in the middle of the ring.
- Sounds are synthesised. Drop clips named `theme, correct, wrong, pas, tick,
  warn, turn, end, win` (.mp3) into `assets/sounds/original/` (gitignored) or
  `assets/sounds/` and they are played instead.
- Questions: `js/questions.js`, 5 sets; `npm test` checks every set covers the
  alphabet and every answer fits its letter.
