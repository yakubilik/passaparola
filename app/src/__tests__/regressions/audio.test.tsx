import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { CATEGORIES, type Question } from '../../data/questions';
import { REVEAL_MS } from '../../game/useRound';
import { SETTINGS_KEY, type Settings } from '../../store/settings';
import { audio, FakePlayer, type FakeSession, mockAudio, speech } from '../../test-utils/fakeAudio';
import { fakeRecognizer as rec } from '../../test-utils/fakeRecognizer';
import { pressStart, settle } from '../../test-utils/round';
import { CLIPS } from '../../voice/clips.generated';
import { host, listener, SESSION_SETTLE_MS, sounds } from '../../voice/engine';
import { answerLine, clueLine } from '../../voice/lines';
import { ECHO_TAIL_MS, SETTLE_MS } from '../../voice/listener';
import { RECOGNITION_OPTIONS } from '../../voice/recognizer';
import { BG_VOLUME, CUE_VOLUME, DEFAULT_GAIN, DUCK, HOST_VOLUME, masterGain, musicVolume, setMasterVolume } from '../../voice/sounds';

// Every sound / volume complaint Yakup made about Harfiyen (#312-#391), one
// test each, titled with its ticket and his words. Fixes since 18 Oct 2026
// kept undoing each other because each ticket only tested its own symptom;
// these run together, in one app life (the engine's host, mic, cues and the
// iOS session are shared by every test, as on the phone), and each plays at
// least three consecutive rounds (round -> result screen -> Tekrar oyna) on
// the fake audio player and the fake recognizer.
//
// The rounds are Sanat level 2 with its C question pinned to sanat-2-C-2 (the
// clue Yakup heard nothing of on 20 Oct), 30 seconds on the clock.
jest.mock('../../data/questions', () => {
  const actual = jest.requireActual('../../data/questions');
  const CATEGORIES = actual.CATEGORIES.map((c: any) =>
    c.category !== 'sanat'
      ? { ...c, levels: [] }
      : { ...c, levels: c.levels.filter((l: any) => l.level === 2).map((l: any) => ({ ...l, questions: l.questions.filter((q: any) => q.letter !== 'C' || q.id === 'sanat-2-C-2') })) },
  );
  return { ...actual, CATEGORIES };
});
jest.mock('../../game/round', () => {
  const actual = jest.requireActual('../../game/round');
  return { ...actual, createRound: (picked: any) => actual.createRound(picked, 30) };
});
// In jest every asset require() is the same number: each recording gets an id of its own here, so a player tells which clip it plays.
jest.mock('../../voice/clips.generated', () => {
  const actual = jest.requireActual('../../voice/clips.generated');
  return { CLIPS: Object.fromEntries(Object.keys(actual.CLIPS).map((k, i) => [k, 1000 + i])) };
});
// The session as the fakes leave it, read the way the diagnostic reads the real one.
jest.mock('../../voice/sessionInfo', () => ({
  readAudioSession: () => {
    const { audio: a } = require('../../test-utils/fakeAudio');
    return { category: a.session.category, options: a.session.options, mode: a.session.mode, outputs: ['Speaker'], inputs: ['MicrophoneBuiltIn'], outputVolume: 0.5, sampleRate: 48000, otherAudioPlaying: false };
  },
}));

jest.setTimeout(600_000);

const GAME = '/game?cats=sanat&level=2&seed=7&quick=1';
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

function question(clue: string): Question {
  for (const c of CATEGORIES) for (const l of c.levels) for (const q of l.questions) if (q.clue === clue) return q;
  throw new Error('no question with clue ' + clue);
}
const byId = new Map(CATEGORIES.flatMap((c) => c.levels.flatMap((l) => l.questions.map((q) => [q.id, q] as const))));
function clueText(): string {
  const kids = screen.getByTestId('clue').props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids);
}

