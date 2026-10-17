const test = require('node:test');
const assert = require('node:assert');
const { LETTERS, SETS } = require('../js/questions.js');
const { norm } = require('../js/normalize.js');

test('29 Turkish letters', () => assert.strictEqual(LETTERS.length, 29));

test('at least 5 sets', () => assert.ok(SETS.length >= 5));

SETS.forEach((set, si) => {
  test(`set ${si + 1}: one question per letter, in order`, () => {
    assert.deepStrictEqual(set.map(q => q.l), LETTERS);
  });
  test(`set ${si + 1}: every answer fits its letter`, () => {
    for (const q of set) {
      assert.ok(q.q && q.q.length > 5, `${q.l}: question text`);
      assert.ok(q.a.length > 0, `${q.l}: answers`);
      const l = norm(q.l);
      for (const a of q.a) {
        const n = norm(a);
        if (q.t === 'b') assert.ok(n.startsWith(l), `set ${si + 1} ${q.l}: "${a}" should start with ${q.l}`);
        else assert.ok(n.includes(l) && !n.startsWith(l), `set ${si + 1} ${q.l}: "${a}" should contain ${q.l}`);
      }
    }
  });
});

test('no answer word repeats inside a set', () => {
  for (const set of SETS) {
    const seen = new Set();
    for (const q of set) { const n = norm(q.a[0]); assert.ok(!seen.has(n), n); seen.add(n); }
  }
});
