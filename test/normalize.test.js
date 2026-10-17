const test = require('node:test');
const assert = require('node:assert');
const { isCorrect, isPass } = require('../js/normalize.js');

test('Turkish case rules', () => {
  assert.ok(isCorrect('istanbul', ['İstanbul']));
  assert.ok(isCorrect('İSTANBUL', ['İstanbul']));
  assert.ok(isCorrect('IRMAK', ['Irmak']));
  assert.ok(isCorrect('ırmak', ['Irmak']));
});

test('keyboard without Turkish letters', () => {
  assert.ok(isCorrect('ogrenci', ['Öğrenci']));
  assert.ok(isCorrect('Istanbul', ['İstanbul']));
  assert.ok(isCorrect('sanliurfa', ['Şanlıurfa']));
});

test('spaces, punctuation and circumflex', () => {
  assert.ok(isCorrect('  bal. ', ['Bal']));
  assert.ok(isCorrect('ruzgar', ['Rüzgâr']));
  assert.ok(isCorrect('agri dagi', ['Ağrı', 'Ağrı Dağı']));
});

test('wrong answers stay wrong', () => {
  assert.ok(!isCorrect('', ['Bal']));
  assert.ok(!isCorrect('bala', ['Bal']));
  assert.ok(!isCorrect('kedi', ['Kediler']));
});

test('pas', () => {
  assert.ok(isPass('pas'));
  assert.ok(isPass('PAS'));
  assert.ok(isPass('Passaparola'));
  assert.ok(!isPass('pasta'));
});
