import { judgeSpoken, spokenPace } from '../../game/normalize';
import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import {
  AnswerListener, contextFor, ECHO_TAIL_MS, LIMIT_SEEN_MS, PARTIAL_MS, QUIET_MS, QUIET_POLL_MS, REQUEST_MAX_MS, REQUEST_REFRESH_MS, SETTLE_MS, type Recognizer,
} from '../listener';

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

// The native module reports 'aborted' and 'end' a moment after abort() (see fakeRecognizer.ts).
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('one request for the whole round (every start rebuilds the iOS audio engine)', () => {
  const round = contextFor(['Ay', 'Su', 'Merkür']);
  beforeEach(() => {
    l.stop();
    fake.reset();
    heard = [];
  });

  test('new words to expect while the mic is open do not restart it; they are used by the next request iOS forces', async () => {
    const states: string[] = [];
    l.onState = (s) => states.push(s);
    l.listen((alts) => heard.push(alts), undefined, round);
    expect(fake.lastOptions.contextualStrings).toEqual(['pas', 'geç', 'pas geçiyorum', 'Ay', 'Su', 'Merkür']);
    l.listen((alts) => heard.push(alts), undefined, contextFor(['Ankara']));
    await flush();
    wait(10_000);
    expect(fake.starts).toBe(1);
    expect(fake.aborts).toBe(0);
    expect(l.renewals).toBe(0);
    expect(states).not.toContain('off');
    fake.hear('su');
    wait(SETTLE_MS + 10);
    expect(heard).toEqual([['su']]);
    // iOS ends the request on its own: the next one expects the new words.
    fake.module.stop();
    fake.emit('end');
    wait(300);
    expect(fake.starts).toBe(2);
    expect(fake.lastOptions.contextualStrings).toEqual(contextFor(['Ankara']));
  });

  test("closing and reopening the mic at once: the closed request's 'end' does not restart the new one", async () => {
    l.listen((alts) => heard.push(alts), undefined, round);
    l.stop();
    l.listen((alts) => heard.push(alts), undefined, round);
    await flush();
    wait(1000);
    expect(fake.starts).toBe(2);
    expect(l.listening).toBe(true);
  });
});

describe('never while the game is sounding (a host clip or a cue)', () => {
  let sounding: boolean;
  beforeEach(() => {
    l.stop();
    fake.reset();
    heard = [];
    sounding = false;
    l.busy = () => sounding;
  });

  test("a request iOS ended during a cue is reopened only once it is quiet", () => {
    l.listen((alts) => heard.push(alts));
    wait(3000);
    sounding = true;
    fake.module.stop();
    fake.emit('end');
    wait(5000);
    expect(fake.starts).toBe(1);
    sounding = false;
    wait(QUIET_POLL_MS + 10);
    expect(fake.starts).toBe(2);
  });

  test('closing the mic while something plays: aborted at the silence after it; reopened before that, it just goes on', async () => {
    l.listen((alts) => heard.push(alts));
    sounding = true;
    l.stop();
    expect(l.open).toBe(false);
    wait(3000);
    expect(fake.aborts).toBe(0);
    fake.hear('ankara');  // heard by a closed mic: nobody gets it
    wait(SETTLE_MS * 2);
    expect(heard).toEqual([]);
    sounding = false;
    wait(QUIET_POLL_MS + 10);
    expect(fake.aborts).toBe(1);
    await flush();
    wait(1000);
    expect(fake.starts).toBe(1);

    l.listen((alts) => heard.push(alts));
    expect(fake.starts).toBe(2);
    sounding = true;
    l.stop();
    l.listen((alts) => heard.push(alts));
    sounding = false;
    wait(5000);
    expect(fake.aborts).toBe(1);
    expect(fake.starts).toBe(2);
    expect(l.listening).toBe(true);
    expect(l.micUp).toBe(true);
    fake.hear('su');
    wait(SETTLE_MS + 10);
    expect(heard).toEqual([['su']]);
  });

  test('release() closes a mic still waiting for silence at once (the mic check and the test screen)', () => {
    l.listen(() => {});
    sounding = true;
    l.stop();
    expect(fake.aborts).toBe(0);
    l.release();
    expect(fake.aborts).toBe(1);
  });
});