const CLIP_SOURCES = new Set<unknown>(Object.values(CLIPS));
// Host clips by their source; the bed is the one looping player; every other player is a cue (or the theme).
const hostPlayers = (from = 0, to = audio.players.length) => audio.players.slice(from, to).filter((p) => CLIP_SOURCES.has(p.source));
const bedPlayers = (from = 0, to = audio.players.length) => audio.players.slice(from, to).filter((p) => !CLIP_SOURCES.has(p.source) && p.loop);
const cuePlayers = (from = 0, to = audio.players.length) => audio.players.slice(from, to).filter((p) => !CLIP_SOURCES.has(p.source) && !p.loop);
/** Every host clip that started in the log range: its source and the player's volume as it started. */
const hostPlays = (from = 0, to = audio.log.length) =>
  audio.log.slice(from, to).filter((e) => e.e.startsWith('play#') && CLIP_SOURCES.has(e.src)).map((e) => ({ ...e, player: audio.players[Number(e.e.slice(5))] }));
const VERDICT_CUES = new Set(['correct', 'wrong', 'pas']);

// AppState, driven by the tests: background / active.
const appState = new Set<(s: AppStateStatus) => void>();
async function goTo(state: AppStateStatus) {
  await act(() => appState.forEach((h) => h(state)));
}

// Something the player hears: a cue, the theme or a host clip (not the looping bed), or the phone voice.
const sounding = () => audio.players.some((p) => p.playing && !p.loop) || !!speech.current;

// Every call into the recognizer and the iOS session, those made while something
// sounded, and the session each recognizer start found.
let calls: { name: string; t: number }[];
let whileSounding: string[];
let found: FakeSession[];
function guard(name: string, obj: any, key: string, before?: () => void) {
  const orig = obj[key];
  jest.spyOn(obj, key).mockImplementation((...args: unknown[]) => {
    calls.push({ name, t: Date.now() });
    if (sounding()) whileSounding.push(`${name} at ${Date.now()}`);
    before?.();
    return orig(...args);
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  appState.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
    appState.add(h as (s: AppStateStatus) => void);
    return { remove: () => appState.delete(h as (s: AppStateStatus) => void) } as ReturnType<typeof AppState.addEventListener>;
  });
  jest.spyOn(Math, 'random').mockReturnValue(0.99);  // no "Doğru." before the next clue
  host.cancel();
  listener.release();  // a mic still closing after the last test's screen went
  rec.reset();
  speech.reset();
  host.withholdClips(() => false);
  audio.stalls = { afterReplace: 0, any: 0 };
  audio.stalled.length = 0;
  sounds.played.length = 0;
  sounds.started.length = 0;
  host.said.length = 0;
  calls = [];
  whileSounding = [];
  found = [];
  guard('rec.start', rec.module, 'start', () => found.push({ ...audio.session, options: [...audio.session.options] }));
  guard('rec.stop', rec.module, 'stop');
  guard('rec.abort', rec.module, 'abort');
  guard('category', rec.module, 'setCategoryIOS');
  guard('mode', mockAudio, 'setAudioModeAsync');
  guard('active', mockAudio, 'setIsAudioActiveAsync');
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true }));
});
afterEach(() => {
  setMasterVolume(DEFAULT_GAIN * 100);
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function settings(s: Partial<Settings>) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true, ...s }));
}

async function untilHostQuiet() {
  for (let i = 0; i < 80 && host.speaking; i++) await wait(250);
  expect(host.speaking).toBe(false);
}

type Step = 'correct' | 'wrong' | 'pas' | 'correct-during' | 'pas-during';
/** What one answer did: the verdict cues it started (with their volume and whether from the start). */
type StepResult = { step: Step; question: Question; cues: { cue: string; volume: number; fromStart: boolean }[]; hostSpeaking: boolean };
type RoundResult = {
  n: number;
  /** Indices into audio.players / audio.log / host.said / speech.started where the round began (on Başla). */
  players: number; log: number; said: number; spoken: number; calls: number; recStarts: number;
  /** The same indices where the round ended (after the result screen). */
  playersTo: number; logTo: number; saidTo: number; callsTo: number;
  /** Where the round's first clue had started (pressStart returns then). */
  clueLog: number;
  steps: StepResult[];
};

// Says `step` for the clue on screen. "-during": while the host reads it.
async function answer(step: Step): Promise<StepResult> {
  if (step.endsWith('during')) {
    for (let i = 0; i < 40 && !host.speaking; i++) await wait(50);
    await wait(200);
  } else {
    await untilHostQuiet();
    await wait(ECHO_TAIL_MS + 100);
  }
  const q = question(clueText());
  const hostSpeaking = host.speaking;
  const started = sounds.started.length;
  const words = step.startsWith('correct') ? q.answers[0] : step.startsWith('pas') ? 'pas' : 'bambaşka';
  await act(() => rec.hear(words));
  await wait(SETTLE_MS + 20);
  if (step === 'wrong') await wait(REVEAL_MS + 3000);
  else for (let t = 0; t < 1500 && !host.speaking; t += 50) await wait(50);  // until the next clue starts
  return { step, question: q, cues: sounds.started.slice(started).filter((s) => VERDICT_CUES.has(s.cue)), hostSpeaking };
}

