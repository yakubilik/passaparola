import { judgeHeard, spokenPace, type Verdict } from '../../game/normalize';
import { FakeRecognizer } from '../../test-utils/fakeRecognizer';
import { AnswerListener, FRAGMENT_MS, LATE_MS, REQUEST_REFRESH_MS, SETTLE_MS, type Recognizer } from '../listener';

// #438: what is heard is incomplete (a lone letter), a completed attempt
// (judged once) or consumed (the judged utterance's late words and final). The
// real listener on a recognizer that behaves like iOS, and the round's own
// verdict rule (judgeHeard, spokenPace) as useVoiceRound applies it: a verdict
// moves on to the next question, whose clue the host reads.
// Fake recognizer: this is not evidence of what the iPhone's recognizer hears.
const fake = new FakeRecognizer();
const rec: Recognizer = {
  start: (o) => fake.module.start(o),
  abort: () => fake.module.abort(),
  subscribe: (h) => {
    const subs = [fake.module.addListener('result', h.result), fake.module.addListener('error', h.error), fake.module.addListener('end', h.end)];
    return () => subs.forEach((s) => s.remove());
  },
};

type Q = { letter: string; answers: string[]; clue: string };
const Q = (letter: string, answers: string[]): Q => ({ letter, answers, clue: `${letter} ile başlıyor` });
const AY = Q('A', ['Ay']);
const SU = Q('S', ['Su']);
const EL = Q('E', ['El']);
const UN = Q('U', ['Un']);
const OK = Q('O', ['Ok']);
const NEXT = Q('K', ['Kayak']);

const interim = (...guesses: string[]) => fake.emit('result', { isFinal: false, results: guesses.map((transcript) => ({ transcript })) });
const final = (...guesses: string[]) => fake.emit('result', { isFinal: true, results: guesses.map((transcript) => ({ transcript })) });
const wait = (ms: number) => jest.advanceTimersByTime(ms);
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
// Silence: no words, the clock running in steps so renewals and their 'end's happen as on the phone.
async function idle(ms: number, iosEndsAt?: number) {
  for (let t = 0; t < ms; t += 500) {
    wait(Math.min(500, ms - t));
    await flush();
    // iOS ends an on-device request on its own at about a minute (a long silence).
    if (iosEndsAt !== undefined && t < iosEndsAt && t + 500 >= iosEndsAt) {
      fake.module.stop();
      fake.emit('end');
    }
  }
}

let l: AnswerListener;
let questions: Q[];
let at: number;
let judged: { q: string; text: string; verdict: Verdict | 'hold' }[];
let host: boolean;

// As useVoiceRound does it: judgeHeard decides, a verdict moves to the next
// question, whose clue starts (clueStarts) and is read (hostSpeaking … hostDone).
function round(...qs: Q[]) {
  questions = qs;
  at = 0;
  judged = [];
  l.listen((alts, h) => {
    const cur = questions[at];
    if (!cur) return;
    const v = judgeHeard(alts, cur.answers, cur.letter, { duringHost: host || h.duringHost, hostLike: h.hostLike, hostNear: h.hostNear, hostWords: h.hostWords });
    if (v === null) return;
    judged.push({ q: cur.answers[0], text: alts[0], verdict: v });
    if (v !== 'hold') at++;
  }, (alts) => (questions[at] ? spokenPace(alts, questions[at].answers) : 'settle'), undefined, () => questions[at]?.answers ?? []);
}
function readClue() {
  l.clueStarts();
  host = true;
  l.hostSpeaking([questions[at].clue]);
  wait(1500);
  host = false;
  l.hostDone();
  wait(1000);
}
// Moves on without a spoken verdict (the Pas button, a typed answer).
function skip() {
  at++;
  readClue();
}

beforeEach(() => {
  jest.useFakeTimers();
  fake.reset();
  host = false;
  l = new AnswerListener(rec);
});
afterEach(() => {
  l.stop();
  jest.useRealTimers();
});

