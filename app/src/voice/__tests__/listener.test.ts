import { judgeSpoken } from '../../game/normalize';
import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import { AnswerListener, ECHO_TAIL_MS, SETTLE_MS, type Recognizer } from '../listener';

// The listener on a recognizer that behaves like iOS: one result that keeps
// growing with everything said and never turns final.
const fake = new FakeRecognizer();
const rec: Recognizer = {
  start: (o) => fake.module.start(o),
  abort: () => fake.module.abort(),
  subscribe: (h) => {
    const subs = [fake.module.addListener('result', h.result), fake.module.addListener('error', h.error), fake.module.addListener('end', h.end)];
    return () => subs.forEach((s) => s.remove());
  },
};

let heard: string[][];
let flags: boolean[];
let l: AnswerListener;

beforeEach(() => {
  jest.useFakeTimers();
  fake.reset();
  heard = [];
  flags = [];
  l = new AnswerListener(rec);
  l.listen((alts, h) => { heard.push(alts); flags.push(h.duringHost); });
});
afterEach(() => {
  l.stop();
  jest.useRealTimers();
});

const wait = (ms: number) => jest.advanceTimersByTime(ms);

test('opens one continuous tr-TR session with interim results', () => {
  expect(fake.starts).toBe(1);
  expect(fake.lastOptions).toMatchObject({ lang: 'tr-TR', continuous: true, interimResults: true });
  l.listen((alts) => heard.push(alts)); // a new question: same session
  expect(fake.starts).toBe(1);
});

test('an answer counts after ~0.9 s without new words', () => {
  fake.hear('an');
  wait(500);
  fake.hear('kara');
  wait(SETTLE_MS - 100);
  expect(heard).toEqual([]);
  wait(150);
  expect(heard).toEqual([['an kara']]);
});

test('the same words again do not restart the wait', () => {
  fake.hear('ankara');
  wait(600);
  fake.emit('result', { isFinal: false, results: [{ transcript: 'Ankara' }] });
  wait(SETTLE_MS - 600 + 10);
  expect(heard).toEqual([['ankara']]);
});

test('words already handled are cut off the growing result', () => {
  fake.hear('ankara');
  wait(SETTLE_MS + 10);
  fake.hear('cevap izmir');
  wait(SETTLE_MS + 10);
  fake.hear('pas');
  wait(SETTLE_MS + 10);
  expect(fake.transcript).toBe('ankara cevap izmir pas');
  expect(heard).toEqual([['ankara'], ['cevap izmir'], ['pas']]);
  expect(fake.starts).toBe(1);
});

test("the host's words are ignored while it speaks and for 1.5 s after", () => {
  l.hostSpeaking(['Başkenti olan şehir... A ile başlıyor.']);
  fake.hear('başkenti olan şehir a ile başlıyor');
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([]);
  l.hostDone();
  wait(ECHO_TAIL_MS - 200);
  fake.hear('şehir'); // the room still rings
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([]);
  fake.hear('şehir'); // well after the host: the player's own word
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([['şehir']]);
});

test('the player can answer while the host is still reading', () => {
  l.hostSpeaking(['Başkenti olan şehir... A ile başlıyor.']);
  fake.hear('başkenti olan');
  fake.hear('ankara');
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([['ankara']]);
});

test('a near echo is dropped, but "hazırım" is not swallowed by "Hazır mısınız?"', () => {
  l.hostSpeaking(['Hazır mısınız?']);
  fake.hear('hazırım');
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([['hazırım']]);
});

test("pas, geç and bilmiyorum pass; 'cevap Ankara' matches", () => {
  const said = (w: string) => { fake.hear(w); wait(SETTLE_MS + 10); return heard[heard.length - 1]; };
  expect(judgeSpoken(said('pas'), ['Ankara'])).toBe('pass');
  expect(judgeSpoken(said('geç'), ['Ankara'])).toBe('pass');
  expect(judgeSpoken(said('bilmiyorum'), ['Ankara'])).toBe('pass');
  expect(judgeSpoken(said('cevap Ankara'), ['Ankara'])).toBe('correct');
  expect(judgeSpoken(said('izmir'), ['Ankara'])).toBe('wrong');
  expect(fake.starts).toBe(1);
});

test('a final result is delivered at once and the next one starts fresh', () => {
  fake.emit('result', { isFinal: true, results: [{ transcript: 'ankara' }] });
  expect(heard).toEqual([['ankara']]);
  fake.emit('result', { isFinal: false, results: [{ transcript: 'izmir' }] });
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([['ankara'], ['izmir']]);
});

test('when iOS ends the session on its own the mic opens again', () => {
  fake.hear('ankara');
  fake.module.stop();
  fake.emit('end');
  expect(heard).toEqual([['ankara']]);
  wait(300);
  expect(fake.starts).toBe(2);
});

test('permission off stops asking and says so', () => {
  const states: string[] = [];
  l.onState = (s) => states.push(s);
  fake.emit('error', { error: 'not-allowed' });
  fake.emit('end');
  wait(500);
  expect(states).toContain('denied');
  expect(fake.starts).toBe(1);
});

test('stop closes the mic and nothing more is delivered', () => {
  fake.hear('ankara');
  l.stop();
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([]);
  expect(fake.aborts).toBe(1);
});

test('a word a slip away from what the host says is the host too', () => {
  l.hostSpeaking(['Kırmızı zemin üzerinde beyaz ay ve yıldız']);
  fake.hear('kırmızi zemın üzerınde beyas');
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([]);
});

test('an answer says whether it was heard while the host talked or just after', () => {
  l.hostSpeaking(['Başkenti olan şehir.']);
  fake.hear('izmir');
  wait(SETTLE_MS + 10);
  l.hostDone();
  wait(ECHO_TAIL_MS - 500);
  fake.hear('bursa');
  wait(SETTLE_MS + 10);
  wait(ECHO_TAIL_MS);
  fake.hear('ankara');
  wait(SETTLE_MS + 10);
  expect(heard).toEqual([['izmir'], ['bursa'], ['ankara']]);
  expect(flags).toEqual([true, true, false]);
  expect(l.hostRecent).toBe(false);
});