/**
 * Rounds 1..n back to back, from the "Hazır mısın?" screen: Başla, the steps,
 * then the clock runs out, the result screen, and "Tekrar oyna" to the next.
 * `during(n, phase, round)` runs at 'start' (the first clue has started) and after each step.
 */
async function playRounds(steps: Step[], n = 3, during?: (round: number, phase: 'start' | number, res: RoundResult) => Promise<void>): Promise<RoundResult[]> {
  const out: RoundResult[] = [];
  for (let r = 1; r <= n; r++) {
    expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
    await act(async () => {});
    const res: RoundResult = {
      n: r, players: audio.players.length, log: audio.log.length, said: host.said.length, spoken: speech.started.length,
      calls: calls.length, recStarts: rec.starts, clueLog: 0, steps: [], playersTo: 0, logTo: 0, saidTo: 0, callsTo: 0,
    };
    await pressStart();
    res.clueLog = audio.log.length;
    await during?.(r, 'start', res);
    for (let i = 0; i < steps.length; i++) {
      res.steps.push(await answer(steps[i]));
      await during?.(r, i, res);
    }
    for (let i = 0; i < 200 && !screen.queryByTestId('result-title'); i++) await wait(1000);
    expect(screen.getByTestId('result-title')).toBeOnTheScreen();
    await wait(8000);  // the host's last line ends on the result screen, then the mic closes
    Object.assign(res, { playersTo: audio.players.length, logTo: audio.log.length, saidTo: host.said.length, callsTo: calls.length });
    out.push(res);
    if (r < n) await fireEvent.press(screen.getByText('Tekrar oyna'));
  }
  return out;
}

async function openRound(url = GAME) {
  await renderRouter('./src/app', { initialUrl: url });
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ---------------------------------------------------------------------------

// First in the file: the only test that sees the app before any round.
test('#350: when the app opens the sound jumps to full and blasts', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(screen.getByText('HARFİYEN')).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('intro-start'));
  expect(await screen.findByText('Hızlı oyun')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Ayarlar'));
  expect(await screen.findByText('Müzik')).toBeOnTheScreen();
  await act(() => router.back());
  expect(await screen.findByText('Hızlı oyun')).toBeOnTheScreen();
  await wait(2000);
  // Launch and the menus: no session call, no player, no sound.
  expect(audio.sessionCalls).toEqual([]);
  expect(rec.categories).toEqual([]);
  expect(audio.players).toEqual([]);
  expect(audio.plays).toBe(0);

  await act(() => router.push(GAME));
  const rounds = await playRounds(['correct', 'pas', 'wrong']);
  expect(rounds).toHaveLength(3);

  // The session was set up once, by the first round, category and mode before
  // it was made active, and never again over three rounds.
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
  expect(rec.categories).toEqual([RECOGNITION_OPTIONS.iosCategory]);
  // The very first sound (the theme) rose from silence.
  const theme = audio.players[0];  // the first player of the app's life: the theme, as the round opened
  expect(theme.loop).toBe(false);
  expect(theme.volumes[0]).toBe(0);
  // No sound ever went above its level: the host at HOST_VOLUME, cues at CUE_VOLUME, the bed at its Müzik step, all under the Ses gain.
  const gain = DEFAULT_GAIN;
  for (const p of hostPlayers()) expect(Math.max(...p.volumes)).toBeLessThanOrEqual(HOST_VOLUME * gain + 1e-9);
  for (const p of cuePlayers()) expect(Math.max(...p.volumes)).toBeLessThanOrEqual(CUE_VOLUME * gain + 1e-9);
  for (const p of bedPlayers()) expect(Math.max(...p.volumes)).toBeLessThanOrEqual(BG_VOLUME * gain + 1e-9);
  // And in the files: no cue nor the theme is louder than the quietest host clip (assets/loudness.json).
  const loud: { sounds: Record<string, { lufs: number }>; voice: Record<string, { lufs: number }> } = require('../../../assets/loudness.json');
  const quietestHost = Math.min(...Object.values(loud.voice).map((v) => v.lufs));
  for (const name of ['correct', 'wrong', 'pas', 'warn', 'theme']) expect(loud.sounds[name].lufs + 20 * Math.log10(CUE_VOLUME)).toBeLessThan(quietestHost);
});

