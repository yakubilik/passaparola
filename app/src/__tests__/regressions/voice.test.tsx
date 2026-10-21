import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import { CATEGORIES } from '../../data/questions';
import { judgeSpoken, norm } from '../../game/normalize';
import { SETTINGS_KEY } from '../../store/settings';
import { hearHost, verdicts as heardVerdicts } from '../../test-utils/echoCorpus';
import { fakeRecognizer as rec } from '../../test-utils/fakeRecognizer';
import { pressStart, untilClue } from '../../test-utils/round';
import { host, listener, sounds } from '../../voice/engine';
import { clueLine } from '../../voice/lines';
import { ECHO_TAIL_MS, LATE_MS, SETTLE_MS } from '../../voice/listener';
import { CUE_LEAD_MS } from '../../voice/sounds';

// Every complaint Yakup made about speech recognition and judging in the
// Harfiyen tickets (#318-#391), one test each, titled with the ticket and his
// words, all in one suite: a fix for one of them may not undo another (the
// fixes since 18 Oct kept doing that, each tested only for its own symptom).
// The game is played through the real screens, the mic being the recognizer
// that behaves like iOS (one growing result, interim results, a final-like
// result when an utterance ends, short words held back). The echo corpus,
// every line the host can say, is in voiceEcho.test.ts.
//
// The questions: tarih level 1 as written; bilim level 1 with Mars as its
// only M question (#342); sanat level 1 with the answers of its first letters
// swapped for the ones he reported trouble with.
jest.mock('../../data/questions', () => {
  const mocked = require('../../test-utils/mockQuestions').mockQuestions({ tarih: [1], bilim: [1], sanat: [1], spor: [], cografya: [] });
  const swapped: Record<string, string[]> = { A: ['Sezen Aksu'], B: ['Mustafa Kemal'], C: ['Ay'], Ç: ['Su'], D: ['Cimnastik'] };
  return {
    ...mocked,
    CATEGORIES: mocked.CATEGORIES.map((c: any) => ({
      ...c,
      levels: c.levels.map((l: any) => ({
        ...l,
        questions: c.category === 'sanat'
          ? l.questions.map((q: any) => (swapped[q.letter] ? { ...q, answers: swapped[q.letter] } : q))
          : c.category === 'bilim' ? l.questions.filter((q: any) => q.letter !== 'M' || q.answers[0] === 'Mars') : l.questions,
      })),
    })),
  };
});
jest.setTimeout(300_000);

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
function question(clue: string) {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q;
  throw new Error('no question with clue ' + clue);
}
const clueText = () => { const k = screen.getByTestId('clue').props.children; return Array.isArray(k) ? k.join('') : String(k); };
const count = (what: 'doğru' | 'yanlış' | 'pas') => Number(screen.getByLabelText(new RegExp(`^\\d+ ${what}$`)).props.accessibilityLabel.split(' ')[0]);
const status = (letter: string) => screen.getByLabelText(new RegExp(`^${letter} harfi, `)).props.accessibilityLabel.replace(/^.* harfi, /, '');
const verdicts = () => ({ doğru: count('doğru'), yanlış: count('yanlış'), pas: count('pas') });

async function untilHostQuiet() {
  for (let i = 0; i < 200 && host.speaking; i++) await wait(50);
  expect(host.speaking).toBe(false);
}
async function quietRoom() {
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 100);
}
async function play(url: string) {
  await renderRouter('./src/app', { initialUrl: url });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  await pressStart();
}
const tarih = () => play('/game?cats=tarih&level=1&seed=7');
const sanat = () => play('/game?cats=sanat&level=1&seed=7');

