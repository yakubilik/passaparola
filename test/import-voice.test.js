const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOL = path.join(__dirname, '..', 'tools', 'import-voice.py');

const sh = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
  return r.stdout;
};

// A tone of `secs` seconds, so the test can tell which take won by its length.
function tone(file, secs, freq = 440) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fmt = file.endsWith('.wav') ? ['-ar', '48000', '-ac', '2'] : ['-ar', '22050', '-ac', '2', '-b:a', '128k'];
  sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${secs}`, ...fmt, file]);
}

function zip(out, dir) {
  sh('zip', ['-qr', out, '.'], { cwd: dir });
}

const probe = (file) =>
  JSON.parse(sh('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));

test('import-voice: newest batch wins, wav-only lines converted, unknown names skipped', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'import-voice-test-'));
  try {
    const csv = path.join(tmp, 'lines.csv');
    fs.writeFileSync(
      csv,
      '﻿dosya_adi,metin,tur\n' +
        'welcome,Başarılar diliyorum.,sunucu\n' +
        'tarih-1-A-1,Bir ipucu... A ile başlıyor.,soru tarih 1\n' +
        'tarih-1-Ç-1,Bir ipucu... Çe ile başlıyor.,soru tarih 1\n' +
        'tarih-1-Ç-1-cevap,Çay olacaktı.,yanlışta doğru cevap\n' +
        'tarih-1-B-1,Kayıt yok... Be ile başlıyor.,soru tarih 1\n',
    );
    const out = path.join(tmp, 'voice');
    fs.mkdirSync(out);
    // Placeholders: one for a line nobody recorded, one for a name that is not a line.
    tone(path.join(out, 'tarih-1-B-1.mp3'), 0.5);
    tone(path.join(out, 'old-sample.mp3'), 0.5);

    // Batch 1: wav and mp3 of the same lines, plus a test file.
    const b1 = path.join(tmp, 'src1', 'parti_001');
    tone(path.join(b1, 'welcome.wav'), 1);
    tone(path.join(b1, 'welcome.mp3'), 1);
    tone(path.join(b1, 'tarih-1-A-1.wav'), 1);
    tone(path.join(b1, 'tarih-1-Ç-1-cevap.wav'), 1.5); // wav only, nowhere newer
    tone(path.join(b1, '01_chatterbox_passaparola.wav'), 1);
    zip(path.join(tmp, 'parti_001.zip'), path.join(tmp, 'src1'));
    // Batch 1 v2: a retake of welcome.
    const b2 = path.join(tmp, 'src2', 'parti_001_v2');
    tone(path.join(b2, 'welcome.wav'), 2);
    zip(path.join(tmp, 'parti_001_v2.zip'), path.join(tmp, 'src2'));
    // Batch 2, zipped inside another zip: newer welcome and tarih-1-A-1 (wav only).
    const b3 = path.join(tmp, 'src3', 'harfiyen_parti_002');
    tone(path.join(b3, 'welcome.mp3'), 3);
    tone(path.join(b3, 'tarih-1-A-1.wav'), 2.5);
    tone(path.join(b3, 'tarih-1-Ç-1.wav'), 2);
    tone(path.join(b3, 'deneme.mp3'), 1);
    fs.mkdirSync(path.join(tmp, 'outer'));
    zip(path.join(tmp, 'outer', 'harfiyen_parti_002.zip'), path.join(tmp, 'src3'));
    const outer = path.join(tmp, 'gonderim.zip');
    zip(outer, path.join(tmp, 'outer'));

    const r = spawnSync(
      'python3',
      ['-I', TOOL, '--csv', csv, '--out', out, '--index', '', '--delete-sources',
        path.join(tmp, 'parti_001_v2.zip'), outer, path.join(tmp, 'parti_001.zip')],
      { encoding: 'utf8' },
    );
    const log = r.stdout + r.stderr;
    assert.strictEqual(r.status, 0, log);

    const dur = (n) => Number(probe(path.join(out, `${n}.mp3`)).format.duration);
    assert.ok(Math.abs(dur('welcome') - 3) < 0.15, `welcome is the batch 2 take: ${dur('welcome')}`);
    assert.ok(Math.abs(dur('tarih-1-A-1') - 2.5) < 0.15, `tarih-1-A-1 is the batch 2 wav: ${dur('tarih-1-A-1')}`);
    assert.ok(Math.abs(dur('tarih-1-Ç-1-cevap') - 1.5) < 0.15, 'wav-only line converted');
    for (const n of ['welcome', 'tarih-1-A-1', 'tarih-1-Ç-1', 'tarih-1-Ç-1-cevap']) {
      const { streams, format } = probe(path.join(out, `${n}.mp3`));
      assert.strictEqual(streams[0].codec_name, 'mp3', n);
      assert.strictEqual(streams[0].channels, 1, n);
      assert.strictEqual(streams[0].sample_rate, '44100', n);
      assert.strictEqual(streams[0].bit_rate, '64000', n);
      assert.strictEqual(format.format_name, 'mp3', n);
    }

    // Unknown names are skipped and listed, never written.
    assert.match(log, /skipped, not in the list \(2\): 01_chatterbox_passaparola deneme/);
    const files = fs.readdirSync(out).sort();
    assert.deepStrictEqual(files, [
      'imported.json', 'tarih-1-A-1.mp3', 'tarih-1-Ç-1-cevap.mp3', 'tarih-1-Ç-1.mp3', 'welcome.mp3',
    ].sort());
    // Placeholders went, so the unrecorded line is left to the phone's voice.
    assert.match(log, /removed 2 other clips/);
    assert.match(log, /coverage: 4\/5 lines have a recording/);
    assert.match(log, /tarih 1\s+soru 2\/3\s+cevap 1\/1/);
    assert.match(log, /missing \(1\): tarih-1-B-1/);
    // The received zips are gone and nothing was left in the temp folder.
    for (const z of ['parti_001.zip', 'parti_001_v2.zip', 'gonderim.zip']) assert.ok(!fs.existsSync(path.join(tmp, z)), z);
    assert.ok(!fs.readdirSync(os.tmpdir()).some((f) => f.startsWith('import-voice-') && !f.startsWith('import-voice-test-')));

    // A later batch is one more command: it only adds or replaces its own lines.
    const b4 = path.join(tmp, 'parti_003');
    tone(path.join(b4, 'tarih-1-B-1.wav'), 1.2);
    const again = spawnSync('python3', ['-I', TOOL, '--csv', csv, '--out', out, '--index', '', b4], { encoding: 'utf8' });
    assert.strictEqual(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /coverage: 5\/5/);
    assert.ok(Math.abs(dur('welcome') - 3) < 0.15, 'earlier recordings stay');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
