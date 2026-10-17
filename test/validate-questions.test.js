const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'validate-questions.mjs');
const BROKEN = path.join(__dirname, 'fixtures', 'broken', 'tarih.json');
const QDIR = path.join(ROOT, 'app', 'assets', 'questions');

function run(...args) {
  const r = spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const lib = import('../tools/validate-questions.mjs');

test('the five category files pass', () => {
  const r = run();
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /OK: 5 files/);
});

test('the empty category files pass on their own', () => {
  for (const c of ['cografya', 'bilim', 'sanat', 'spor']) {
    const r = run(path.join(QDIR, `${c}.json`));
    assert.strictEqual(r.code, 0, `${c}: ${r.out}`);
  }
});

test('every category file has the agreed shape', async () => {
  const { CATEGORIES, LETTERS } = await lib;
  assert.strictEqual(LETTERS.length, 28);
  assert.ok(!LETTERS.includes('Ğ'));
  for (const c of CATEGORIES) {
    const data = require(path.join(QDIR, `${c}.json`));
    assert.strictEqual(data.category, c);
    assert.ok(data.title);
    assert.ok(Array.isArray(data.levels));
  }
});

test('tarih level 1: at least 4 questions for each of the 28 letters, ids by letter', async () => {
  const { LETTERS } = await lib;
  const tarih = require(path.join(QDIR, 'tarih.json'));
  const l1 = tarih.levels.find(l => l.level === 1);
  assert.ok(l1.questions.length >= 112, `${l1.questions.length} questions`);
  for (const L of LETTERS) {
    const qs = l1.questions.filter(q => q.letter === L);
    assert.ok(qs.length >= 4, `${L}: ${qs.length}`);
    qs.forEach((q, i) => assert.strictEqual(q.id, `tarih-1-${L}-${i + 1}`));
  }
});

test('broken fixture: exits non-zero with a readable list', () => {
  const r = run(BROKEN);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /^\d+ problems found:/m);
  assert.match(r.out, /^ {2}- test\/fixtures\/broken\/tarih\.json: /m);
});

const broken = run(BROKEN).out;
const has = (re) => assert.match(broken, re);
const lacks = (re) => assert.doesNotMatch(broken, re);

test('rule: answer must start with / contain its letter, Turkish casing', () => {
  has(/tarih-1-A-1: answer "Bursa" does not start with A/);
  has(/tarih-1-I-2: answer "İzmir" does not start with I/);
  has(/tarih-1-İ-1: answer "Istanbul" does not start with İ/);
  has(/tarih-1-I-4: answer "Misir" does not contain I/);
  has(/tarih-1-Ö-1: answer "Sogut" does not contain Ö/);
  lacks(/tarih-1-I-1: answer/);
  lacks(/tarih-1-I-3: answer/);
  lacks(/tarih-1-İ-2: answer/);
});

test('rule: at least 4 questions per letter in a level', () => {
  has(/level 1: letter A has 1 question, needs at least 4/);
  has(/level 1: letter Z has 0 questions, needs at least 4/);
  lacks(/letter I has/);
  lacks(/letter Ğ/);
});

test('rule: ids must not repeat', () => {
  has(/tarih-1-B-1: id repeats/);
});

test('rule: a clue must not contain its own answer', () => {
  has(/tarih-1-C-1: clue contains its own answer "Cumhuriyet"/);
  lacks(/tarih-1-E-1: clue contains/);
});

test('rule: the same answer only once per category', () => {
  has(/tarih-1-E-2: answer "Edirne" is already used in this category by tarih-1-E-1/);
});

test('rule: clue at most 140 characters', () => {
  has(/tarih-1-L-1: clue is 1\d\d characters, the limit is 140/);
});

test('ids follow <category>-<level>-<letter>-<n>', async () => {
  const { validateData } = await lib;
  const bad = { category: 'spor', title: 'Spor', levels: [{ level: 2, questions: [
    { id: 'spor-1-A-1', letter: 'A', type: 'starts', clue: 'x', answers: ['Atlet'] },
    { id: 'spor-2-A', letter: 'A', type: 'starts', clue: 'y', answers: ['Arena'] },
  ] }] };
  const p = validateData(bad, 'spor.json').join('\n');
  assert.match(p, /spor-1-A-1: id must look like "spor-2-A-<n>"/);
  assert.match(p, /spor-2-A: id must look like/);
});

test('helpers: Turkish letters and give-away clues', async () => {
  const { fitsLetter, clueGivesAway } = await lib;
  assert.ok(fitsLetter('Irmak', 'I', 'starts'));
  assert.ok(fitsLetter('ırmak', 'I', 'starts'));
  assert.ok(!fitsLetter('İnönü', 'I', 'starts'));
  assert.ok(fitsLetter('Âşık Veysel', 'A', 'starts'));
  assert.ok(fitsLetter('Kızılay', 'I', 'contains'));
  assert.ok(!fitsLetter('Kilis', 'I', 'contains'));
  assert.ok(clueGivesAway("Ankara'nın ilçesi.", 'Ankara'));
  assert.ok(clueGivesAway('Osmanlıların kurduğu.', 'Osmanlı'));
  assert.ok(clueGivesAway('Çin Seddi uzundur.', 'Çin Seddi'));
  assert.ok(!clueGivesAway('Sultanın sarayı.', 'Su'));
  assert.ok(!clueGivesAway("Çin'den gelen yol.", 'Çin Seddi'));
});