// No echo cancellation (voice processing off since 19 Oct 2026): the mic hears
// every line the host says, word by word as iOS writes it, as the line starts,
// or (`lagMs`) all of it in one late result that long after the host stops,
// each word passed through `mishear`. When the host stops (or is cut off) the
// loudspeaker goes quiet: words not yet heard are not heard.
let echoTimers: ReturnType<typeof setTimeout>[] = [];
let restoreEcho = () => {};
function echoHostIntoMic({ mishear = (w: string) => [w], lagMs = 0 } = {}) {
  const atEnd = lagMs > 0;
  const orig = host.onSpeaking;
  let last: string[] = [];
  const say = (texts: string[]) => {
    const ws = texts.flatMap((t) => norm(t).split(' ').filter(Boolean)).flatMap(mishear);
    if (atEnd) echoTimers.push(setTimeout(() => rec.hear(ws.join(' ')), lagMs));
    else ws.forEach((w, i) => echoTimers.push(setTimeout(() => rec.hear(w), i * 120)));
  };
  const hush = () => { echoTimers.forEach(clearTimeout); echoTimers = []; };
  host.onSpeaking = (texts) => {
    orig(texts);
    if (texts) last = texts;
    if (!!texts === atEnd) hush();
    if (texts && !atEnd) say(texts);
    if (!texts && atEnd) say(last);
  };
  restoreEcho = () => { host.onSpeaking = orig; };
}
// How iOS splits a long word it is unsure of: "başlıyor" → "baş lıyor".
const split = (w: string) => (w.length >= 6 ? [w.slice(0, 3), w.slice(3)] : [w]);

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => {} }) as ReturnType<typeof AppState.addEventListener>);
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  host.cancel();
  listener.release();
  rec.reset();
  listener.renewals = 0;
  sounds.played.length = 0;
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  echoTimers.forEach(clearTimeout);
  echoTimers = [];
  restoreEcho();
  restoreEcho = () => {};
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Pas through five clues with the button, the host reading each one into the mic.
async function fiveCluesByButton() {
  for (const letter of ['A', 'B', 'C', 'Ç', 'D']) {
    await untilClue();
    expect(status(letter)).toBe('sırada');
    await quietRoom();
    await wait(2000);
    await fireEvent.press(screen.getByLabelText('Pas'));
    await wait(CUE_LEAD_MS + 10);
  }
}

describe('host speech is never an answer', () => {
  test('#318: oyun konuşuyor, onun konuşması mikrofona giriyor, kendi kendine sürekli yanlış cevap veriyor', async () => {
    echoHostIntoMic();
    await tarih();
    await fiveCluesByButton();
    expect(verdicts()).toEqual({ doğru: 0, yanlış: 0, pas: 5 });
  });

  test("#391: the host's own speech, heard through the loudspeaker, is still judged as my answer (correct, pas or wrong)", async () => {
    // As iOS writes it: long words split ("baş lıyor": the "baş" of every "... ile
    // başlıyor" is a Pas word), the words arriving while the host reads.
    echoHostIntoMic({ mishear: split });
    await tarih();
    await fiveCluesByButton();
    expect(verdicts()).toEqual({ doğru: 0, yanlış: 0, pas: 5 });
  });

  test("#391: the host's speech heard late, right after the host stops, is still judged as my answer", async () => {
    // The recognizer is behind the loudspeaker: the line comes in one result 300 ms
    // after the host stops (inside the hostRecent window), and settles after it.
    echoHostIntoMic({ mishear: split, lagMs: 300 });
    await tarih();
    await fiveCluesByButton();
    expect(verdicts()).toEqual({ doğru: 0, yanlış: 0, pas: 5 });
  });

  test('#391: with the host in the mic, my own answers still count: right and Pas over the reading, wrong after it', async () => {
    echoHostIntoMic({ mishear: split });
    await tarih();
    expect(host.speaking).toBe(true);
    await wait(300);
    await act(() => rec.hear(question(clueText()).answers[0]));
    expect(status('A')).toBe('doğru');
    await untilClue();
    expect(host.speaking).toBe(true);
    await wait(SETTLE_MS + 100);
    await act(() => rec.hear('pas'));
    expect(status('B')).toBe('pas');
    await untilClue();
    await quietRoom();
    await wait(1500);
    await act(() => rec.hear('kesinlikle'));
    await wait(SETTLE_MS + 20);
    expect(status('C')).toBe('yanlış');
    expect(verdicts()).toEqual({ doğru: 1, yanlış: 1, pas: 1 });
  });
});

test("#342: I said 'Merkür' over the Mars clue; it showed under the field but nothing happened, only when I said it again was it judged wrong", async () => {
  await play('/game?cats=bilim&level=1&seed=3');
  while (question(clueText()).answers[0] !== 'Mars') {
    await fireEvent.press(screen.getByLabelText('Pas'));
    await wait(CUE_LEAD_MS + 10);
    await untilClue();
  }
  expect(host.speaking).toBe(true);
  await act(() => rec.hear('Merkür'));
  expect(screen.getByTestId('voice-status')).toHaveTextContent('Duydum: Merkür…');
  // Judged once, within 300 ms of the host finishing, with its cue: never lost.
  await untilHostQuiet();
  await wait(300);
  expect(status('M')).toBe('yanlış');
  expect(count('yanlış')).toBe(1);
  expect(sounds.played.filter((c) => c === 'wrong')).toEqual(['wrong']);
});

