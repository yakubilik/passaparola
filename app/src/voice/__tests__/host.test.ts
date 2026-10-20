import { CATEGORIES } from '../../data/questions';
import { audio, CLIP_MS, speech, ttsMs } from '../../test-utils/fakeAudio';
import { CLIPS } from '../clips.generated';
import { CLIP_ATTEMPTS, CLIP_START_MS, Host, TTS_ATTEMPTS, TTS_START_MS } from '../host';
import { answerLine, clueLine, host as hostLine, HOST_LINES } from '../lines';

// Node's fs and path, without Node's type definitions in the app.
declare const __dirname: string;
const { existsSync, readdirSync } = jest.requireActual<{ existsSync(p: string): boolean; readdirSync(p: string): string[] }>('fs');
const { join } = jest.requireActual<{ join(...p: string[]): string }>('path');

const q = { id: 'tarih-1-B-1', letter: 'B', type: 'starts' as const, clue: 'Bir şehir.', answers: ['Bursa'] };
const qo = { id: 'tarih-1-Ö-1', letter: 'Ö', type: 'starts' as const, clue: 'Bir kuş', answers: ['Ördek'] };

beforeEach(() => {
  jest.useFakeTimers();
  speech.reset();
  audio.players.length = 0;
  audio.stalls = { afterReplace: 0, any: 0 };
});

// The native speech events come a moment after the call (a microtask): let them through, then move the clock.
async function advance(ms: number) {
  await Promise.resolve();
  await Promise.resolve();
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
}
afterEach(() => jest.useRealTimers());

test('lines read the way the recordings do', () => {
  expect(clueLine(q)).toEqual({ key: 'tarih-1-B-1', text: 'Bir şehir... Be ile başlıyor.' });
  expect(clueLine(qo)).toEqual({ key: 'tarih-1-Ö-1', text: 'Bir kuş... Ö ile başlıyor.' });
  expect(clueLine({ ...q, letter: 'İ' }).text).toBe('Bir şehir... İ ile başlıyor.');
  expect(answerLine(q)).toEqual({ key: 'tarih-1-B-1-cevap', text: 'Bursa olacaktı.' });
  expect(hostLine('wrong')).toEqual({ key: 'wrong', text: 'Değil, olmadı.' });
});

test('host lines match tools/host-lines.json', () => {
  const json = require('../../../../tools/host-lines.json');
  for (const [k, v] of Object.entries(HOST_LINES)) expect(json[k]).toBe(v);
});

test('a line with a clip plays app/assets/voice/<key>.mp3, then calls done', () => {
  const h = new Host({ 'tarih-1-B-1': 101, wrong: 102 });
  const done = jest.fn();
  h.speak([hostLine('wrong'), clueLine(q)], done);
  expect(h.speaking).toBe(true);
  expect(audio.players[0].source).toBe(102);
  jest.advanceTimersByTime(CLIP_MS + 10);
  // A player of its own for every clip (no replace(), see Host.playClip).
  expect(audio.players[1].source).toBe(101);
  expect(done).not.toHaveBeenCalled();
  jest.advanceTimersByTime(CLIP_MS + 10);
  expect(done).toHaveBeenCalledTimes(1);
  expect(h.said).toEqual(['clip:wrong', 'clip:tarih-1-B-1']);
  expect(speech.spoken).toEqual([]);
});

test('a missing clip is read with expo-speech in tr-TR', async () => {
  const h = new Host({ wrong: 102 });
  const done = jest.fn();
  h.speak([hostLine('wrong'), answerLine(q)], done);
  jest.advanceTimersByTime(CLIP_MS + 10);
  expect(speech.spoken).toEqual([{ text: 'Bursa olacaktı.', language: 'tr-TR', useApplicationAudioSession: true }]);
  expect(done).not.toHaveBeenCalled();
  await advance(ttsMs('Bursa olacaktı.') + 10);
  expect(done).toHaveBeenCalledTimes(1);
  expect(h.said).toEqual(['clip:wrong', 'tts:Bursa olacaktı.']);
});

