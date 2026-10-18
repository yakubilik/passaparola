const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'gen-voice-lines.py');
const QDIR = path.join(ROOT, 'app', 'assets', 'questions');
const VOICE = path.join(ROOT, 'app', 'assets', 'voice');

// Minimal CSV reader for the three columns (quoted fields may hold commas).
function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  for (const line of text.split('\r\n').filter(Boolean)) {
    const cells = [];
    let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const questions = () => ['tarih', 'cografya', 'bilim', 'sanat', 'spor']
  .flatMap(c => require(path.join(QDIR, `${c}.json`)).levels.flatMap(l => l.questions));

test('gen-voice-lines: every clue reads "X ile başlıyor", the re-record list is the lines without a clip', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-voice-lines-test-'));
  try {
    const r = spawnSync('python3', [TOOL, '--dir', tmp], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);

    const all = readCsv(path.join(tmp, 'seslendirilecek-satirlar.csv'));
    assert.deepStrictEqual(all[0], ['dosya_adi', 'metin', 'tur']);
    const byKey = new Map(all.slice(1).map(([k, t, kind]) => [k, { t, kind }]));
    const qs = questions();
    for (const q of qs) {
      const clue = byKey.get(q.id);
      assert.ok(clue, q.id);
      assert.match(clue.t, / ile başlıyor\.$/, q.id);
      assert.doesNotMatch(clue.t, /\.\.\. İçinde \S+ var\.$/, q.id);
      assert.strictEqual(byKey.get(`${q.id}-cevap`).t, `${q.answers[0]} olacaktı.`);
    }
    assert.ok(!all.some(([, t]) => /\.\.\. İçinde \S+ var\.$/.test(t)));

    const clips = new Set(fs.readdirSync(VOICE).filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4).normalize('NFC')));
    const again = readCsv(path.join(tmp, 'yeniden-seslendirilecek.csv')).slice(1);
    const want = all.slice(1).filter(([k]) => !clips.has(k));
    assert.deepStrictEqual(again, want);
    for (const [k] of again) assert.ok(!clips.has(k), k);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