describe('answers heard late or not at all', () => {
  test('#337: the mic sometimes hears the answer very late or not at all', async () => {
    await tarih();
    // A right answer counts the moment it is heard, while the host reads and after.
    expect(host.speaking).toBe(true);
    await act(() => rec.hear(question(clueText()).answers[0]));
    expect(status('A')).toBe('doğru');
    await untilClue();
    await quietRoom();
    await act(() => rec.hear(question(clueText()).answers[0]));
    expect(status('B')).toBe('doğru');
    // A wrong one within 1.2 s of the player stopping.
    await untilClue();
    await quietRoom();
    await act(() => rec.hear('kesinlikle'));
    await wait(1200);
    expect(status('C')).toBe('yanlış');
  });

  test("#351: answers recognised late or not at all, short words ('Ay') missed", async () => {
    await sanat();
    // One request for the round, expecting all of its answers (short ones first) and the pass words.
    expect(rec.starts).toBe(1);
    expect(rec.lastOptions).toMatchObject({ lang: 'tr-TR', continuous: true, interimResults: true, requiresOnDeviceRecognition: true });
    expect(rec.lastOptions.contextualStrings.slice(0, 5)).toEqual(['pas', 'geç', 'pas geçiyorum', 'Ay', 'Su']);
    // A word iOS holds back until the utterance ends still counts then.
    await act(() => rec.hear('pas'));
    await untilClue();
    await wait(SETTLE_MS + 50);
    await act(() => rec.hear('pas'));
    await untilClue();
    await wait(SETTLE_MS + 50);
    expect(question(clueText()).letter).toBe('C');
    await quietRoom();
    await act(() => rec.holdBack('ay'));
    await wait(1000);
    await act(() => rec.endUtterance());
    expect(status('C')).toBe('doğru');
  });

  test('#337: ay gibi cevapları algılayamıyor, arkasından 1 büyük kelime söylemek gerekiyor', async () => {
    await sanat();
    await act(() => rec.hear('pas'));
    await untilClue();
    await wait(SETTLE_MS + 50);
    await act(() => rec.hear('pas'));
    await untilClue();
    await wait(SETTLE_MS + 50);
    // "ay" alone over the reading, "su" alone after it: each at once.
    expect(host.speaking).toBe(true);
    await act(() => rec.hear('ay'));
    expect(status('C')).toBe('doğru');
    await untilClue();
    await quietRoom();
    await act(() => rec.hear('su'));
    expect(status('Ç')).toBe('doğru');
    expect(count('yanlış')).toBe(0);
  });
});

test("#337: 'cimnastik' was heard as 'jimnastik' and judged wrong", async () => {
  // Dictation slips forgiven (be10f04), near misses still wrong.
  for (const [heard, answer] of [['jimnastik', 'Cimnastik'], ['yogurt', 'Yoğurt'], ['tardigrad', 'Tardigrat'], ['tazmanya', 'Tasmanya'], ['3', 'Üç']]) {
    expect([heard, judgeSpoken([heard], [answer])]).toEqual([heard, 'correct']);
  }
  for (const [heard, answer] of [['kalıp', 'Kalp'], ['salim', 'Selim'], ['kanon', 'Kanun']]) {
    expect([heard, judgeSpoken([heard], [answer])]).toEqual([heard, 'wrong']);
  }
  await sanat();
  for (let i = 0; i < 4; i++) {
    await act(() => rec.hear('pas'));
    await untilClue();
    await wait(SETTLE_MS + 50);
  }
  expect(question(clueText()).answers).toEqual(['Cimnastik']);
  await quietRoom();
  await act(() => rec.hear('jimnastik'));
  expect(status('D')).toBe('doğru');
});