test('a clip that never starts sounding is tried once more on a new player, then read aloud instead', async () => {
  const h = new Host({ wrong: 102 });
  const done = jest.fn();
  audio.stalls.any = CLIP_ATTEMPTS;
  h.speak([hostLine('wrong')], done);
  jest.advanceTimersByTime(CLIP_START_MS + 150);
  expect(audio.players).toHaveLength(2);
  expect(speech.spoken).toEqual([]);
  jest.advanceTimersByTime(CLIP_START_MS + 150);
  expect(h.clipFailures).toEqual([{ key: 'wrong', attempt: 1 }, { key: 'wrong', attempt: 2 }]);
  expect(speech.spoken.map((s) => s.text)).toEqual(['Değil, olmadı.']);
  await advance(ttsMs('Değil, olmadı.') + 10);
  expect(done).toHaveBeenCalledTimes(1);
});

// #362: a clue without a clip was not read at all on the iPhone.
describe('the phone voice for a line without a clip', () => {
  const states = (h: Host) => h.speechLog.map((e) => `${e.state}#${e.attempt}`);

  test('the line counts as started when iOS says the speech started, not when it was asked for', async () => {
    const h = new Host({});
    const starts = jest.fn();
    const done = jest.fn();
    h.speak([clueLine(q)], done, undefined, starts);
    expect(starts).not.toHaveBeenCalled();
    await advance(0);
    expect(starts).toHaveBeenCalledWith(0);
    expect(speech.started).toEqual([clueLine(q).text]);
    await advance(ttsMs(clueLine(q).text) + 10);
    expect(done).toHaveBeenCalledTimes(1);
    expect(states(h)).toEqual(['asked#1', 'started#1', 'done#1']);
  });

  test('expo-speech is not stopped before a line when none of its speech can be sounding', async () => {
    const h = new Host({ wrong: 102 });
    h.speak([hostLine('wrong')]);
    h.speak([clueLine(q)]);
    h.cancel();
    h.speak([clueLine(q)]);
    expect(speech.stops).toBe(1);  // only the cancel(), with the first clue's speech asked for
    await advance(0);
    expect(speech.started).toEqual([clueLine(q).text]);
  });

  test('an utterance iOS never starts is asked again on the synthesizer\'s own session, and then read', async () => {
    speech.mode = 'never';
    speech.failures = 1;
    const h = new Host({});
    const starts = jest.fn();
    const done = jest.fn();
    h.speak([clueLine(q)], done, undefined, starts);
    await advance(TTS_START_MS - 10);
    expect(starts).not.toHaveBeenCalled();
    await advance(20);
    expect(speech.spoken.map((s) => s.useApplicationAudioSession)).toEqual([true, false]);
    expect(starts).toHaveBeenCalledTimes(1);
    await advance(ttsMs(clueLine(q).text) + 10);
    expect(done).toHaveBeenCalledTimes(1);
    expect(states(h)).toEqual(['asked#1', 'nostart#1', 'asked#2', 'started#2', 'done#2']);
  });

  test('an utterance iOS cancels by itself before it starts is asked again at once', async () => {
    speech.mode = 'dropped';
    speech.failures = 1;
    const h = new Host({});
    const starts = jest.fn();
    h.speak([clueLine(q)], undefined, undefined, starts);
    await advance(0);
    await advance(0);
    expect(starts).toHaveBeenCalledTimes(1);
    expect(states(h)).toEqual(['asked#1', 'stopped#1', 'asked#2', 'started#2']);
  });

  test('if the phone voice never speaks, the clue is shown anyway and the host moves on (never stuck)', async () => {
    speech.mode = 'never';
    const h = new Host({});
    const starts = jest.fn();
    const done = jest.fn();
    h.speak([clueLine(q), hostLine('listen')], done, undefined, starts);
    for (let i = 0; i < TTS_ATTEMPTS; i++) await advance(TTS_START_MS + 10);
    expect(starts).toHaveBeenCalledWith(0);
    expect(speech.spoken).toHaveLength(TTS_ATTEMPTS);
    expect(states(h).at(-1)).toBe(`silent#${TTS_ATTEMPTS}`);
    await advance(10_000);
    expect(starts).toHaveBeenCalledWith(1);
  });

  test('a newer line cuts the speech off without a retry', async () => {
    const h = new Host({ wrong: 102 });
    h.speak([clueLine(q)]);
    await advance(0);
    h.speak([hostLine('wrong')]);
    await advance(TTS_START_MS * 3);
    expect(speech.spoken).toHaveLength(1);
    expect(states(h)).toEqual(['asked#1', 'started#1']);
  });
});

