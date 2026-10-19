import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { REVEAL_MS } from '../game/useRound';
import { SETTINGS_KEY } from '../store/settings';
import { audio } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { pressStart, settle, untilClue } from '../test-utils/round';
import { C } from '../ui/theme';
import { host, listener, sounds } from '../voice/engine';
import { answerLine, clueLine, host as hostLine, type Line } from '../voice/lines';
import { ECHO_TAIL_MS, SETTLE_MS } from '../voice/listener';
import { RECOGNITION_OPTIONS } from '../voice/recognizer';
import { BG_DUCKED, BG_MAX, BG_VOLUME, CUE_LEAD_MS, DEFAULT_GAIN, DUCK } from '../voice/sounds';

// A spoken round, played by a recognizer that behaves like iOS (one growing
// result, never final) and a host whose clips and speech take fixed time.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

function question(clue: string) {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q;
  throw new Error('no question with clue ' + clue);
}

function clueText(): string {
  const kids = screen.getByTestId('clue').props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids);
}

// How the host says a line: its clip when there is one, else expo-speech.
const said = (l: Line) => (host.hasClip(l.key!) ? `clip:${l.key}` : `tts:${l.text}`);

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
async function say(words: string) {
  await act(() => rec.hear(words));
  await wait(SETTLE_MS + 20);
}

jest.setTimeout(180_000);

// AppState, driven by the tests: background / inactive / active.
const appState = new Set<(s: AppStateStatus) => void>();
async function goTo(state: AppStateStatus) {
  await act(() => appState.forEach((h) => h(state)));
}