describe('Pas', () => {
  test("#337: saying 'pas' must always pass", async () => {
    await tarih();
    const sayings = ['pas', 'geç', 'pas geçiyorum', 'bilmiyorum', 'pass'];
    for (const [i, said] of sayings.entries()) {
      // Every other one over the reading, the rest once the host is quiet.
      if (i % 2) await quietRoom();
      else expect(host.speaking).toBe(true);
      for (const w of said.split(' ')) await act(() => rec.hear(w));
      expect(count('pas')).toBe(i + 1);
      await act(() => rec.endUtterance());
      await untilClue();
    }
    expect(verdicts()).toEqual({ doğru: 0, yanlış: 0, pas: sayings.length });
  });

  test("#362: I have to say 'pas' at least twice before it passes", async () => {
    await tarih();
    // Held back by iOS until the utterance ends, after the reading: once.
    await quietRoom();
    await act(() => rec.holdBack('pas'));
    await wait(800);
    await act(() => rec.endUtterance());
    expect(status('A')).toBe('pas');
    // Over the reading of the next clue, after the host's words: once.
    await untilClue();
    expect(host.speaking).toBe(true);
    await act(() => rec.hear(question(clueText()).clue.split(' ').slice(0, 2).join(' ')));
    await wait(300);
    await act(() => rec.hear('pas'));
    expect(status('B')).toBe('pas');
    // Right after that verdict's tail, a second Pas after a pause: once more.
    await wait(SETTLE_MS + 300);
    await act(() => rec.hear('pas'));
    expect(status('C')).toBe('pas');
    await act(() => rec.endUtterance());
    await wait(SETTLE_MS * 3);
    expect(verdicts()).toEqual({ doğru: 0, yanlış: 0, pas: 3 });
  });
});

describe("a judged answer's words never reach the next question", () => {
  test("#358: 'Sezen Aksu' is judged right, then 'Aksu' is taken as the answer to the next question and judged wrong", async () => {
    await sanat();
    await act(() => rec.hear('sezen'));
    await wait(400);
    await act(() => rec.rewrite('sezen aksu'));
    expect(status('A')).toBe('doğru');
    await untilClue();
    await wait(600);
    await act(() => rec.endUtterance());  // its final, after the next clue started
    await wait(SETTLE_MS * 4);
    await quietRoom();
    await wait(2000);
    expect(status('B')).toBe('sırada');
    expect(verdicts()).toEqual({ doğru: 1, yanlış: 0, pas: 0 });
  });

  test("#358: a two-word answer is judged on its first word ('Mustafa' for 'Mustafa Kemal')", async () => {
    await sanat();
    await act(() => rec.hear('pas'));
    await untilClue();
    await quietRoom();
    await act(() => rec.hear('mustafa'));
    await wait(1200);  // a breath between the words
    expect(status('B')).toBe('sırada');
    await act(() => rec.hear('kemal'));
    expect(status('B')).toBe('doğru');
  });

  test("#358 (36eb4f2): a judged answer's late words and its final reach the next question", async () => {
    await tarih();
    await quietRoom();
    await act(() => rec.hear('kesinlikle'));
    await wait(SETTLE_MS + 20);
    expect(status('A')).toBe('yanlış');
    await act(() => rec.hear('değil'));  // the same utterance going on, within LATE_MS
    await wait(LATE_MS);
    await act(() => rec.endUtterance());
    await untilClue();
    await quietRoom();
    await wait(2000);
    expect(status('B')).toBe('sırada');
    expect(verdicts()).toEqual({ doğru: 0, yanlış: 1, pas: 0 });
  });

  test('#358 (62ce403): a new word said after a pause, right after a verdict, is lost', async () => {
    await tarih();
    await act(() => rec.hear('pas'));
    expect(status('A')).toBe('pas');
    await untilClue();
    await wait(SETTLE_MS + 50);
    // Within LATE_MS of the verdict, in the same growing result: the next answer all the same.
    await act(() => rec.hear(question(clueText()).answers[0]));
    expect(status('B')).toBe('doğru');
  });
});

test('#357: volume jumps on every new question and the correct/pas cues are gone (recognizer restart per question)', async () => {
  await tarih();
  for (let i = 0; i < 4; i++) {
    await act(() => rec.hear(i % 2 ? 'pas' : question(clueText()).answers[0]));
    await untilClue();
    await wait(SETTLE_MS + 50);
  }
  expect(verdicts()).toEqual({ doğru: 2, yanlış: 0, pas: 2 });
  expect(sounds.played.filter((c) => c === 'correct' || c === 'pas')).toEqual(['correct', 'pas', 'correct', 'pas']);
  expect(rec.starts).toBe(1);
  expect(rec.aborts).toBe(0);
  expect(listener.renewals).toBe(0);
});