describe("Apple's time limit (about a minute of audio per server request)", () => {
  beforeEach(() => {
    l.stop();
    fake.reset();
    heard = [];
    l.onDevice = false;  // on Apple's servers
  });

  test('on-device recognition has no limit: its request is never renewed', async () => {
    const m = new AnswerListener(rec);
    m.listen(() => {});
    for (let i = 0; i < 10; i++) { wait(REQUEST_MAX_MS); await flush(); }
    expect(fake.starts).toBe(1);
    expect(fake.aborts).toBe(0);
    expect(m.renewals).toBe(0);
    m.stop();
  });

  test('an on-device request iOS ends at about a minute anyway was held to the limit: from then on it is renewed ahead of it', async () => {
    const m = new AnswerListener(rec);
    m.listen(() => {});
    wait(LIMIT_SEEN_MS + 5000);
    fake.module.stop();
    fake.emit('end');
    wait(300);
    expect(fake.starts).toBe(2);
    wait(REQUEST_REFRESH_MS + 300);
    expect(fake.aborts).toBe(1);
    m.stop();
  });

  test('the renewal waits for the game to fall silent, past REQUEST_MAX_MS too', async () => {
    let sounding = false;
    l.busy = () => sounding;
    l.listen(() => {});
    wait(REQUEST_REFRESH_MS - 100);
    sounding = true;
    wait(REQUEST_MAX_MS - REQUEST_REFRESH_MS + 2000);
    expect(fake.aborts).toBe(0);
    sounding = false;
    wait(300);
    expect(fake.aborts).toBe(1);
    await flush();
    expect(fake.starts).toBe(2);
  });

  test('a quiet request is renewed after REQUEST_REFRESH_MS, keeping the words to expect', async () => {
    l.listen((alts) => heard.push(alts), undefined, contextFor(['Ay']));
    wait(REQUEST_REFRESH_MS - 10);
    expect(fake.aborts).toBe(0);
    wait(20);
    expect(fake.aborts).toBe(1);
    await flush();
    expect(fake.starts).toBe(2);
    expect(fake.lastOptions.contextualStrings).toEqual(contextFor(['Ay']));
    // A whole quiet round never lets a request reach the limit.
    for (let i = 0; i < 10; i++) { wait(REQUEST_REFRESH_MS + 300); await flush(); }
    const ages = fake.startTimes.slice(1).map((t, i) => t - fake.startTimes[i]);
    expect(Math.max(...ages)).toBeLessThan(REQUEST_MAX_MS);
  });

  test('not while someone is talking: it waits for QUIET_MS without words, but never past REQUEST_MAX_MS', async () => {
    l.listen((alts) => heard.push(alts), undefined, contextFor(['Ay']));
    wait(REQUEST_REFRESH_MS - 500);
    // Talking (the host, say) from before the refresh time on, a word every half second.
    for (let t = 0; t < 1500; t += 500) { fake.hear('bla'); wait(500); }
    expect(fake.aborts).toBe(0);
    wait(QUIET_MS + 300);  // a pause: renewed now
    expect(fake.aborts).toBe(1);
    await flush();
    expect(fake.starts).toBe(2);

    // Words without a pause for the whole minute: renewed at REQUEST_MAX_MS regardless.
    const t0 = Date.now();
    while (fake.aborts === 1 && Date.now() - t0 < 70_000) { fake.hear('bla'); wait(400); }
    expect(fake.aborts).toBe(2);
    expect(Date.now() - t0).toBeLessThanOrEqual(REQUEST_MAX_MS + 400);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(REQUEST_MAX_MS - 400);
  });

  test('a request ended by iOS anyway (the limit, a long silence) is reopened, as before', () => {
    l.listen((alts) => heard.push(alts));
    fake.hear('ankara');
    fake.module.stop();
    fake.emit('end');
    expect(heard).toEqual([['ankara']]);
    wait(300);
    expect(fake.starts).toBe(2);
  });
});

describe('on-device recognition first, Apple\'s servers as the fallback', () => {
  beforeEach(() => {
    l.stop();
    fake.reset();
  });

  test('every request asks for on-device recognition', () => {
    const m = new AnswerListener(rec);
    m.listen(() => {});
    expect(fake.lastOptions).toMatchObject({ requiresOnDeviceRecognition: true });
    expect(m.mode).toBe('on-device');
    m.stop();
  });

  test('when on-device is refused the next request goes to the servers; only if they refuse too is it "denied"', async () => {
    const m = new AnswerListener(rec);
    const states: string[] = [];
    m.onState = (s) => states.push(s);
    m.listen(() => {});
    fake.emit('error', { error: 'service-not-allowed' });
    fake.emit('end');
    expect(fake.starts).toBe(2);
    expect(fake.lastOptions).toMatchObject({ requiresOnDeviceRecognition: false });
    expect(m.mode).toBe('server');
    expect(states).not.toContain('denied');

    fake.emit('error', { error: 'service-not-allowed' });
    fake.emit('end');
    wait(1000);
    expect(states).toContain('denied');
    expect(fake.starts).toBe(2);
    m.stop();
  });
});