beforeEach(async () => {
  jest.useFakeTimers();
  appState.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
    appState.add(h as (s: AppStateStatus) => void);
    return { remove: () => appState.delete(h as (s: AppStateStatus) => void) } as ReturnType<typeof AppState.addEventListener>;
  });
  jest.spyOn(Math, 'random').mockReturnValue(0.99); // the host does not add "Doğru." before the next clue
  host.cancel();
  listener.release();  // a mic still closing after the last test's screen went
  rec.reset();
  listener.renewals = 0;
  sounds.played.length = 0;
  host.said.length = 0;
  await AsyncStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a spoken round: answer during the reading, a wrong answer, a pas; one recognition request for the round, expecting all its answers', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  expect(sounds.played).toEqual(['theme']);
  expect(screen.getByTestId('voice-toggle').props.value).toBe(true);
  // The iOS session: loudspeaker, mic open, not muted by the silent switch.
  expect(audio.active).toBe(true);
  expect(audio.mode).toEqual({ playsInSilentMode: true, allowsRecording: true, shouldRouteThroughEarpiece: false, interruptionMode: 'mixWithOthers' });
  // Answered by voice: the keyboard does not open on its own.
  expect(screen.getByTestId('answer').props.autoFocus).toBe(false);

  await pressStart();
  expect(rec.starts).toBe(1);
  expect(rec.lastOptions).toMatchObject({ lang: 'tr-TR', continuous: true, interimResults: true });
  expect(sounds.bgPlaying).toBe(true);

  // The host reads A (after "İşte sağ cepten sorular çıkıyor"); the clock waits, the bed is lowered.
  const a = question(clueText());
  expect(host.speaking).toBe(true);
  expect(host.said).toEqual([said(hostLine('go')), said(clueLine(a))]);
  expect(sounds.bgVolume).toBeCloseTo(BG_DUCKED * DEFAULT_GAIN, 6);
  expect(screen.getByTestId('voice-status')).toHaveTextContent(/Sunucu okuyor/);
  await wait(1000);
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');

  // Answered while the host is still reading: A is green, the reading stops, B is read.
  await say(`cevap ${a.answers[0]}`);
  expect(screen.getByLabelText('A harfi, doğru')).toHaveStyle({ backgroundColor: C.green });
  expect(sounds.played).toContain('correct');
  const b = question(clueText());
  expect(host.said[host.said.length - 1]).toBe(said(clueLine(b)));
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');

  // The mic hears the host reading B: not an answer.
  await say(`${b.clue}`);
  expect(screen.getByLabelText('B harfi, sırada')).toBeOnTheScreen();

  // The reading ends and the clock starts.
  await wait(3000);
  expect(host.speaking).toBe(false);
  expect(sounds.bgVolume).toBeCloseTo(BG_VOLUME * DEFAULT_GAIN, 6);
  expect(screen.getByTestId('voice-status')).toHaveTextContent(/Dinliyorum/);
  await wait(2000);
  expect(screen.getByTestId('clock')).not.toHaveTextContent('03:00');

  // Wrong: B turns red; the host says "Değil, olmadı." and the answer, the reveal waits for it.
  await say('bambaşka');
  expect(screen.getByLabelText('B harfi, yanlış')).toHaveStyle({ backgroundColor: C.red });
  expect(screen.getByText(b.answers[0])).toBeOnTheScreen();
  expect(sounds.played).toContain('wrong');
  await wait(REVEAL_MS + 50);
  expect(host.said.slice(-2)).toEqual([said(hostLine('wrong')), said(answerLine(b))]);
  expect(screen.getByTestId('reveal')).toBeOnTheScreen();
  await wait(2000);
  expect(screen.getByLabelText('C harfi, sırada')).toBeOnTheScreen();

  // Pas while C is read: C turns yellow, Ç is next.
  const c = question(clueText());
  await say('pas');
  expect(screen.getByLabelText('C harfi, pas')).toHaveStyle({ backgroundColor: C.yellow });
  expect(screen.getByLabelText('Ç harfi, sırada')).toBeOnTheScreen();
  expect(sounds.played).toContain('pas');

  // Typing still works with the voice on.
  const c2 = question(clueText());
  await fireEvent.changeText(screen.getByTestId('answer'), c2.answers[0]);
  await fireEvent(screen.getByTestId('answer'), 'submitEditing');
  expect(screen.getByLabelText('Ç harfi, doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('2 doğru')).toBeOnTheScreen();
  expect(screen.getByLabelText('1 pas')).toBeOnTheScreen();
  expect(screen.getByLabelText('1 yanlış')).toBeOnTheScreen();

  // One request for the whole round, never restarted for a new question (each
  // start rebuilds the iOS audio engine), expecting every answer of the round.
  await untilClue();
  const d = question(clueText());
  expect(rec.starts).toBe(1);
  expect(listener.renewals).toBe(0);
  expect(rec.aborts).toBe(0);
  const ctx: string[] = rec.lastOptions.contextualStrings;
  for (const q of [a, b, c, c2, d]) expect(ctx).toEqual(expect.arrayContaining([q.answers[0]]));
  expect(ctx.slice(0, 3)).toEqual(['pas', 'geç', 'pas geçiyorum']);

  // The last ten seconds warn every second; time up closes the mic and the host says so.
  await wait(3000);
  const left = () => { const [m, sec] = String(screen.getByTestId('clock').props.children).split(':'); return Number(m) * 60 + Number(sec); };
  while (left() > 20) await wait(10_000);
  for (let i = 0; i < 30 && !screen.queryByText('Az kaldı!'); i++) await wait(1000);
  expect(sounds.played.filter((s) => s === 'warn').length).toBeGreaterThanOrEqual(9);
  expect(await screen.findByText('Az kaldı!')).toBeOnTheScreen();
  expect(sounds.bgPlaying).toBe(false);
  expect(host.said).toContain(said(hostLine('timeup')));
  // The quiet minutes at D: on-device recognition has no time limit, so the
  // one request ran the whole round; the mic closed for good at time up, once
  // the host's last line was over.
  for (let i = 0; i < 40 && host.speaking; i++) await wait(250);
  await wait(500);
  expect(rec.starts).toBe(1);
  expect(listener.renewals).toBe(0);
  expect(rec.aborts).toBe(1);
  expect(rec.running).toBe(false);
});