// #405 (#342 again, through #393's host-echo rules): a right answer said over
// the host was taken for the host's own words, "Anı" as the "anı" of the
// clue's "tanık", "Dörtlük" as its "dört" garbled, and dropped without a
// verdict or a cue. Every question of every level of every category, the
// answer said while the host reads its clue, through the real listener and the
// round's verdict rule: alone, and after the first half of the clue heard
// through the loudspeaker in the same result. Only the host's own words may be
// dropped: where the answer is what the host is saying (hostSays), text cannot
// tell the player from the host, and those are listed here with why.
const ALL = (jest.requireActual('../../data/questions') as typeof import('../../data/questions')).CATEGORIES;
const HOST_SAYS_IT: Record<string, string> = {
  // The clue says the answer: "'Za-Gor-Te-Nay' dediği" is "za gor te nay" in the mic, "zagor" the host's own words.
  'spor-2-Z-4': 'the host reads "Za-Gor" in the clue',
};
test('#342/#405: the right answer said over the host reading its clue is judged correct, every question of every level', () => {
  const missed: string[] = [];
  let n = 0;
  for (const c of ALL) for (const lv of c.levels) for (const q of lv.questions) {
    const line = clueLine(q).text;
    const said = norm(q.answers[0]).split(' ');
    const before = norm(line).split(' ').slice(0, Math.ceil(norm(line).split(' ').length / 2));
    for (const heard of [said, [...before, ...said]]) {
      n++;
      const vs = heardVerdicts(hearHost(line, heard, 'during', q.answers), q.answers, q.letter);
      if (vs.join() !== 'correct') missed.push(`${q.id} "${q.answers[0]}" ${heard === said ? 'alone' : 'after the host'}: [${vs}] over "${line}"`);
    }
  }
  expect(n).toBeGreaterThan(3000);
  expect(missed.filter((m) => !(m.split(' ')[0] in HOST_SAYS_IT)).join('\n')).toBe('');
  expect(Object.keys(HOST_SAYS_IT).filter((id) => !missed.some((m) => m.startsWith(id + ' ')))).toEqual([]);
});

// #438: after a long wait iOS gives the first letter of a spoken word alone,
// as an interim and as its utterance's final, before (or instead of) the word.
// The letter is not an attempt: no verdict, no score, no turn change, and the
// word that completes it is judged once.
describe('a word cut to its first letter', () => {
  // Through A and B with a Pas each: C is "Ay", Ç is "Su".
  async function toC() {
    await sanat();
    for (let i = 0; i < 2; i++) {
      await act(() => rec.hear('pas'));
      await untilClue();
      await wait(SETTLE_MS + 50);
    }
    expect(question(clueText()).answers).toEqual(['Ay']);
    await quietRoom();
  }

  test("#438: after a long wait a spoken word is reduced to its first letter and graded wrong", async () => {
    await toC();
    await wait(20_000);
    await act(() => rec.hear('a'));
    await wait(SETTLE_MS * 3);
    await act(() => rec.endUtterance());
    await wait(500);
    expect(status('C')).toBe('sırada');
    expect(question(clueText()).answers).toEqual(['Ay']);
    expect(verdicts()).toEqual({ doğru: 0, yanlış: 0, pas: 2 });
    expect(sounds.played.filter((c) => c === 'wrong')).toEqual([]);
    // The word itself, a moment later: judged once, right.
    await act(() => rec.hear('ay'));
    expect(status('C')).toBe('doğru');
    await act(() => rec.endUtterance());
    await untilClue();
    await quietRoom();
    await wait(2000);
    expect(status('Ç')).toBe('sırada');
    expect(verdicts()).toEqual({ doğru: 1, yanlış: 0, pas: 2 });
    expect(sounds.played.filter((c) => c === 'correct')).toEqual(['correct']);
  });

  test('#438: a completed wrong word after its first letter is still graded wrong, once', async () => {
    await toC();
    await wait(45_000);
    await act(() => rec.hear('a'));
    await act(() => rec.endUtterance());
    await wait(SETTLE_MS * 2);
    expect(count('yanlış')).toBe(0);
    await act(() => rec.hear('armut'));
    await wait(SETTLE_MS + 20);
    expect(status('C')).toBe('yanlış');
    await act(() => rec.endUtterance());
    await untilClue();
    await quietRoom();
    await wait(2000);
    expect(status('Ç')).toBe('sırada');
    expect(verdicts()).toEqual({ doğru: 0, yanlış: 1, pas: 2 });
  });
});