describe('a lone letter after a long silence, then the word (Ay, Su, El, Un, Ok)', () => {
  const words: [Q, string][] = [[AY, 'ay'], [SU, 'su'], [EL, 'el'], [UN, 'un'], [OK, 'ok']];
  for (const mode of ['on-device', 'server'] as const) {
    for (const silence of [1_000, 20_000, 45_000, 65_000]) {
      test.each(words)(`${mode}, ${silence / 1000} s of silence: %s`, async (q, word) => {
        if (mode === 'server') l.onDevice = false;
        round(q, NEXT);
        readClue();
        await idle(silence, mode === 'on-device' ? 60_000 : undefined);
        // The requests renewed meanwhile: on the servers at REQUEST_REFRESH_MS; on-device when iOS ends one.
        const renewed = mode === 'server' ? Math.floor((silence + 2500) / REQUEST_REFRESH_MS) : silence + 2500 >= 60_000 ? 1 : 0;
        expect(fake.starts).toBe(1 + renewed);
        // The first letter alone, as an interim and as its utterance's final.
        fake.hear(word[0]);
        wait(SETTLE_MS * 3);
        fake.endUtterance();
        wait(400);
        expect(judged).toEqual([]);
        expect(at).toBe(0);
        // Then the word.
        fake.hear(word);
        expect(judged).toEqual([{ q: q.answers[0], text: `${word[0]} ${word}`, verdict: 'correct' }]);
        fake.endUtterance();
        // Nothing of it reaches the next question.
        readClue();
        await idle(5000);
        expect(judged).toHaveLength(1);
        expect(at).toBe(1);
      });
    }
  }
});

describe('evolving, delayed and revised results', () => {
  test("a → ay in the same growing result: one verdict, right; 'a' is never judged", () => {
    round(AY, NEXT);
    readClue();
    interim('a');
    wait(SETTLE_MS * 2);
    expect(judged).toEqual([]);
    interim('ay');
    expect(judged).toEqual([{ q: 'Ay', text: 'ay', verdict: 'correct' }]);
  });

  test('s → su, the letter settling first: one verdict, right', () => {
    round(SU, NEXT);
    readClue();
    interim('s');
    wait(SETTLE_MS + 100);
    interim('su');
    final('su');
    expect(judged).toEqual([{ q: 'Su', text: 'su', verdict: 'correct' }]);
    readClue();
    wait(3000);
    expect(judged).toHaveLength(1);
  });

  test('a letter whose final is revised to the word 1.5 s later: right, once', () => {
    round(AY, NEXT);
    readClue();
    interim('a');
    wait(1500);
    final('ay');
    expect(judged).toEqual([{ q: 'Ay', text: 'ay', verdict: 'correct' }]);
  });

  test('a right answer whose final comes late and revised: no second verdict, nothing for the next question', () => {
    round(AY, NEXT);
    readClue();
    interim('ay');
    expect(judged).toHaveLength(1);
    readClue();
    wait(600);
    final('ah');
    wait(SETTLE_MS * 4);
    expect(judged).toEqual([{ q: 'Ay', text: 'ay', verdict: 'correct' }]);
    expect(at).toBe(1);
  });

  test("the letter's final, then the rest of the word as a new result ('a' + 'y'): one word, right", () => {
    round(AY, NEXT);
    readClue();
    final('a');
    wait(1200);
    interim('y');
    expect(judged).toEqual([{ q: 'Ay', text: 'a y', verdict: 'correct' }]);
  });

  test('a letter nobody completes is dropped after FRAGMENT_MS, unjudged; the word said later is judged alone', () => {
    round(AY, NEXT);
    readClue();
    const shown: string[] = [];
    l.onInterim = (t) => shown.push(t);
    fake.hear('a');
    fake.endUtterance();
    wait(FRAGMENT_MS + 100);
    expect(judged).toEqual([]);
    expect(shown[shown.length - 1]).toBe('');
    fake.hear('ay');
    expect(judged).toEqual([{ q: 'Ay', text: 'ay', verdict: 'correct' }]);
  });

  test('a lone letter does not hold back the words after it: a wrong word is judged after SETTLE_MS as usual', () => {
    round(AY, NEXT);
    readClue();
    fake.hear('a');
    wait(200);
    fake.hear('armut');
    wait(SETTLE_MS - 50);
    expect(judged).toEqual([]);
    wait(100);
    expect(judged).toEqual([{ q: 'Ay', text: 'a armut', verdict: 'wrong' }]);
  });
});

