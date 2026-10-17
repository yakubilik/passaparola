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

const PASS_WORDS = ['pas', 'pass', 'paso', 'bas', 'passaparola', 'gec', 'geciyorum', 'bilmiyorum'];

export type Verdict = 'correct' | 'wrong' | 'pass';

// Speech recognition gives a few guesses, often with extra words around the
// answer ("cevap Ankara"). Any guess, any word or pair of words may match.
export function judgeSpoken(alts: readonly string[], answers: readonly string[]): Verdict {
  const pieces: string[] = [];
  alts.forEach((alt) => {
    const w = norm(alt).split(' ').filter(Boolean);
    pieces.push(w.join(' '));
    for (let i = 0; i < w.length; i++) {
      pieces.push(w[i]);
      if (i + 1 < w.length) pieces.push(w[i] + ' ' + w[i + 1]);
    }
  });
  if (pieces.some((p) => isCorrect(p, answers))) return 'correct';
  const first = norm(alts[0]).split(' ');
  if (first.length <= 3 && first.some((w) => PASS_WORDS.indexOf(fold(w)) >= 0)) return 'pass';
  return 'wrong';
}

// A typed answer: "pas" is a Pas, otherwise right or wrong.
export function judgeTyped(input: string, answers: readonly string[]): Verdict {
  if (isPass(input)) return 'pass';
  return isCorrect(input, answers) ? 'correct' : 'wrong';
}