test('voice off: no host, no mic, the cues still play', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: false }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(screen.getByTestId('answer').props.autoFocus).toBe(true);
  await pressStart();
  expect(rec.starts).toBe(0);
  expect(host.said).toEqual([]);
  expect(screen.queryByTestId('voice-status')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Pas'));
  expect(sounds.played).toEqual(['theme', 'bg', 'pas']);
});

describe('mic check before the first game', () => {
  async function open() {
    await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1' });
    expect(await screen.findByText('Sesli cevap verelim')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Mikrofonu dene'));
  }

  test('says what it heard, then the game opens', async () => {
    await open();
    expect(screen.getByText('Dinliyorum… bir şey söyle.')).toBeOnTheScreen();
    await say('Ankara');
    expect(screen.getByTestId('mic-result')).toHaveTextContent('DUYDUM“Ankara”');
    await fireEvent.press(screen.getByText('Oyuna geç'));
    expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
    expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toMatchObject({ voice: true, micChecked: true });
  });

  test('permission off', async () => {
    rec.granted = false;
    await open();
    expect(await screen.findByText(/izni kapalı/)).toBeOnTheScreen();
    expect(screen.getByTestId('mic-result')).toHaveTextContent(/^DUYAMADIM/);
    expect(rec.starts).toBe(0);
  });

  test('Siri and Dictation off', async () => {
    rec.available = false;
    await open();
    expect(await screen.findByText(/Siri ve Dikte kapalı/)).toBeOnTheScreen();
  });

  test('nothing said', async () => {
    await open();
    await act(() => rec.emit('end'));
    expect(screen.getByText(/Ses gelmedi/)).toBeOnTheScreen();
  });

  test('"yazarak oyna" turns the voice off and opens the typed game', async () => {
    await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1' });
    await fireEvent.press(await screen.findByText('Sesi kapat, yazarak oyna'));
    expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
    expect(screen.getByTestId('voice-toggle').props.value).toBe(false);
  });
});

async function startVoiceGame() {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await pressStart();
}

test("the host's own voice in the mic never gives a wrong answer; echo cancellation is on", async () => {
  await startVoiceGame();
  // iOS voice processing takes the phone's own sound out of the mic.
  expect(rec.lastOptions).toMatchObject({ iosVoiceProcessingEnabled: false, iosCategory: { category: 'playAndRecord', mode: 'default' } });

  // While the host reads, the mic picks up a garbled bit of it (the endings
  // misheard): not an answer, and nothing judged.
  expect(host.speaking).toBe(true);
  const clue = clueText().replace(/[.,]/g, '').split(' ').filter((w) => /^[a-zçğıöşü]{6,}$/i.test(w));
  await say(clue.slice(0, 2).map((w) => w.slice(0, -2) + 'ler').join(' '));
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  expect(screen.getByTestId('voice-status')).not.toHaveTextContent(/yanlış/);

  // Just after the reading (inside the tail): its last word, split in two, is still not an answer.
  for (let i = 0; i < 20 && host.speaking; i++) await wait(500);
  expect(host.speaking).toBe(false);
  const last = clue[clue.length - 1];
  await say(`${last.slice(0, 3)} ${last.slice(3)}`);
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  expect(screen.getByLabelText('0 yanlış')).toBeOnTheScreen();

  // Words that are not the host's are the player's.
  await say('bambaşka');
  expect(screen.getByLabelText('A harfi, yanlış')).toBeOnTheScreen();
  expect(screen.getByLabelText('1 yanlış')).toBeOnTheScreen();
});

test('in the background everything goes quiet, the mic closes and the clock stops; back in front it all resumes', async () => {
  await startVoiceGame();
  const a = question(clueText());
  expect(host.speaking).toBe(true);
  expect(sounds.bgPlaying).toBe(true);
  expect(rec.starts).toBe(1);

  await goTo('background');
  expect(host.speaking).toBe(false);
  expect(sounds.bgPlaying).toBe(false);
  expect(rec.running).toBe(false);
  expect(rec.aborts).toBe(1);
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');
  await wait(20_000);
  expect(screen.getByTestId('clock')).toHaveTextContent('03:00');

  await goTo('active');
  await settle();
  expect(sounds.bgPlaying).toBe(true);
  expect(rec.starts).toBe(2);
  // The clue is read again, then the clock runs.
  expect(host.speaking).toBe(true);
  expect(host.said[host.said.length - 1]).toBe(said(clueLine(a)));
  for (let i = 0; i < 20 && host.speaking; i++) await wait(500);
  await wait(2000);
  expect(screen.getByTestId('clock')).not.toHaveTextContent('03:00');
  await say(a.answers[0]);
  expect(screen.getByLabelText('A harfi, doğru')).toBeOnTheScreen();
});

test('voice off: the background still silences the cues and stops the clock', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  await pressStart();
  await wait(2000);
  const before = String(screen.getByTestId('clock').props.children);
  await goTo('inactive');
  expect(sounds.bgPlaying).toBe(false);
  await wait(10_000);
  expect(screen.getByTestId('clock')).toHaveTextContent(before);
  await goTo('active');
  await settle();
  expect(sounds.bgPlaying).toBe(true);
  await wait(2000);
  expect(screen.getByTestId('clock')).not.toHaveTextContent(before);
});