test('cancel cuts the host off without calling done, and reports quiet', () => {
  const h = new Host({});
  const states: (string[] | null)[] = [];
  h.onSpeaking = (t) => states.push(t);
  const done = jest.fn();
  h.speak([clueLine(q)], done);
  h.cancel();
  jest.advanceTimersByTime(10_000);
  expect(done).not.toHaveBeenCalled();
  expect(states).toEqual([['Bir şehir... Be ile başlıyor.'], null]);
  expect(h.speaking).toBe(false);
});

// The device builds (the delivery, install-iphone.sh) bundle the committed
// index as it is: a recording missing from it is never in the app and its line
// falls back to the phone voice (#362: 116 clue and 116 answer recordings of
// 76d8f60 were not indexed). Run `node scripts/gen-voice-index.mjs` after adding clips.
test('the committed clip index lists every recording in assets/voice', () => {
  const dir = join(__dirname, '../../../assets/voice');
  const files = readdirSync(dir).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
  expect(files.filter((k) => !(k in CLIPS))).toEqual([]);
  expect(Object.keys(CLIPS).sort()).toEqual(files);
});

test('the clip index points at files that exist, under the contract names', () => {
  const dir = join(__dirname, '../../../assets/voice');
  for (const key of Object.keys(CLIPS)) expect(existsSync(join(dir, key + '.mp3'))).toBe(true);
  // Names: <question id>, <question id>-cevap, host line keys.
  const ids = new Set(CATEGORIES.flatMap((c) => c.levels.flatMap((l) => l.questions.map((x) => x.id))));
  for (const key of Object.keys(CLIPS)) {
    expect(ids.has(key.replace(/-cevap$/, '')) || key in HOST_LINES || ['welcome2', 'turn2', 'end2', 'draw'].includes(key)).toBe(true);
  }
});

test('every question in the bank starts with its letter and its clue says so', () => {
  const qs = CATEGORIES.flatMap((c) => c.levels.flatMap((l) => l.questions));
  expect(qs.length).toBeGreaterThan(1000);
  for (const x of qs) {
    expect(x.type).toBe('starts');
    expect(clueLine(x).text).toMatch(/\.\.\. \S+ ile başlıyor\.$/);
    expect(clueLine(x).text).not.toMatch(/\.\.\. İçinde \S+ var\.$/);
  }
});

test('lines cut off by cancel() or a newer speak() call `cut` once, never `done`; lines said to the end never call `cut`', () => {
  const h = new Host({ 'tarih-1-B-1': 101, wrong: 102 });
  const [done1, cut1, done2, cut2, done3, cut3] = [jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn()];
  h.speak([hostLine('wrong'), answerLine(q)], done1, cut1);
  jest.advanceTimersByTime(CLIP_MS / 2);
  h.speak([clueLine(q)], done2, cut2);
  expect(cut1).toHaveBeenCalledTimes(1);
  h.cancel();
  expect(cut2).toHaveBeenCalledTimes(1);
  h.cancel();
  jest.advanceTimersByTime(10_000);
  expect([done1, done2].map((f) => f.mock.calls.length)).toEqual([0, 0]);
  expect([cut1, cut2].map((f) => f.mock.calls.length)).toEqual([1, 1]);

  h.speak([hostLine('wrong')], done3, cut3);
  jest.advanceTimersByTime(CLIP_MS + 10);
  h.cancel();
  expect(done3).toHaveBeenCalledTimes(1);
  expect(cut3).not.toHaveBeenCalled();
});