describe('completed wrong words are still wrong, two-letter ones too', () => {
  test("'al' for Ay: wrong after SETTLE_MS", () => {
    round(AY, NEXT);
    readClue();
    fake.hear('al');
    wait(SETTLE_MS + 10);
    expect(judged).toEqual([{ q: 'Ay', text: 'al', verdict: 'wrong' }]);
  });

  test('after a long silence, a wrong word whose final comes at once is wrong, not taken for the host (earlier words were over it)', async () => {
    round(SU, AY, NEXT);
    readClue();
    // A right answer over the reading of the next clue: this result has words heard over the host.
    l.clueStarts();
    host = true;
    l.hostSpeaking([questions[at].clue]);
    wait(300);
    fake.hear('su');
    host = false;
    l.hostDone();
    expect(judged).toEqual([{ q: 'Su', text: 'su', verdict: 'correct' }]);
    readClue();
    await idle(45_000);
    fake.hear('armut');
    fake.endUtterance();
    expect(judged).toEqual([{ q: 'Su', text: 'su', verdict: 'correct' }, { q: 'Ay', text: 'armut', verdict: 'wrong' }]);
  });
});

describe('next-question isolation', () => {
  test("a letter heard before the next clue starts never begins the next question's answer", () => {
    round(AY, SU, NEXT);
    readClue();
    fake.hear('a');
    fake.endUtterance();
    wait(300);
    skip();
    fake.hear('su');
    expect(judged).toEqual([{ q: 'Su', text: 'su', verdict: 'correct' }]);
  });

  test('same with the letter only interim, in the growing result', () => {
    round(AY, OK, NEXT);
    readClue();
    fake.hear('a');
    wait(300);
    skip();
    fake.hear('ok');
    expect(judged).toEqual([{ q: 'Ok', text: 'ok', verdict: 'correct' }]);
  });

  test('over the host: the letter then the word, said while the clue is read, is right', () => {
    round(EL, NEXT);
    l.clueStarts();
    host = true;
    l.hostSpeaking(['Vücudun bir uzvu.']);
    wait(300);
    fake.hear('e');
    wait(SETTLE_MS * 2);
    fake.hear('el');
    expect(judged).toEqual([{ q: 'El', text: 'e el', verdict: 'correct' }]);
  });
});

describe('two words, numbers', () => {
  test("two-word continuation: 'mustafa', a breath, 'kemal'", () => {
    round(Q('M', ['Mustafa Kemal']), NEXT);
    readClue();
    fake.hear('mustafa');
    wait(1200);
    expect(judged).toEqual([]);
    fake.hear('kemal');
    expect(judged).toEqual([{ q: 'Mustafa Kemal', text: 'mustafa kemal', verdict: 'correct' }]);
  });

  test("a letter, then a two-word answer: 's' → 'sezen' → 'sezen aksu'", () => {
    round(Q('S', ['Sezen Aksu']), NEXT);
    readClue();
    fake.hear('s');
    fake.endUtterance();
    wait(300);
    fake.hear('sezen');
    wait(400);
    fake.hear('aksu');
    expect(judged).toEqual([{ q: 'Sezen Aksu', text: 's sezen aksu', verdict: 'correct' }]);
  });

  test.each([
    ['Üç', '3'], ['F1', 'F1'], ['F1', 'f 1'], ['U2', 'u 2'], ['İlk 11', 'ilk 11'], ['Formula 1', 'formula bir'],
  ])('%s heard as "%s" is right at once (a digit is not a lone letter)', (answer, said) => {
    round(Q(answer[0], [answer]), NEXT);
    readClue();
    fake.hear(said);
    expect(judged).toEqual([{ q: answer, text: said.toLowerCase(), verdict: 'correct' }]);
  });
});