test('pass and play: "hazırım" starts each turn on the Sıra screen, and one mic serves the whole match (one request, never closed)', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: `/match?names=${encodeURIComponent(JSON.stringify(['Ece', 'Fırat']))}&cats=karisik&level=1&seed=5` });
  expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Ece');
  await act(async () => {});
  expect(screen.getByTestId('say-ready')).toHaveTextContent('ya da “hazırım” de');
  await settle();  // the theme and the host wait for the mic's start to settle
  expect(sounds.played).toContain('theme');
  expect(rec.starts).toBe(1);
  expect(host.said).toEqual([said(hostLine('turn'))]);
  await wait(3000);

  await say('hazırım');
  expect(screen.queryByTestId('handover')).toBeNull();
  expect(screen.getByTestId('turn-player')).toHaveTextContent('ECE');
  expect(host.speaking).toBe(true);  // Ece's first clue

  // "pas" while the host is still reading Ece's first clue: passed at once.
  expect(host.speaking).toBe(true);
  await act(() => rec.hear('pas'));
  // The Pas result card: the host bridges to the next player, nothing moves on by itself.
  expect(await screen.findByTestId('turn-result')).toHaveTextContent('Pas');
  expect(screen.getByText('Sıradaki oyuncu: Fırat')).toBeOnTheScreen();
  await act(async () => {});
  expect(host.said.at(-1)).toBe(said(hostLine('pass_next')));
  await wait(10_000);
  expect(screen.queryByTestId('handover')).toBeNull();
  // "hazırım" moves on to the hand-over, as the button does.
  await say('hazırım');
  expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Fırat');
  expect(screen.getByTestId('handover-note')).toHaveTextContent('Ece: pas');
  await act(async () => {});
  await wait(3000);
  await say('tamam hazırım');
  expect(screen.getByTestId('turn-player')).toHaveTextContent('FIRAT');

  // Fırat is wrong: the right answer, and no bridge line (Yakup dropped it), on the result card.
  await untilHostQuiet();
  await wait(ECHO_TAIL_MS + 100);
  const q = question(clueText());
  host.said.length = 0;
  await say('bambaşka bir şey');
  expect(screen.getByText(q.answers[0])).toBeOnTheScreen();
  expect(await screen.findByTestId('turn-result', {}, { timeout: 20_000 })).toHaveTextContent(`Yanlış — doğru cevap: ${q.answers[0]}`);
  await act(async () => {});
  expect(host.said).toEqual([said(answerLine(q))]);
  await screen.findByText('Sıradaki oyuncu: Ece');
  await fireEvent.press(screen.getByText('Sıradaki oyuncu: Ece'));
  expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Ece');
  expect(rec.starts).toBe(listener.renewals + 1);
  expect(rec.aborts).toBe(listener.renewals);
  // The match's one request expects the ready words and the players' answers.
  expect(rec.starts).toBe(1);
  expect(rec.lastOptions.contextualStrings).toEqual(expect.arrayContaining(['hazırım', 'hazır', 'tamam', 'başla', q.answers[0]]));
});

