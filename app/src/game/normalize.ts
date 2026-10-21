// Answer checking, forgiving the way a host would be: case and Turkish
// dotted/dotless I don't matter, nor does a keyboard without Turkish letters.
// Port of js/normalize.js (the web game). The only change: Turkish lower
// casing is done by hand instead of toLocaleLowerCase('tr-TR'), because
// Hermes does not promise locale-aware casing on every device.

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

export function trLower(s: string): string {
  return s.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

export function trUpper(s: string): string {
  return s.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

export function norm(s: unknown): string {
  let str = String(s == null ? '' : s);
  if (typeof str.normalize === 'function') str = str.normalize('NFC');
  return trLower(str)
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[.,!?;:'"’‘`´()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fold(s: unknown): string {
  return norm(s).replace(/[çğıöşü]/g, (c) => FOLD[c]).replace(/ /g, '');
}

export function isCorrect(input: string, answers: readonly string[]): boolean {
  const given = norm(input);
  if (!given) return false;
  const folded = fold(input);
  return answers.some((a) => norm(a) === given || fold(a) === folded);
}

export function isPass(input: string): boolean {
  const n = fold(input);
  return n === 'pas' || n === 'pass' || n === 'passaparola';
}

// Saying any of these passes. "bas" (and "baş") only when said alone: it is
// how the recognizer often writes a short "pas", but also a real word.
const PASS_WORDS = ['pas', 'pass', 'paso', 'passaparola', 'gec', 'geciyorum', 'gectim', 'bilmiyorum'];
const PASS_ALONE = ['bas', 'bass'];
const PAS = ['pas', 'pass', 'paso', 'passaparola'];

/** A single word that is a Pas when the player says it. */
export function isPassWord(w: string): boolean {
  const f = fold(w);
  return PASS_WORDS.includes(f) || PASS_ALONE.includes(f);
}

// The player said Pas: a short phrase with a pass word in it ("pas",
// "pas geçiyorum", "geç"), a longer one ending in one, or "bas" on its own.
export function saidPass(alts: readonly string[]): boolean {
  const first = norm(alts[0] ?? '').split(' ').filter(Boolean);
  if (!first.length) return false;
  // A longer run that ends in "pas" (or "pas geçiyorum"): the host's words,
  // misheard so the echo filter kept them, with the player's Pas after them
  // (#362). Only "pas" itself: "geç" ends many a sentence.
  if (first.length > 3) {
    const [a, b] = first.slice(-2).map(fold);
    return PAS.includes(b) || (PAS.includes(a) && ['gec', 'geciyorum', 'gectim'].includes(b));
  }
  if (first.some((w) => PASS_WORDS.includes(fold(w)))) return true;
  return first.length === 1 && PASS_ALONE.includes(fold(first[0]));
}

// --- Dictation slips -------------------------------------------------------
// The recognizer writes what it heard, not how the answer is spelt:
// "jimnastik" for Cimnastik, "yogurt" for Yoğurt, "Tardigrad" for Tardigrat,
// "3" for Üç. phon() maps both sides to how they sound, and slipDistance()
// allows a few more small slips the longer the answer is.

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

function below1000(n: number): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  if (h) out.push(...(h > 1 ? [ONES[h]] : []), 'yüz');
  if (TENS[Math.floor((n % 100) / 10)]) out.push(TENS[Math.floor((n % 100) / 10)]);
  if (ONES[n % 10]) out.push(ONES[n % 10]);
  return out;
}

/** A whole number in Turkish words: 1923 → "bin dokuz yüz yirmi üç". */
export function numberWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return String(n);
  if (n === 0) return 'sıfır';
  const out: string[] = [];
  let rest = Math.floor(n);
  for (const [size, name] of [[1e9, 'milyar'], [1e6, 'milyon'], [1e3, 'bin']] as const) {
    const k = Math.floor(rest / size);
    rest %= size;
    if (!k) continue;
    if (!(size === 1e3 && k === 1)) out.push(...below1000(k));
    out.push(name);
  }
  out.push(...below1000(rest));
  return out.join(' ');
}

// "1." is "birinci": the ending follows the last word's vowels.
function ordinal(words: string): string {
  const last = words.split(' ').pop()!;
  const v = (last.match(/[aıoueiöü]/g) ?? ['e']).pop()!;
  const suffix = 'aı'.includes(v) ? 'ıncı' : 'ei'.includes(v) ? 'inci' : 'ou'.includes(v) ? 'uncu' : 'üncü';
  const stem = last === 'dört' ? 'dörd' : last;
  const tail = /[aıoueiöü]$/.test(stem) ? suffix.slice(1) : suffix;
  return words.slice(0, words.length - last.length) + stem + tail;
}

/** Digits written out the way they are said: "1. Dünya Savaşı" → "birinci Dünya Savaşı". */
export function spellNumbers(s: string): string {
  return s
    .replace(/(\d+)\.(?=\s|$)/g, (_, d: string) => ' ' + ordinal(numberWords(Number(d))) + ' ')
    .replace(/\d+/g, (d) => ' ' + numberWords(Number(d)) + ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// How a word sounds, spelling aside. Applied to each word of a folded text.
function soundWord(w: string): string {
  let t = w.replace(/j/g, 'c').replace(/w/g, 'v').replace(/q/g, 'k').replace(/x/g, 'ks');
  t = t.replace(/(.)\1+/g, '$1');                // Gauss / Gaus, Allah / Alah
  t = t.replace(/([aeiou])g(?=[aeiou])/g, '$1'); // ğ between vowels is silent: Yoğurt / yoourt / yourt
  t = t.replace(/g$/, 'k').replace(/d$/, 't').replace(/b$/, 'p'); // word-end k/g, t/d, p/b
  return t;
}

/** The sound of a text: lower case, Turkish letters folded, numbers as words, no spaces. */
export function phon(s: unknown): string {
  const n = norm(spellNumbers(String(s == null ? '' : s)));
  return n.split(' ').map((w) => soundWord(fold(w))).join('');
}

// Letters the recognizer swaps for one another cost half a slip, and so does
// an h or y it adds or drops (Viyetnam, Kütaya, Gandi). Vowels are not near
// each other: Kanun / Kanon, Selim / Salim are different words.
const NEAR = new Set(['sz', 'iy', 'td', 'kg', 'pb', 'vf']);
function subCost(a: string, b: string): number {
  if (a === b) return 0;
  return NEAR.has(a + b) || NEAR.has(b + a) ? 0.5 : 1;
}
const indelCost = (c: string) => (c === 'h' || c === 'y' ? 0.5 : 1);

/** Edit distance where near letters (s/z, i/y, t/d, k/g, p/b, v/f) and a lost h or y count half. */
export function slipDistance(a: string, b: string): number {
  let prev = [0];
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + indelCost(b[j - 1]);
  for (let i = 1; i <= a.length; i++) {
    const cur = [prev[0] + indelCost(a[i - 1])];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + indelCost(a[i - 1]), cur[j - 1] + indelCost(b[j - 1]), prev[j - 1] + subCost(a[i - 1], b[j - 1]));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Slips forgiven for an answer that sounds `len` letters long. */
export function slipAllowance(len: number): number {
  if (len <= 4) return 0;      // Kalp / Kalıp, Bal / Bala stay apart
  if (len <= 7) return 0.5;    // one near letter: Tasmanya / Tazmanya
  if (len <= 10) return 1;     // one slip: Mutasyon / Mutasiyon, Malazgirt / Malazgirtte
  return 2;
}

/** The heard words sound like the answer, a dictation slip or two aside. */
export function soundsLike(input: string, answer: string): boolean {
  const a = phon(answer);
  const h = phon(input);
  if (!a || !h) return false;
  if (a === h) return true;
  // A number is a number: 1920 is not 1923.
  if (/\d/.test(answer) || /\d/.test(input)) return false;
  const allow = slipAllowance(a.length);
  if (!allow || Math.abs(a.length - h.length) > Math.ceil(allow)) return false;
  if (subCost(a[0], h[0]) >= 1) return false;  // the first sound is the one the player is sure of
  return slipDistance(a, h) <= allow;
}

export type Verdict = 'correct' | 'wrong' | 'pass';

// The pieces of what was heard that may hold the answer: any guess, any word,
// and any two or three words in a row ("cevap Ankara", "Reşat Nuri Güntekin").
function spokenPieces(alts: readonly string[]): string[] {
  const pieces = new Set<string>();
  alts.forEach((alt) => {
    const w = norm(alt).split(' ').filter(Boolean);
    if (w.length) pieces.add(w.join(' '));
    for (let i = 0; i < w.length; i++) {
      pieces.add(w[i]);
      if (i + 1 < w.length) pieces.add(w[i] + ' ' + w[i + 1]);
      if (i + 2 < w.length) pieces.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
    }
  });
  return [...pieces];
}

// Speech recognition gives a few guesses, often with extra words around the
// answer. Exactly right wins, then a Pas, then an answer a dictation slip away.
export function judgeSpoken(alts: readonly string[], answers: readonly string[]): Verdict {
  const pieces = spokenPieces(alts);
  if (pieces.some((p) => isCorrect(p, answers))) return 'correct';
  if (saidPass(alts)) return 'pass';
  if (pieces.some((p) => answers.some((a) => soundsLike(p, a)))) return 'correct';
  return 'wrong';
}

/**
 * Lone letters: the start of a word iOS has only begun ("a" of "Ay", after a
 * long silence often its utterance's final too), or one it spelled out ("a
 * a"), not an attempt. No answer is a single letter; a digit is a number ("3"
 * for Üç) and counts.
 */
export function isFragment(text: string): boolean {
  const ws = norm(text).split(' ').filter(Boolean);
  return ws.length > 0 && ws.every((w) => /^[a-z]$/.test(fold(w)));
}

/** What the listener knows about heard words: see Heard in voice/listener.ts. */
export type HeardHow = { duringHost: boolean; hostLike?: boolean; hostNear?: boolean; hostWords?: readonly string[] };

/**
 * `heard` is what the host is saying: its words from the start of one of them,
 * in a row, however iOS split or joined them ("ay" of "aydınlık", a word only
 * begun, or "istanbul u üç"). `hostWords` are the host's words, folded.
 */
export function hostSays(heard: string, hostWords: readonly string[]): boolean {
  const said = fold(heard);
  if (!said) return false;
  return hostWords.some((_, i) => hostWords.slice(i).join('').startsWith(said));
}

/**
 * The verdict on spoken words, or none. With iOS voice processing off (19 Oct
 * 2026) the mic hears the loudspeaker, so words heard while the host talks (or
 * just after) may be the host's, misheard so the echo filter kept them:
 * - a Pas is judged at once;
 * - so is the right answer word for word, unless the host is saying those very
 *   words (hostSays): the player's answer said over the reading is never the
 *   host's because it looks like a host word ("Dörtlük" over "dört dizeden",
 *   #342 again after #393, #405);
 * - other words like the host's (hostLike) are no verdict at all;
 * - a right answer a dictation slip away is judged at once;
 * - a lone letter (isFragment) is no verdict, with or without the host;
 * - a wrong answer is 'hold': judged once the host is quiet (#342, "Merkür"
 *   said over the Mars clue), but only when it looks like the player's attempt
 *   at this letter: one to three words, the first starting with the letter
 *   (every answer does, #339), none of them a slip away from a host word
 *   (hostNear). Anything else heard over the host is dropped.
 */
export function judgeHeard(alts: readonly string[], answers: readonly string[], letter: string, how: HeardHow): Verdict | 'hold' | null {
  const verdict = judgeSpoken(alts, answers);
  // A lone letter is never a wrong answer, over the host or not (#438).
  if (verdict === 'wrong' && isFragment(alts[0] ?? '')) return null;
  if (!how.duringHost) return verdict;
  if (verdict === 'pass') return verdict;
  if (verdict === 'correct' && spokenPieces(alts).some((p) => isCorrect(p, answers) && !hostSays(p, how.hostWords ?? []))) return verdict;
  if (how.hostLike) return null;
  if (verdict === 'correct') return verdict;
  const first = norm(alts[0] ?? '').split(' ').filter(Boolean);
  // The word's own first letter, heard alone before it ("a armut"), is not a word of its own.
  while (first.length > 1 && isFragment(first[0])) first.shift();
  const attempt = first.length >= 1 && first.length <= 3 && first[0].length >= 2 && fold(first[0])[0] === fold(letter)[0];
  return attempt && !how.hostNear ? 'hold' : null;
}

/**
 * How soon heard words can be judged. 'now': a right answer or a Pas, no need
 * to wait (unless the Pas could still grow into the answer, "pas" → "Pasifik").
 * 'partial': the start of a longer answer ("Reşat" of Reşat Nuri Güntekin),
 * worth a longer pause. 'settle': wait until the words stop changing.
 */
export function spokenPace(alts: readonly string[], answers: readonly string[]): 'now' | 'partial' | 'settle' {
  const v = judgeSpoken(alts, answers);
  const heard = phon(alts[0] ?? '');
  const grows = answers.some((a) => { const k = phon(a); return k.length > heard.length && k.startsWith(heard); });
  // Another guess has the whole answer while the best one has only its start
  // ("Sezen" and "Sezen Aksu"): wait for the words to settle (#358).
  if (v === 'correct') return grows && judgeSpoken(alts.slice(0, 1), answers) !== 'correct' ? 'settle' : 'now';
  if (v === 'pass') return grows ? 'settle' : 'now';
  return grows && heard.length >= 3 ? 'partial' : 'settle';
}

// A typed answer: "pas" is a Pas, otherwise right or wrong.
export function judgeTyped(input: string, answers: readonly string[]): Verdict {
  if (isPass(input)) return 'pass';
  return isCorrect(input, answers) ? 'correct' : 'wrong';
}
