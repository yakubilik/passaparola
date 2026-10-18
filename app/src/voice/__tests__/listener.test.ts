import { judgeSpoken, spokenPace } from '../../game/normalize';
import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import { AnswerListener, contextFor, ECHO_TAIL_MS, PARTIAL_MS, SETTLE_MS, type Recognizer } from '../listener';

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

test('an answer counts after SETTLE_MS without new words', () => {
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

describe('judged at once', () => {
  // As the round does it: the current question's answers set the pace.
  const answers = ['Cimnastik'];
  beforeEach(() => {
    l.listen((alts, h) => { heard.push(alts); flags.push(h.duringHost); }, (alts) => spokenPace(alts, answers));
  });

  test('a right answer and a Pas do not wait; a wrong one waits SETTLE_MS', () => {
    fake.hear('jimnastik');
    expect(heard).toEqual([['jimnastik']]);
    wait(SETTLE_MS + 10);
    fake.hear('pas');
    expect(heard).toEqual([['jimnastik'], ['pas']]);
    wait(SETTLE_MS + 10);
    fake.hear('izmir');
    expect(heard.length).toBe(2);
    wait(SETTLE_MS);
    expect(heard).toEqual([['jimnastik'], ['pas'], ['izmir']]);
    expect(SETTLE_MS).toBeLessThan(1200);
    expect(fake.starts).toBe(1);
  });

  test('"pas geçiyorum" passes once, not twice', () => {
    fake.hear('pas');
    wait(200);
    fake.hear('geçiyorum');
    wait(SETTLE_MS * 3);
    expect(heard).toEqual([['pas']]);
    // The next thing said after a pause is new.
    fake.hear('izmir');
    wait(SETTLE_MS + 10);
    expect(heard).toEqual([['pas'], ['izmir']]);
  });

  test('"pas" gets through while the host is talking', () => {
    l.hostSpeaking(['Bir spor dalı, paralel bar ve halka... Ce ile başlıyor.']);
    fake.hear('bir spor dalı');
    fake.hear('pas');
    expect(heard).toEqual([['pas']]);
    expect(flags).toEqual([true]);
  });

  test('a pass word the host is saying is the host, not the player', () => {
    l.hostSpeaking(['Saat çok geç oldu... Ge ile başlıyor.']);
    fake.hear('saat çok geç oldu');
    wait(SETTLE_MS * 2);
    expect(heard).toEqual([]);
  });

  test('the start of a longer answer gets a longer pause', () => {
    const name = ['Reşat Nuri Güntekin'];
    l.listen((alts) => heard.push(alts), (alts) => spokenPace(alts, name));
    fake.hear('reşat');
    wait(SETTLE_MS + 100);
    expect(heard).toEqual([]);
    fake.hear('nuri güntekin');
    expect(heard).toEqual([['reşat nuri güntekin']]);
    expect(PARTIAL_MS).toBeGreaterThan(SETTLE_MS);
  });
});

describe('short answers (Ay, Su, Un, Ok)', () => {
  const pace = (answers: string[]) => (alts: string[]) => spokenPace(alts, answers);

  test('the recognizer is told to expect the round\'s answers, shortest first, and the pass words', () => {
    l.stop();
    l.listen(() => {}, undefined, contextFor(['Ankara', 'Ay', 'Su', 'ay']));
    expect(fake.lastOptions.contextualStrings).toEqual(['pas', 'geç', 'pas geçiyorum', 'Ay', 'Su', 'Ankara']);
    expect(contextFor(Array.from({ length: 300 }, (_, i) => `cevap${i}`)).length).toBe(100);
  });

  test('a lone two-letter answer is judged at once, with and without the host talking', () => {
    l.listen((alts) => heard.push(alts), pace(['Ay']));
    fake.hear('ay');
    expect(heard).toEqual([['ay']]);
    wait(SETTLE_MS + 10);
    l.listen((alts) => heard.push(alts), pace(['Su']));
    l.hostSpeaking(['İçmeden yaşanmaz... Se ile başlıyor.']);
    fake.hear('su');
    expect(heard).toEqual([['ay'], ['su']]);
  });

  test('a short answer iOS glued onto the last word still counts', () => {
    l.listen((alts) => heard.push(alts), pace(['Su']));
    fake.hear('izmir');
    wait(SETTLE_MS + 10);  // judged (wrong) and handled
    expect(heard).toEqual([['izmir']]);
    l.listen((alts) => heard.push(alts), pace(['Un']));
    fake.rewrite('izmirun');  // "un" said, no new word: the last one grew
    expect(heard).toEqual([['izmir'], ['izmirun', 'un', 'run']]);
    expect(judgeSpoken(heard[1], ['Un'])).toBe('correct');
  });

  test('a rewritten word never gives a wrong answer, and the host\'s rewritten words are not answers', () => {
    l.listen((alts) => heard.push(alts), pace(['Ay']));
    fake.hear('ankara');
    wait(SETTLE_MS + 10);
    fake.rewrite('an kara');
    fake.rewrite('ankaralı');
    wait(SETTLE_MS * 3);
    expect(heard).toEqual([['ankara']]);
    l.hostSpeaking(['Gece gökte parlar, Ay ile başlıyor.']);
    fake.hear('gece gökte parlar');
    fake.rewrite('gece gökte parlar ay');  // a new word, but the host's
    wait(SETTLE_MS * 3);
    expect(heard).toEqual([['ankara']]);
  });
});

test("hostLike: the host's words, or garbled close to them, are the host's; anything else is the player's", () => {
  l.hostSpeaking(["Kızıl Gezegen diye bilinen, Güneş'e dördüncü sıradaki gezegen."]);
  expect(l.hostLike('gezegen')).toBe(true);
  expect(l.hostLike('kızıl gezegenler')).toBe(true);
  expect(l.hostLike('dördün cü')).toBe(true);  // a word split in two
  expect(l.hostLike('sıradakiler')).toBe(true);
  expect(l.hostLike('merkür')).toBe(false);
  expect(l.hostLike('kızıl merkür jüpiter')).toBe(false);
  expect(l.hostLike('')).toBe(false);
  // Long after the host stopped, the last words still tell its echo from the player.
  l.hostDone();
  jest.advanceTimersByTime(ECHO_TAIL_MS * 10);
  expect(l.hostLike('gezegen')).toBe(true);
  expect(l.hostLike('merkür')).toBe(false);
});