// How the host's words reach the mic in the tests below: all of them, as if
// there were no echo cancellation at all, and the end of each line once more
// a moment after the host stopped (the recognizer is late with it).
function echoHostIntoMic() {
  const orig = host.onSpeaking;
  let last = '';
  let lines = 0;
  host.onSpeaking = (texts) => {
    orig(texts);
    if (texts) {
      lines++;
      last = texts.join(' ');
      rec.hear(last);
    } else {
      const tail = last.split(' ').slice(-4).join(' ');
      setTimeout(() => rec.hear(tail), 300);
    }
  };
  return { lines: () => lines, restore: () => { host.onSpeaking = orig; } };
}

async function untilHostQuiet() {
  for (let i = 0; i < 40 && host.speaking; i++) await wait(250);
  expect(host.speaking).toBe(false);
}

test('speaker and mic: one session with echo cancellation, set before the mic opens and never changed; the bed is faint and everything ducks under the host', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  // Once, when the round opened and before any mic: its mode set, put in the
  // recognizer's own category, then made active.
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.events.filter((e) => e === 'category')).toEqual(['category']);
  expect(rec.events.indexOf('category')).toBeLessThan(rec.events.indexOf('start') >>> 0);
  expect(rec.categories).toEqual([RECOGNITION_OPTIONS.iosCategory]);

  await pressStart();
  // The mic: iOS voice processing (echo cancellation) in the 'default' mode (not
  // voiceChat, which drives the loudspeaker to call loudness), the very category
  // already in place, so opening it switches nothing.
  expect(rec.lastOptions).toMatchObject({ iosVoiceProcessingEnabled: false, iosCategory: RECOGNITION_OPTIONS.iosCategory });
  expect(RECOGNITION_OPTIONS.iosCategory).toEqual({ category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'], mode: 'default' });

  // The host reads: the bed is ducked, a cue that sounds now is not.
  expect(host.speaking).toBe(true);
  expect(sounds.bgVolume).toBeCloseTo(BG_DUCKED * DEFAULT_GAIN, 5);
  const a = question(clueText());
  await say(a.answers[0]);
  const correctCue = audio.players.find((p) => p.source === require('../../assets/sounds/correct.mp3'))!;
  expect(host.speaking).toBe(true);  // reading B
  expect(correctCue.volume).toBeCloseTo(DEFAULT_GAIN);
  expect(DUCK).toBeLessThan(1);

  // The mic listening with the host quiet: only a faint bed, a quarter of the old 0.17.
  await untilHostQuiet();
  expect(BG_VOLUME).toBeCloseTo(0.17 / 4, 2);
  expect(sounds.bgVolume).toBeCloseTo(BG_VOLUME * DEFAULT_GAIN, 6);
  expect(BG_VOLUME).toBeLessThanOrEqual(BG_MAX);
  expect(BG_MAX).toBeLessThanOrEqual(0.17 / 2);

  // A few answers on: a request per question, no change to the iOS audio session
  // since the mic opened, and every player keeps the session active (expo-audio
  // would otherwise deactivate it under the mic when a clip ends).
  await say('pas');
  await untilHostQuiet();
  await say('bambaşka');
  await wait(REVEAL_MS + 3000);
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.categories.length).toBe(1);
  expect(audio.players.length).toBeGreaterThan(2);
  for (const p of audio.players) expect(p.options).toMatchObject({ keepAudioSessionActive: true });
  expect(rec.starts).toBe(listener.renewals + 1);
  expect(rec.aborts).toBe(listener.renewals);
});

