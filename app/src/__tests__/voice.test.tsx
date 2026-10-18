import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { REVEAL_MS } from '../game/useRound';
import { SETTINGS_KEY } from '../store/settings';
import { audio } from '../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { C } from '../ui/theme';
import { host, sounds } from '../voice/engine';
import { answerLine, clueLine, host as hostLine, type Line } from '../voice/lines';
import { ECHO_TAIL_MS, SETTLE_MS } from '../voice/listener';
import { BG_DUCKED, BG_VOLUME } from '../voice/sounds';

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
  rec.reset();
  sounds.played.length = 0;
  host.said.length = 0;
  await AsyncStorage.clear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('a spoken round: answer during the reading, a wrong answer, a pas; the mic is opened once', async () => {
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

  await fireEvent.press(screen.getByText('Başla'));
  expect(rec.starts).toBe(1);
  expect(rec.lastOptions).toMatchObject({ lang: 'tr-TR', continuous: true, interimResults: true });
  expect(sounds.bgPlaying).toBe(true);

  // The host reads A (after "İşte sağ cepten sorular çıkıyor"); the clock waits, the bed is lowered.
  const a = question(clueText());
  expect(host.speaking).toBe(true);
  expect(host.said).toEqual([said(hostLine('go'))]);
  expect(sounds.bgVolume).toBe(BG_DUCKED);
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
  expect(sounds.bgVolume).toBe(BG_VOLUME);
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

  // One recognition session for all of it.
  expect(rec.starts).toBe(1);
  expect(rec.aborts).toBe(0);

  // The last ten seconds warn every second; time up closes the mic and the host says so.
  await wait(3000);
  const left = () => { const [m, sec] = String(screen.getByTestId('clock').props.children).split(':'); return Number(m) * 60 + Number(sec); };
  while (left() > 20) await wait(10_000);
  for (let i = 0; i < 30 && !screen.queryByText('Az kaldı!'); i++) await wait(1000);
  expect(sounds.played.filter((s) => s === 'warn').length).toBeGreaterThanOrEqual(9);
  expect(await screen.findByText('Az kaldı!')).toBeOnTheScreen();
  expect(rec.aborts).toBe(1);
  expect(sounds.bgPlaying).toBe(false);
  expect(host.said).toContain(said(hostLine('timeup')));
  expect(rec.starts).toBe(1);
});

test('voice off: no host, no mic, the cues still play', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: false }));
  await renderRouter('./src/app', { initialUrl: '/game?cats=tarih&level=1&seed=7' });
  expect(screen.getByTestId('answer').props.autoFocus).toBe(true);
  await fireEvent.press(await screen.findByText('Başla'));
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
  await fireEvent.press(await screen.findByText('Başla'));
}

test("the host's own voice in the mic never gives a wrong answer; echo cancellation is on", async () => {
  await startVoiceGame();
  // iOS voice processing takes the phone's own sound out of the mic.
  expect(rec.lastOptions).toMatchObject({ iosVoiceProcessingEnabled: true, iosCategory: { category: 'playAndRecord', mode: 'voiceChat' } });

  // While the host reads, the mic picks up a garbled bit of it: not an answer.
  expect(host.speaking).toBe(true);
  await say('kara zeminli bayrak hangisi');
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();

  // Just after the reading (inside the 1.5 s tail): still not a wrong answer.
  for (let i = 0; i < 20 && host.speaking; i++) await wait(500);
  expect(host.speaking).toBe(false);
  await say('olmayan sözcük');
  expect(screen.getByLabelText('A harfi, sırada')).toBeOnTheScreen();
  expect(screen.getByLabelText('0 yanlış')).toBeOnTheScreen();

  // Well after the host stopped, the player's wrong answer counts.
  await wait(ECHO_TAIL_MS + 500);
  await say('bambaşka');
  expect(screen.getByLabelText('A harfi, yanlış')).toBeOnTheScreen();
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
  await fireEvent.press(await screen.findByText('Başla'));
  await wait(2000);
  const before = String(screen.getByTestId('clock').props.children);
  await goTo('inactive');
  expect(sounds.bgPlaying).toBe(false);
  await wait(10_000);
  expect(screen.getByTestId('clock')).toHaveTextContent(before);
  await goTo('active');
  expect(sounds.bgPlaying).toBe(true);
  await wait(2000);
  expect(screen.getByTestId('clock')).not.toHaveTextContent(before);
});

test('pass and play: "hazırım" starts each turn on the Sıra screen, and one mic session serves the whole match', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
  await renderRouter('./src/app', { initialUrl: `/match?names=${encodeURIComponent(JSON.stringify(['Ece', 'Fırat']))}&cats=karisik&level=1&seed=5` });
  expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Ece');
  await act(async () => {});
  expect(screen.getByTestId('say-ready')).toHaveTextContent('ya da “hazırım” de');
  expect(sounds.played).toContain('theme');
  expect(rec.starts).toBe(1);
  expect(host.said).toEqual([said(hostLine('turn'))]);
  await wait(3000);

  await say('hazırım');
  expect(screen.queryByTestId('handover')).toBeNull();
  expect(screen.getByTestId('turn-player')).toHaveTextContent('ECE');
  expect(host.speaking).toBe(true);  // Ece's first clue

  await say('pas');
  expect(await screen.findByTestId('handover')).toHaveTextContent('Sıra: Fırat');
  expect(screen.getByTestId('handover-note')).toHaveTextContent('Ece: pas');
  await act(async () => {});
  await wait(3000);
  await say('tamam hazırım');
  expect(screen.getByTestId('turn-player')).toHaveTextContent('FIRAT');
  expect(rec.starts).toBe(1);
  expect(rec.aborts).toBe(0);
});
