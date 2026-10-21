import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { contextFor } from '../voice/listener';
import { END_WAIT_MS, GAP_MS, LISTEN_MS, PROBE_WORDS, latency, median, summary, type ProbeWord } from '../voice/probe';

// Ses tanıma testi, the debug screen behind a long press in Ayarlar: ten
// words, a request each, live results with times, the recognizer mode, and
// the latency from the end of each word (Apple's segment timings) to the
// first right result and to the final result.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1], spor: [], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(600_000);  // room for a loaded machine (the full suite runs its files in parallel)

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

beforeEach(async () => {
  jest.useFakeTimers();
  rec.reset();
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ micChecked: true }));
});
afterEach(() => {
  jest.useRealTimers();
});

async function openTest() {
  await renderRouter('./src/app', { initialUrl: '/settings' });
  await fireEvent(await screen.findByTestId('mic-try'), 'longPress');
  expect(await screen.findByText('Ses tanıma testi')).toBeOnTheScreen();
}

async function startTest() {
  await fireEvent.press(screen.getByTestId('probe-start'));
  await act(async () => {});
  await act(async () => {});
}

// One word said: interim at `heardAt` ms into the request, Apple's final at
// `finalAt` with the word ending `endAt` ms after the audio started.
async function sayWord(word: string, heardAt: number, finalAt: number, endAt: number) {
  await wait(heardAt);
  await act(() => rec.hear(word.toLocaleLowerCase('tr-TR')));
  await wait(finalAt - heardAt);
  await act(() => rec.final(word.toLocaleLowerCase('tr-TR'), endAt));
  // The test stops the request and moves on after its 'end' (or END_WAIT_MS).
  await wait(END_WAIT_MS + GAP_MS);
  await act(async () => {});
}

