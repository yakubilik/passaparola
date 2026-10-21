import { REQUEST_MAX_MS, REQUEST_REFRESH_MS } from '../listener';
import { RECOGNITION_OPTIONS } from '../recognizer';

// Node's fs, typed here: the app has no Node type definitions.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{ readFileSync: (file: string, enc: 'utf8') => string }>('fs');

// docs/speech.md audits every recognizer option we rely on; it must keep
// covering each of them, with a source, and agree with what the code sends.
const doc = readFileSync(`${__dirname}/../../../../docs/speech.md`, 'utf8');
const rows = doc.split('\n').filter((l: string) => /^\| \d+a? \|/.test(l));

test.each([
  ['on-device vs server', /supportsOnDeviceRecognition.*requiresOnDeviceRecognition/],
  ['task hint', /Task hint/],
  ['contextualStrings, per question', /contextualStrings/],
  ['addsPunctuation', /addsPunctuation/],
  ['maxAlternatives', /maxAlternatives/],
  ["continuous mode", /Continuous mode/],
  ["Apple's one-minute limit", /1-minute limit/],
  ['iosVoiceProcessingEnabled', /iosVoiceProcessingEnabled/],
  ['audio session category / mode', /Audio session category/],
  ["'end' / 'error' and restarts", /'end' \/ 'error'/],
  ['Siri & Dictation permissions', /Siri & Dictation/],
])('the audit has a row for %s, with a source link', (_name, re) => {
  const row = rows.find((r: string) => re.test(r));
  expect(row).toBeDefined();
  expect(row).toMatch(/https:\/\/|\.swift|README/);
});

test('the audit says what the code sends', () => {
  expect(RECOGNITION_OPTIONS).toMatchObject({ addsPunctuation: false, iosTaskHint: 'search', iosVoiceProcessingEnabled: true });
  expect(RECOGNITION_OPTIONS.iosCategory).toMatchObject({ category: 'playAndRecord', mode: 'voiceChat' });
  expect(doc).toContain(`\`${RECOGNITION_OPTIONS.iosTaskHint}\``);
  expect(doc).toContain(`${REQUEST_REFRESH_MS / 1000} s`);
  expect(doc).toContain(`${REQUEST_MAX_MS / 1000} s`);
  expect(doc).toMatch(/Ses tanıma testi/);
});
