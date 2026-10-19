import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AppState } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { REVEAL_MS } from '../game/useRound';
import { SETTINGS_KEY } from '../store/settings';
import { fakeRecognizer as rec } from '../test-utils/fakeRecognizer';
import { pressStart } from '../test-utils/round';
import { host, sounds } from '../voice/engine';
import { clueLine, type Line } from '../voice/lines';
import { SETTLE_MS } from '../voice/listener';
import { CUE_LEAD_MS, CUE_VOLUME, DEFAULT_GAIN } from '../voice/sounds';

/** A cue at its full level: CUE_VOLUME under the default Ses gain. */
const FULL = CUE_VOLUME * DEFAULT_GAIN;

// An answer said while the host talks (iPhone, 18 Oct 2026): over the Mars
// clue the player says "Merkür". It must be judged wrong at once, with its
// cue, and the host's own words in the mic must still never be judged.
// Science level 1 with Mars as its only M question, so the ring reaches it.
jest.mock('../data/questions', () => {
  const actual = jest.requireActual('../data/questions');
  return {
    ...actual,
    CATEGORIES: actual.CATEGORIES.map((c: any) => c.category !== 'bilim' ? c : {
      ...c,
      levels: c.levels.filter((l: any) => l.level === 1).map((l: any) => ({
        ...l,
        questions: l.questions.filter((q: any) => q.letter !== 'M' || q.answers[0] === 'Mars'),
      })),
    }),
  };
});


function question(clue: string) {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q;
  throw new Error('no question with clue ' + clue);
}

function clueText(): string {
  const kids = screen.getByTestId('clue').props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids);
}

const said = (l: Line) => (host.hasClip(l.key!) ? `clip:${l.key}` : `tts:${l.text}`);
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

// No echo cancellation at all: every line the host says reaches the mic.
let restoreEcho = () => {};
function echoHostIntoMic() {
  const orig = host.onSpeaking;
  host.onSpeaking = (texts) => {
    orig(texts);
    if (texts) rec.hear(texts.join(' '));
  };
  restoreEcho = () => { host.onSpeaking = orig; };
}

// Every cue start, by verdict: how many, and whether each was at full volume from its beginning.
function cueStarts(cue: 'correct' | 'wrong' | 'pas') {
  return sounds.started.filter((s) => s.cue === cue);
}

jest.setTimeout(120_000);

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: () => {} }) as ReturnType<typeof AppState.addEventListener>);
  jest.spyOn(Math, 'random').mockReturnValue(0.99);
  rec.reset();
  sounds.played.length = 0;
  host.said.length = 0;
  sounds.started.length = 0;
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  restoreEcho();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('"Merkür" said over the Mars clue is judged wrong once, at once, with its cue; the host\'s words never are', async () => {
  echoHostIntoMic();
  await renderRouter('./src/app', { initialUrl: '/game?cats=bilim&level=1&seed=3' });
  await pressStart();

  // Pas through the ring to M, each while the host reads (and the mic hears it).
  let passes = 0;
  while (question(clueText()).answers[0] !== 'Mars') {
    expect(host.speaking).toBe(true);
    await fireEvent.press(screen.getByLabelText('Pas'));
    passes++;
    // The cue first; the host starts the next clue CUE_LEAD_MS later, not over it.
    expect(host.speaking).toBe(false);
    await wait(CUE_LEAD_MS + 10);
    expect(host.speaking).toBe(true);
    expect(passes).toBeLessThan(30);
  }
  const mars = question(clueText());
  expect(host.said.at(-1)).toBe(said(clueLine(mars)));
  expect(screen.getByLabelText('M harfi, sırada')).toBeOnTheScreen();
  expect(screen.getByLabelText('0 yanlış')).toBeOnTheScreen();

  // "Merkür" while the host is still reading Mars: shown at once, judged as soon as the words settle.
  expect(host.speaking).toBe(true);
  await act(() => rec.hear('Merkür'));
  expect(screen.getByTestId('voice-status')).toHaveTextContent('Duydum: Merkür…');
  await wait(SETTLE_MS + 20);
  expect(screen.getByLabelText('M harfi, yanlış')).toBeOnTheScreen();
  expect(screen.getByLabelText('1 yanlış')).toBeOnTheScreen();
  // The verdict on screen: the wrong card with what was heard (the status line gives way to it).
  expect(screen.getByTestId('reveal')).toHaveTextContent(/YANLIŞ · M/);
  expect(screen.getByTestId('reveal')).toHaveTextContent(/Senin cevabın: merkür/i);
  expect(sounds.played.filter((c) => c === 'wrong')).toEqual(['wrong']);

  // The host says the right answer, the next clue is read, all of it into the mic: nothing more is judged.
  await wait(REVEAL_MS + 6000);
  expect(screen.getByLabelText('N harfi, sırada')).toBeOnTheScreen();
  await wait(6000);
  expect(screen.getByLabelText('1 yanlış')).toBeOnTheScreen();
  expect(screen.getByLabelText('N harfi, sırada')).toBeOnTheScreen();
  expect(sounds.played.filter((c) => c === 'wrong')).toEqual(['wrong']);

  // A right answer said over a reading: its cue too.
  expect(host.speaking).toBe(false);
  await fireEvent.press(screen.getByLabelText('Pas'));
  await wait(CUE_LEAD_MS + 500);
  expect(host.speaking).toBe(true);
  await act(() => rec.hear(question(clueText()).answers[0]));
  await wait(SETTLE_MS + 20);
  expect(screen.getByTestId('voice-status')).toHaveTextContent(/— doğru$/);

  // Every verdict gave exactly one cue start, at full volume and from the beginning (the seek is awaited).
  await wait(1000);
  expect(sounds.played.filter((c) => c === 'pas')).toHaveLength(passes + 1);
  expect(cueStarts('pas')).toHaveLength(passes + 1);
  expect(cueStarts('wrong')).toHaveLength(1);
  expect(cueStarts('correct')).toHaveLength(1);
  for (const s of [...cueStarts('pas'), ...cueStarts('wrong'), ...cueStarts('correct')]) {
    expect(s).toMatchObject({ volume: FULL, fromStart: true });
  }
});

test('a cue played while the host speaks stays at full volume; the bed alone is lowered', async () => {
  await renderRouter('./src/app', { initialUrl: '/game?cats=bilim&level=1&seed=3' });
  await pressStart();
  expect(host.speaking).toBe(true);
  await act(() => rec.hear(question(clueText()).answers[0]));
  await wait(CUE_LEAD_MS + 10);
  expect(host.speaking).toBe(true);  // "Doğru efendim" or the next clue, over the cue still sounding
  expect(cueStarts('correct')).toEqual([expect.objectContaining({ volume: FULL, fromStart: true })]);
  // And a replayed cue (the same player again) starts from its beginning, not where the last one ended.
  await wait(2000);
  await act(() => rec.hear('pas'));
  await wait(2000);
  await act(() => rec.hear('pas'));
  await wait(1000);
  expect(cueStarts('pas')).toHaveLength(2);
  expect(cueStarts('pas').every((s) => s.volume === FULL && s.fromStart)).toBe(true);
});