test('hidden: a tap on "Mikrofonu dene" opens the mic check, a long press the speech test', async () => {
  await renderRouter('./src/app', { initialUrl: '/settings' });
  await fireEvent.press(await screen.findByTestId('mic-try'));
  expect(await screen.findByText('Sesli cevap verelim')).toBeOnTheScreen();
  await openTest();
  expect(screen.getByTestId('probe-mode')).toHaveTextContent(/Etkin mod: cihaz üstü/);
  expect(screen.getByTestId('probe-supports')).toHaveTextContent(/bu iPhone'da var/);
  expect(rec.starts).toBe(0);  // nothing listens until the test is started
});

test('ten words, each in its own request as in the game; live results with times and the latency from the end of each word', async () => {
  await openTest();
  await startTest();
  expect(PROBE_WORDS.length).toBe(10);
  expect(PROBE_WORDS).toEqual(expect.arrayContaining(['Ay', 'Su', 'Merkür', 'Cimnastik']));
  expect(screen.getByTestId('probe-word')).toHaveTextContent('Ay');
  expect(rec.starts).toBe(1);
  expect(rec.lastOptions).toMatchObject({
    lang: 'tr-TR', continuous: true, interimResults: true, contextualStrings: contextFor(['Ay']),
    requiresOnDeviceRecognition: true, iosTaskHint: 'search', addsPunctuation: false, iosVoiceProcessingEnabled: true,
  });

  // "Ay": heard 600 ms into the request, the word ended at 450 ms, Apple's final at 900 ms.
  await sayWord('Ay', 600, 900, 450);
  const row = screen.getByTestId('probe-row-0');
  expect(row).toHaveTextContent(/^Ay/);
  expect(row).toHaveTextContent(/150 ms/);  // end of speech → right result
  expect(row).toHaveTextContent(/450 ms/);  // end of speech → final result
  expect(screen.getByTestId('probe-log')).toHaveTextContent(/ara: “ay”/);
  expect(screen.getByTestId('probe-log')).toHaveTextContent(/son: “ay”/);
  expect(screen.getByTestId('probe-log')).toHaveTextContent(/\+\d+\.\d\d s/);

  // "Su" next, in a fresh request expecting it.
  expect(screen.getByTestId('probe-word')).toHaveTextContent('Su');
  expect(rec.starts).toBe(2);
  expect(rec.lastOptions.contextualStrings).toEqual(contextFor(['Su']));
  await sayWord('Su', 300, 700, 250);

  // "Merkür" is never heard: after LISTEN_MS the test moves on.
  expect(screen.getByTestId('probe-word')).toHaveTextContent('Merkür');
  await act(() => rec.hear('merdiven'));
  await wait(LISTEN_MS + END_WAIT_MS + GAP_MS);
  expect(screen.getByTestId('probe-row-2')).toHaveTextContent(/merdiven/);
  expect(screen.getByTestId('probe-word')).toHaveTextContent('Cimnastik');

  // A dictation slip counts as right, as in the game.
  await sayWord('Jimnastik', 500, 1100, 800);
  for (const w of PROBE_WORDS.slice(4)) await sayWord(w, 400, 800, 300);
  expect(screen.getByTestId('probe-summary')).toHaveTextContent(/^Doğru 9\/10/);
  expect(screen.queryByTestId('probe-word')).toBeNull();
  expect(screen.getByTestId('probe-start')).toHaveTextContent('Tekrar başlat');
  expect(screen.getByTestId('probe-log')).toHaveTextContent(/bitti: 9\/10 doğru/);
  expect(rec.starts).toBe(10);
});

test('server mode and another task hint can be chosen for a run; on-device refused falls back to the server', async () => {
  await openTest();
  await fireEvent(screen.getByTestId('probe-ondevice'), 'valueChange', false);
  await fireEvent.press(screen.getByTestId('probe-hint-confirmation'));
  await fireEvent(screen.getByTestId('probe-vp'), 'valueChange', false);
  expect(screen.getByTestId('probe-mode')).toHaveTextContent(/Etkin mod: sunucu/);
  await startTest();
  expect(rec.lastOptions).toMatchObject({ requiresOnDeviceRecognition: false, iosTaskHint: 'confirmation', iosVoiceProcessingEnabled: false });
  await fireEvent.press(screen.getByTestId('probe-start'));  // Durdur
  expect(rec.aborts).toBe(1);

  await fireEvent(screen.getByTestId('probe-ondevice'), 'valueChange', true);
  await startTest();
  expect(rec.lastOptions).toMatchObject({ requiresOnDeviceRecognition: true });
  await act(() => rec.emit('error', { error: 'service-not-allowed' }));
  await wait(GAP_MS + 10);
  expect(rec.lastOptions).toMatchObject({ requiresOnDeviceRecognition: false, contextualStrings: contextFor(['Ay']) });
  expect(screen.getByTestId('probe-mode')).toHaveTextContent(/Etkin mod: sunucu/);
  expect(screen.getByTestId('probe-log')).toHaveTextContent(/cihaz üstü reddedildi/);
});

test('a phone without on-device recognition says so; leaving the screen closes the mic', async () => {
  rec.onDevice = false;
  await openTest();
  expect(screen.getByTestId('probe-mode')).toHaveTextContent(/Etkin mod: sunucu/);
  expect(screen.getByTestId('probe-supports')).toHaveTextContent(/bu iPhone'da yok/);
  await startTest();
  expect(rec.running).toBe(true);
  await fireEvent.press(screen.getByText('‹ Geri'));
  await act(async () => {});
  expect(rec.running).toBe(false);
});

test('permission off: the test says why and does not listen', async () => {
  rec.granted = false;
  await openTest();
  await startTest();
  expect(screen.getByText(/izni kapalı/)).toBeOnTheScreen();
  expect(rec.starts).toBe(0);
});

test('latency, median and summary', () => {
  const w = (o: Partial<ProbeWord>): ProbeWord => ({ word: 'Ay', heard: '', ok: false, openMs: 80, matchAt: null, finalAt: null, speechEndAt: null, forced: false, ...o });
  expect(latency(w({ matchAt: 1150, finalAt: 1450, speechEndAt: 1000 }))).toEqual({ match: 150, final: 450 });
  expect(latency(w({ matchAt: 1150 }))).toEqual({ match: null, final: null });
  expect(median([])).toBeNull();
  expect(median([3, 1, 2])).toBe(2);
  expect(median([4, 1, 2, 3])).toBe(3);
  const s = summary([
    w({ ok: true, matchAt: 1100, finalAt: 1300, speechEndAt: 1000 }),
    w({ ok: true, matchAt: 1300, finalAt: 2000, speechEndAt: 1000, forced: true }),  // forced: not a final latency
    w({ openMs: null }),
  ]);
  expect(s).toEqual({ hits: 2, tried: 2, match: 200, final: 300, open: 80 });
});