describe('Pas', () => {
  test("'pas' then 'geçiyorum' and its final 'pas geçiyorum': one Pas, the next question untouched", () => {
    round(AY, SU, NEXT);
    readClue();
    fake.hear('pas');
    expect(judged).toEqual([{ q: 'Ay', text: 'pas', verdict: 'pass' }]);
    wait(300);
    fake.hear('geçiyorum');
    wait(LATE_MS);
    fake.endUtterance();
    readClue();
    wait(5000);
    expect(judged).toEqual([{ q: 'Ay', text: 'pas', verdict: 'pass' }]);
    expect(at).toBe(1);
  });

  test("'pas' for Pasifik is not a Pas at once: 'pasifik' that follows is right", () => {
    round(Q('P', ['Pasifik']), NEXT);
    readClue();
    fake.hear('pas');
    wait(SETTLE_MS - 100);
    expect(judged).toEqual([]);
    fake.rewrite('pasifik');
    expect(judged).toEqual([{ q: 'Pasifik', text: 'pasifik', verdict: 'correct' }]);
  });

  test("a lone 'p', then 'pas': one Pas", () => {
    round(AY, NEXT);
    readClue();
    fake.hear('p');
    fake.endUtterance();
    wait(500);
    fake.hear('pas');
    fake.endUtterance();
    wait(3000);
    expect(judged).toEqual([{ q: 'Ay', text: 'p pas', verdict: 'pass' }]);
  });
});

// The phone, 22 Oct 17:28 (main 929c66e, trace harfiyen-voicetrace, 362.8 s):
// round 3, question tarih-3-A-1 (Avar), the host reading its opening line,
// nobody talking. iOS gave a final with no interim before it, its five
// guesses unrelated words, the best one the host's: "İşte / Ara / Kapat /
// İsterim / Evet". The echo filter dropped "İşte", "ara" moved up to best
// guess, and as a one-word attempt starting with A it was held and graded
// wrong once the host stopped: a wrong answer from silence.
describe('a no-speech final from iOS is no attempt', () => {
  const AVAR = { letter: 'A', answers: ['Avarlar', 'Avar'], clue: "Orta Asya'dan gelip Avrupa'ya yerleşen boy... A ile başlıyor." };
  const opening = () => {
    l.clueStarts();
    host = true;
    l.hostSpeaking(['İşte sağ cepten sorular çıkıyor efendim.', AVAR.clue]);
  };

  test('the captured bundle: its best guess the host\'s, the rest promoted: no verdict, before or after the host stops', () => {
    round(AVAR, NEXT);
    opening();
    wait(1200);
    final('İşte', 'Ara', 'Kapat', 'İsterim', 'Evet');
    wait(1500);
    host = false;
    l.hostDone();
    wait(5000);
    expect(judged).toEqual([]);
    expect(at).toBe(0);
  });

  test('a final with no interim whose guesses share no word (iOS guessing at noise): no wrong verdict', () => {
    round(Q('E', ['El']), NEXT);
    readClue();
    final('Evet', 'Hayır', 'Gönder', 'Tamam');
    wait(3000);
    expect(judged).toEqual([]);
  });

  test('but a right answer among those guesses still counts ("Ara" is the answer)', () => {
    round(Q('A', ['Ara']), NEXT);
    opening();
    wait(1200);
    final('İşte', 'Ara', 'Kapat', 'İsterim', 'Evet');
    expect(judged).toEqual([{ q: 'Ara', text: 'ara', verdict: 'correct' }]);
  });

  test('and so does Pas said once, as a final with no interim and varied guesses', () => {
    round(AY, NEXT);
    readClue();
    final('Pas', 'Bas', 'Paşa', 'Bass');
    expect(judged).toEqual([{ q: 'Ay', text: 'pas', verdict: 'pass' }]);
  });

  test.each([['ay', AY], ['su', SU], ['el', EL], ['un', UN], ['ok', OK]] as const)('a final-only short answer: "%s" is right', (word, q) => {
    round(q, NEXT);
    readClue();
    final(word, `${word}h`, 'hey');
    expect(judged).toEqual([{ q: q.answers[0], text: word, verdict: 'correct' }]);
  });

  test('a real wrong word heard only as a final is still wrong (its guesses agree)', () => {
    round(AY, NEXT);
    readClue();
    final('armut');
    wait(100);
    expect(judged).toEqual([{ q: 'Ay', text: 'armut', verdict: 'wrong' }]);
    round(Q('K', ['Kayak']), NEXT);
    readClue();
    final('kale', 'kaleler', 'kalem');
    expect(judged).toEqual([{ q: 'Kayak', text: 'kale', verdict: 'wrong' }]);
  });
});