test("#355: game audio ignores the phone volume and is too loud during the round", async () => {
  await openRound();
  let sounded: FakePlayer | null = null;
  const rounds = await playRounds(['correct', 'pas'], 3, async (r, phase) => {
    // Round 2: the Ses control is turned down while the host reads; everything follows at once.
    if (r !== 2 || phase !== 'start') return;
    sounded = hostPlayers().find((p) => p.playing) ?? null;
    setMasterVolume(40);
    await wait(10);
  });
  expect(rounds).toHaveLength(3);
  expect(sounded).not.toBeNull();
  expect(sounded!.volumes.at(-1)).toBeCloseTo(HOST_VOLUME * 0.4);
  // Round 3 started with the gain at 40%: every host clip, cue and the bed under it.
  const r3 = rounds[2].players;
  for (const p of hostPlayers(r3)) for (const v of p.volumes) expect(v).toBeLessThanOrEqual(HOST_VOLUME * 0.4 + 1e-9);
  for (const p of cuePlayers(r3)) for (const v of p.volumes) expect(v).toBeLessThanOrEqual(CUE_VOLUME * 0.4 + 1e-9);
  expect(sounds.bgVolume).toBeLessThanOrEqual(BG_VOLUME * 0.4 + 1e-9);
  // The cause (#355): iOS voice processing put the output on the call-volume path.
  // Every round's recognizer runs without it, in mode 'default' (never voiceChat),
  // so the phone's volume buttons drive the game's sound.
  expect(rec.startOptions).toHaveLength(3);
  for (const o of rec.startOptions) {
    expect(o.iosVoiceProcessingEnabled).toBe(false);
    expect(o.iosCategory).toEqual({ category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'], mode: 'default' });
  }
  for (const s of found) expect(s.mode).toBe('default');
});

test('#355: o ilk cümle sadece yüksek çalışıyor ve o cümlenin sesi değişmiyor', async () => {
  await openRound();
  const rounds = await playRounds(['pas']);
  for (const r of rounds) {
    const log = audio.log.slice(r.log, r.logTo);
    const up = log.find((e) => e.e === 'rec:up')!;
    expect(up).toBeDefined();
    // The first line is made and played only after the mic is up and the session has settled.
    const go = hostPlays(r.log, r.logTo)[0];
    expect(go.src).toBe(CLIPS.go);
    const created = log.find((e) => e.e === `create#${audio.players.indexOf(go.player)}`)!;
    expect(created.t).toBeGreaterThanOrEqual(up.t + SESSION_SETTLE_MS);
    expect(go.t).toBeGreaterThanOrEqual(up.t + SESSION_SETTLE_MS);
    // Nothing touched the session or the recognizer after it started.
    expect(calls.slice(r.calls, r.callsTo).map((c) => c.name).filter((n) => n !== 'rec.start' && n !== 'rec.abort')).toEqual([]);
  }
  // ...and it follows the Ses control like every other sound: turned down while the first line plays, it goes down at once.
  await openRound();
  expect(await screen.findByText('Hazır mısın?')).toBeOnTheScreen();
  await act(async () => {});
  await fireEvent.press(screen.getByText('Başla'));
  await settle();
  const go = hostPlays().at(-1)!.player;
  expect(go.source).toBe(CLIPS.go);
  expect(go.playing).toBe(true);
  setMasterVolume(30);
  expect(go.volume).toBeCloseTo(HOST_VOLUME * 0.3);
  await wait(100);
  expect(go.volume).toBeCloseTo(HOST_VOLUME * 0.3);  // a fade-in still running gives way
});

test('#357: the sound gets LOUDER on every new question, and the correct and pas cues no longer play at all', async () => {
  await openRound();
  const rounds = await playRounds(['correct', 'pas', 'wrong', 'correct', 'pas']);
  for (const r of rounds) {
    // One recognition request per round, never renewed on a new question.
    const startsThisRound = calls.slice(r.calls, r.callsTo).filter((c) => c.name === 'rec.start');
    expect(startsThisRound).toHaveLength(1);
    // Every verdict: exactly one cue, at the full cue level, from its start.
    for (const s of r.steps) {
      const want = s.step.startsWith('pas') ? 'pas' : s.step.startsWith('correct') ? 'correct' : 'wrong';
      expect(s.cues).toEqual([{ cue: want, volume: CUE_VOLUME * DEFAULT_GAIN, fromStart: true }]);
    }
    // The host's clips all start at one level, question after question.
    const levels = hostPlays(r.log, r.logTo).slice(1).map((e) => e.v!);  // after the first line, which fades in
    expect(levels.length).toBeGreaterThan(3);
    for (const v of levels) expect(v).toBeCloseTo(HOST_VOLUME * DEFAULT_GAIN);
  }
  // No session, category, mode or recognizer change while a cue or a host line sounded.
  expect(whileSounding).toEqual([]);
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
});

test("#361: I finished level 1, the sound was great; when I moved on to level 2 the sound broke again", async () => {
  await openRound();
  const rounds = await playRounds(['pas', 'correct']);
  expect(rounds).toHaveLength(3);
  // Every round found the session as the first round set it up, active.
  const first: FakeSession = { category: 'playAndRecord', mode: 'default', options: ['allowBluetooth', 'defaultToSpeaker', 'mixWithOthers'], active: true };
  expect(found).toEqual([first, first, first]);
  // The recognizer started with the same audio options every round.
  const audioOptions = (o: any) => { const { contextualStrings, ...rest } = o; return rest; };
  const opts = rec.startOptions.map(audioOptions);
  expect(opts).toEqual([opts[0], opts[0], opts[0]]);
  // Nothing made the session inactive, between or during the rounds.
  expect(audio.log.filter((e) => e.e === 'deactivated' || e.e === 'inactive')).toEqual([]);
  expect(audio.session.active).toBe(true);
  expect(audio.sessionCalls).toEqual(['mode', 'active']);
});

test('#337: the background music is still far too loud', async () => {
  await openRound();
  const bedWhileHost: number[] = [];
  const bedQuiet: number[] = [];
  const rounds = await playRounds(['correct', 'pas', 'wrong'], 3, async () => {
    if (host.speaking) bedWhileHost.push(sounds.bgVolume);
    await untilHostQuiet();
    bedQuiet.push(sounds.bgVolume);
  });
  expect(rounds).toHaveLength(3);
  // The bed plays under every round: a quarter of the 0.17 it was, lowered further while the host speaks.
  expect(BG_VOLUME).toBeLessThanOrEqual(0.17 / 4 + 1e-9);
  expect(bedPlayers().length).toBeGreaterThan(0);
  expect(bedQuiet.length).toBeGreaterThanOrEqual(9);
  for (const v of bedQuiet) expect(v).toBeCloseTo(BG_VOLUME * DEFAULT_GAIN);
  expect(bedWhileHost.length).toBeGreaterThanOrEqual(3);
  for (const v of bedWhileHost) expect(v).toBeCloseTo(BG_VOLUME * DUCK * DEFAULT_GAIN);
  for (const p of bedPlayers()) expect(Math.max(...p.volumes)).toBeLessThanOrEqual(BG_VOLUME * DEFAULT_GAIN + 1e-9);
});

test("#337: a 'Müzik' on/off + volume control in Ayarlar", async () => {
  // Off: no bed in any of three rounds.
  await settings({ music: false });
  await openRound();
  const log = audio.log.length;
  const off = await playRounds(['pas', 'correct']);
  expect(off).toHaveLength(3);
  const bedPlays = audio.log.slice(log).filter((e) => e.e.startsWith('play#') && audio.players[Number(e.e.slice(5))].loop);
  expect(bedPlays).toEqual([]);
  expect(sounds.bgVolume).toBe(0);
  // On at step 2 of 10: three rounds with the bed at that step.
  await settings({ music: true, musicLevel: 2 });
  await openRound();
  const levels: number[] = [];
  await playRounds(['pas'], 3, async () => {
    await untilHostQuiet();
    levels.push(sounds.bgVolume);
  });
  expect(levels).toHaveLength(6);  // at each round's start and after its answer
  for (const v of levels) expect(v).toBeCloseTo(musicVolume(2) * DEFAULT_GAIN);
});

test('#337: 1. sorudan sonra belki mikrofon açıldığı için oyunun sesi kısılıyor', async () => {
  await openRound();
  const rounds = await playRounds(['correct', 'correct', 'pas', 'correct']);
  for (const r of rounds) {
    // The first question's clip and every one after it play at the same level: opening the mic lowered nothing.
    const plays = hostPlays(r.log, r.logTo);
    const firstClue = plays.findIndex((e) => e.src !== CLIPS.go);
    expect(firstClue).toBe(1);
    const after = plays.slice(firstClue);
    expect(after.length).toBeGreaterThan(4);
    for (const e of after) expect(e.v).toBeCloseTo(HOST_VOLUME * DEFAULT_GAIN);
    // And no session or voice-processing change came after the round's mic opened.
    expect(calls.slice(r.calls, r.callsTo).filter((c) => c.name !== 'rec.start' && c.name !== 'rec.abort')).toEqual([]);
  }
});

test('#337/#342: the host volume is never lowered by anything else (cues, the bed, the mic, a verdict)', async () => {
  await openRound();
  const from = audio.players.length;
  const log = audio.log.length;
  const rounds = await playRounds(['correct-during', 'pas', 'wrong', 'correct']);
  expect(rounds).toHaveLength(3);
  expect(hostPlays(log).length).toBeGreaterThan(15);
  // Every volume ever set on a host clip player is the host level under the
  // Ses gain, except the fade-in of the first sound after the session was set
  // (which only rises to it).
  for (const p of hostPlayers(from)) {
    const settled = p.volumes.filter((v, i) => !(i < p.volumes.length - 1 && v < p.volumes[i + 1]));
    for (const v of settled) expect(v).toBeCloseTo(HOST_VOLUME * masterGain());
  }
  // Every line after a round's first started at the host level.
  for (const r of rounds) for (const e of hostPlays(r.log, r.logTo).slice(1)) expect(e.v).toBeCloseTo(HOST_VOLUME * DEFAULT_GAIN);
  expect(host.volume).toBeCloseTo(HOST_VOLUME * DEFAULT_GAIN);
});

test('#342: sometimes there is no correct/wrong sound', async () => {
  await openRound();
  const rounds = await playRounds(['correct-during', 'pas-during', 'wrong', 'pas']);
  for (const r of rounds) {
    // Said while the host read: judged, and its cue at the full cue level (never ducked under the host).
    expect(r.steps[0].hostSpeaking).toBe(true);
    expect(r.steps[1].hostSpeaking).toBe(true);
    const want = ['correct', 'pas', 'wrong', 'pas'];
    // Exactly one cue per verdict, at full level, from its start (a replayed 'pas' is rewound first).
    expect(r.steps.map((s) => s.cues)).toEqual(want.map((cue) => [{ cue, volume: CUE_VOLUME * DEFAULT_GAIN, fromStart: true }]));
  }
});

test('#318: uygulamayı alta alsam da ses çalmaya devam ediyor', async () => {
  await openRound();
  const rounds = await playRounds(['pas'], 3, async (_r, phase) => {
    if (phase !== 'start') return;
    // The host is reading the first clue, the bed is on: the app goes to the background.
    expect(host.speaking).toBe(true);
    await goTo('background');
    const plays = audio.plays;
    await wait(5000);
    // Silence: nothing sounding, nothing started, the phone voice quiet, the mic closed.
    expect(audio.players.filter((p) => p.playing)).toEqual([]);
    expect(audio.plays).toBe(plays);
    expect(speech.current).toBeNull();
    expect(listener.listening).toBe(false);
    // Back in front: the bed again and the clue read anew.
    await goTo('active');
    for (let i = 0; i < 40 && !host.speaking; i++) await wait(100);
    expect(host.speaking).toBe(true);
    expect(sounds.bgPlaying).toBe(true);
  });
  expect(rounds).toHaveLength(3);
});

// Every clue line of the rounds really sounded: its clip played (not just was asked to), or the phone voice started reading it.
function silentClues(r: RoundResult, until = r.logTo || audio.log.length) {
  const said = host.said.slice(r.said, r.saidTo || undefined);
  // A swallowed play() logs 'stalled#i' instead of 'play#i' (see audio.stalls).
  const played = new Set(audio.log.slice(r.log, until).filter((e) => e.e.startsWith('play#')).map((e) => e.src));
  const spoken = new Set(speech.started.slice(r.spoken));
  const textOf = new Map([...byId.values()].map((q) => [clueLine(q).text, q.id]));
  const ids = said.map((s) => (s.startsWith('tts:') ? textOf.get(s.slice(4)) : s.slice(5))).filter((k): k is string => !!k && byId.has(k));
  const all = [...new Set(ids)];
  return { all, silent: all.filter((id) => !played.has(CLIPS[id]) && !spoken.has(clueLine(byId.get(id)!).text)) };
}

test('#362: some clues are not read at all — silence (a clue without a recording)', async () => {
  // The A and B clues of the round have no recording: the phone voice reads them.
  host.withholdClips((k) => /^sanat-2-[AB]-\d+$/.test(k));
  await openRound();
  const shown: string[] = [];
  const rounds = await playRounds(['pas', 'pas', 'correct'], 3, async (_r, phase) => {
    if (phase === 'start' || phase === 0) shown.push(clueText());
  });
  for (const r of rounds) {
    const [a, b] = r.steps;
    for (const q of [a.question, b.question]) {
      expect(speech.spoken).toContainEqual({ text: clueLine(q).text, language: 'tr-TR', useApplicationAudioSession: true });
      expect(speech.started.slice(r.spoken)).toContain(clueLine(q).text);
    }
    expect(silentClues(r).silent).toEqual([]);
  }
  // The clue was on screen while the phone voice read it.
  expect(shown.length).toBe(6);
  for (const s of shown) expect(s.length).toBeGreaterThan(0);
});

test('#362 (20 Oct, sanat-2-C-2): the clip is in the build, the clue is not read at all, then the answer "Cahit Sıtkı Tarancı olacaktı" is', async () => {
  const C = byId.get('sanat-2-C-2')!;
  expect(CLIPS['sanat-2-C-2']).toBeDefined();
  expect(CLIPS['sanat-2-C-2-cevap']).toBeDefined();
  await openRound();
  const replace = jest.spyOn(FakePlayer.prototype, 'replace');
  const silentBeforeAnswer: string[][] = [];
  const rounds = await playRounds(['pas', 'pas', 'wrong'], 3, async (r, phase, res) => {
    if (phase === 'start') {
      // Round 1: a player reused with replace() takes play() and never sounds
      // (isLoaded true, no sound, no end), as the C clue on the phone did with
      // its clip present. Round 2: the C clip's first player swallows play()
      // however it was made. Round 3: two players in a row do, and the phone
      // voice has to read it.
      audio.stalls = r === 1 ? { afterReplace: Infinity, any: 0 } : { afterReplace: 0, any: 0, sources: new Map([[CLIPS['sanat-2-C-2'], r - 1]]) };
    }
    if (phase === 2) {
      // The wrong answer to C came: its clue must have sounded before it.
      silentBeforeAnswer.push(silentClues(res).silent);
      audio.stalls = { afterReplace: 0, any: 0 };
    }
  });
  for (const r of rounds) {
    const c = r.steps[2];
    expect(c.question.id).toBe(C.id);
    expect(c.cues.map((x) => x.cue)).toEqual(['wrong']);
    // The C clue sounded: from its own clip, or read by the phone voice once two players failed.
    const { all, silent } = silentClues(r);
    expect(all).toContain(C.id);
    expect(silent).toEqual([]);
    // Then the answer line, as on the phone.
    expect(host.said.slice(r.said)).toContain(`clip:${answerLine(C).key}`);
    expect(audio.log.slice(r.log, r.logTo).some((e) => e.e.startsWith('play#') && e.src === CLIPS['sanat-2-C-2-cevap'])).toBe(true);
  }
  expect(silentBeforeAnswer).toEqual([[], [], []]);
  // The host never reuses a player with replace(): every clip gets its own.
  expect(replace).not.toHaveBeenCalled();
  // Rounds 2 and 3: the stalled C clip was noticed and tried again; in round 3 the phone voice read it.
  expect(host.clipFailures.filter((f) => f.key === C.id)).toEqual([{ key: C.id, attempt: 1 }, { key: C.id, attempt: 1 }, { key: C.id, attempt: 2 }]);
  expect(speech.started.filter((t) => t === clueLine(C).text)).toHaveLength(1);
});
