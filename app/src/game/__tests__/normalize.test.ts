// Ported from test/normalize.test.js (the web game), plus the typed-answer helper.
import { isCorrect, isPass, judgeSpoken, judgeTyped, trLower, trUpper } from '../normalize';

test('Turkish case rules', () => {
  expect(isCorrect('istanbul', ['İstanbul'])).toBe(true);
  expect(isCorrect('İSTANBUL', ['İstanbul'])).toBe(true);
  expect(isCorrect('IRMAK', ['Irmak'])).toBe(true);
  expect(isCorrect('ırmak', ['Irmak'])).toBe(true);
});

test('keyboard without Turkish letters', () => {
  expect(isCorrect('ogrenci', ['Öğrenci'])).toBe(true);
  expect(isCorrect('Istanbul', ['İstanbul'])).toBe(true);
  expect(isCorrect('sanliurfa', ['Şanlıurfa'])).toBe(true);
});

test('spaces, punctuation and circumflex', () => {
  expect(isCorrect('  bal. ', ['Bal'])).toBe(true);
  expect(isCorrect('ruzgar', ['Rüzgâr'])).toBe(true);
  expect(isCorrect('agri dagi', ['Ağrı', 'Ağrı Dağı'])).toBe(true);
});

test('wrong answers stay wrong', () => {
  expect(isCorrect('', ['Bal'])).toBe(false);
  expect(isCorrect('bala', ['Bal'])).toBe(false);
  expect(isCorrect('kedi', ['Kediler'])).toBe(false);
});

test('pas', () => {
  expect(isPass('pas')).toBe(true);
  expect(isPass('PAS')).toBe(true);
  expect(isPass('Passaparola')).toBe(true);
  expect(isPass('pasta')).toBe(false);
});

test('spoken answers', () => {
  expect(judgeSpoken(['Ankara'], ['Ankara'])).toBe('correct');
  expect(judgeSpoken(['cevap ankara'], ['Ankara'])).toBe('correct');
  expect(judgeSpoken(['an kara', 'ankara'], ['Ankara'])).toBe('correct');
  expect(judgeSpoken(['ağrı dağı'], ['Ağrı'])).toBe('correct');
  expect(judgeSpoken(['pas'], ['Ankara'])).toBe('pass');
  expect(judgeSpoken(['bas'], ['Ankara'])).toBe('pass');
  expect(judgeSpoken(['bilmiyorum'], ['Ankara'])).toBe('pass');
  expect(judgeSpoken(['istanbul'], ['Ankara'])).toBe('wrong');
});

test('typed answers', () => {
  expect(judgeTyped('Pas', ['Ankara'])).toBe('pass');
  expect(judgeTyped('ankara', ['Ankara'])).toBe('correct');
  expect(judgeTyped('izmir', ['Ankara'])).toBe('wrong');
});

test('casing does not depend on the engine locale', () => {
  // "İ" must lower to a plain "i" (no combining dot left behind), "I" to "ı".
  expect(trLower('İSTANBUL')).toBe('istanbul');
  expect(trLower('IRMAK')).toBe('ırmak');
  expect(trUpper('ıspanak')).toBe('ISPANAK');
  expect(trUpper('izmir')).toBe('İZMİR');
  expect(isCorrect('ISPARTA', ['Isparta'])).toBe(true);
});