test("worst case, no echo cancellation at all: the host's own words reach the mic and are never judged", async () => {
  const echo = echoHostIntoMic();
  try {
    await startVoiceGame();
    for (const letter of ['A', 'B', 'C', 'Ç']) {
      const q = question(clueText());
      await untilHostQuiet();
      await wait(SETTLE_MS * 2);  // the late tail of the reading arrives and is dropped
      expect(screen.getByLabelText(`${letter} harfi, sırada`)).toBeOnTheScreen();
      await wait(ECHO_TAIL_MS);
      await say(q.answers[0]);
      expect(screen.getByLabelText(`${letter} harfi, doğru`)).toBeOnTheScreen();
    }
    expect(echo.lines()).toBeGreaterThanOrEqual(4);
    expect(screen.getByLabelText('4 doğru')).toBeOnTheScreen();
    expect(screen.getByLabelText('0 yanlış')).toBeOnTheScreen();
    expect(screen.getByLabelText('0 pas')).toBeOnTheScreen();
    expect(rec.starts).toBe(1);  // A, B, C, Ç, then D: one request for the round
    expect(rec.aborts).toBe(listener.renewals);
  } finally {
    echo.restore();
  }
});

test('from the last word to the verdict: right and Pas at once, a slip counts, wrong in under 1.2 s; the mic never restarts', async () => {
  await startVoiceGame();
  async function verdictAfter(words: string, label: string): Promise<number> {
    await untilHostQuiet();
    await wait(ECHO_TAIL_MS + 100);
    const t0 = Date.now();
    await act(() => rec.hear(words));
    for (let i = 0; i < 40 && !screen.queryByLabelText(label); i++) await wait(50);
    expect(screen.getByLabelText(label)).toBeOnTheScreen();
    return Date.now() - t0;
  }
  const a = question(clueText());
  expect(await verdictAfter(a.answers[0], 'A harfi, doğru')).toBe(0);
  expect(await verdictAfter('pas', 'B harfi, pas')).toBe(0);
  // A dictation slip (a doubled last letter) is right too, at once.
  await untilClue();
  const c = question(clueText());
  const slip = c.answers[0] + c.answers[0].slice(-1);
  expect(await verdictAfter(slip, 'C harfi, doğru')).toBe(0);
  const wrongMs = await verdictAfter('bambaşka', 'Ç harfi, yanlış');
  expect(wrongMs).toBeLessThan(1200);
  expect(wrongMs).toBeGreaterThanOrEqual(SETTLE_MS);
  await wait(REVEAL_MS + 3000);
  expect(await verdictAfter('pas geçiyorum', 'D harfi, pas')).toBe(0);
  // "geçiyorum" did not pass E as well.
  await wait(3000);
  expect(screen.getByLabelText('E harfi, sırada')).toBeOnTheScreen();
  expect(rec.starts).toBe(1);  // A to E, one request
  expect(rec.aborts).toBe(0);
  expect(listener.renewals).toBe(0);
});

test('"pas" passes at once while the host is reading', async () => {
  await startVoiceGame();
  expect(host.speaking).toBe(true);
  await act(() => rec.hear('pas'));
  expect(screen.getByLabelText('A harfi, pas')).toBeOnTheScreen();
  await wait(CUE_LEAD_MS + 10);  // the cue first, then the host
  expect(host.speaking).toBe(true);  // now reading B
  await wait(SETTLE_MS + 50);  // a new utterance, not more of "pas"
  expect(host.speaking).toBe(true);
  await act(() => rec.hear('geç'));
  expect(screen.getByLabelText('B harfi, pas')).toBeOnTheScreen();
  await wait(SETTLE_MS + 50);
  expect(host.speaking).toBe(true);
  await act(() => rec.hear('bas'));
  expect(screen.getByLabelText('C harfi, pas')).toBeOnTheScreen();
  expect(screen.getByLabelText('3 pas')).toBeOnTheScreen();
});
