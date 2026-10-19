import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { judgeSpoken, spokenPace, type Verdict } from '../game/normalize';
import { current, type Round } from '../game/round';
import type { Answered, useRound } from '../game/useRound';
import { audioSettled, host, listener, prepareAudio, settleAudio, sounds } from './engine';
import { answerLine, clueLine, host as hostLine, type HostKey, type Line } from './lines';
import { contextFor, type Heard, type MicState, type Pace } from './listener';
import { noteRoundAudio } from './roundAudio';
import { logAudio, selfTestOn } from './selfTest';
import { CUE_LEAD_MS } from './sounds';

type Game = ReturnType<typeof useRound>;

const CORRECT: HostKey[] = ['correct1', 'correct2', 'correct3'];

// The voice layer of a round, as in the web game (js/game.js): the theme when
// the round opens, the bed under it, the host reading each clue with the
// clock stopped until the reading ends, the mic opened once at the start and
// kept open, spoken answers judged like typed ones, and a cue for every
// answer and for the last ten seconds. With `voice` off only the cues remain.
// While the app is in the background everything is silent, the mic closed and
// the clock stopped; coming back the bed, the mic and the clue start again.
//
// open: the round is really there (theme plays once it is). theme: false for
// later turns of a match. keepMic: the match screen owns the mic, so leaving a
// turn does not close it (the next "Sıra" screen listens for "hazırım").
// missEndsTurn: a wrong answer ends this match turn, so the host only says the
// right answer here and bridges to the next player on the result card.
/** The last spoken answer and how it was judged, shown under the answer field for a moment. */
export type Judged = { text: string; verdict: Verdict };
const JUDGED_MS = 3000;

export type VoiceOptions = { open?: boolean; theme?: boolean; keepMic?: boolean; missEndsTurn?: boolean; rng?: () => number };

export function useVoiceRound(voice: boolean, { open = true, theme = true, keepMic = false, missEndsTurn = false, rng = Math.random }: VoiceOptions = {}) {
  const [reading, setReading] = useState(false);
  // Which question's clue is on screen (useRound's `asked`): a clue appears
  // when the host starts reading it, not before (see clueShown).
  const [shownFor, setShownFor] = useState(-1);
  const [heard, setHeard] = useState('');
  const [judged, setJudged] = useState<Judged | null>(null);
  const judgedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cueAt = useRef(-Infinity);
  const [mic, setMic] = useState<MicState>('off');
  const game = useRef<Game | null>(null);
  const readingRef = useRef(false);
  const readFor = useRef(-1);
  const first = useRef(true);
  const prefix = useRef<Line | null>(null);
  const wrongRun = useRef(0);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerRelease = useRef<(() => void) | null>(null);  // lets the wrong answer's reveal end
  const ended = useRef(false);
  const missed = useRef(false);  // a wrong answer ended this match turn: no next clue
  const lastSec = useRef(Infinity);
  const readGen = useRef(0);  // a newer read() (or none at all) drops a line still waiting for settleAudio

  const stopReading = useCallback(() => {
    if (!readingRef.current) return;
    readingRef.current = false;
    if (speakTimer.current) clearTimeout(speakTimer.current);
    host.cancel();
    setReading(false);
    game.current?.hold(false);
  }, []);

  // The host's lines after a wrong answer will not be said after all (a new
  // clue, the app going away): the reveal must not wait for them.
  const dropAnswer = useCallback(() => {
    if (answerTimer.current) clearTimeout(answerTimer.current);
    answerTimer.current = null;
    const release = answerRelease.current;
    answerRelease.current = null;
    release?.();
  }, []);

  // The round opens with the theme; leaving it closes the mic and the bed.
  useEffect(() => {
    if (!open) return;
    let live = true;
    prepareAudio().then(() => { if (live && theme) sounds.play('theme'); });
    return () => { live = false; };
  }, [open, theme]);
  const keepMicRef = useRef(keepMic);
  keepMicRef.current = keepMic;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (answerTimer.current) clearTimeout(answerTimer.current);
      if (speakTimer.current) clearTimeout(speakTimer.current);
      if (judgedTimer.current) clearTimeout(judgedTimer.current);
      if (!keepMicRef.current) listener.stop();
      sounds.stopBg();
      if (!ended.current) host.cancel();
    };
  }, []);

  const onHeard = useCallback((alts: string[], heard?: Heard) => {
    const g = game.current;
    const r = g?.round;
    if (!g || !r || g.phase !== 'playing' || away.current) return;
    // The self-test answers by itself; what the mic hears there (on the simulator,
    // the Mac's own speakers) is not judged, the mic stays open all the same.
    if (selfTestOn()) return;
    const verdict = judgeSpoken(alts, current(r).question.answers);
    // Words heard while the host talks (or just after) may be the host itself:
    // a wrong answer is dropped only when its words are the host's, or close to
    // them. Anything else is the player's and is judged at once, reading or not.
    const hostTime = readingRef.current || host.speaking || listener.hostRecent || !!heard?.duringHost;
    setHeard('');
    // With iOS voice processing off (19 Oct 2026) the mic hears the loudspeaker; recognised
    // host speech rarely matches the clue text closely enough for hostLike, so while the host
    // talks (and just after) a 'wrong' is never judged: only a right answer or Pas counts then.
    if (verdict === 'wrong' && (host.speaking || listener.hostRecent)) return;
    g.judge(verdict, alts[0]);
    if (judgedTimer.current) clearTimeout(judgedTimer.current);
    setJudged({ text: alts[0], verdict });
    judgedTimer.current = setTimeout(() => setJudged(null), JUDGED_MS);
  }, []);

  // Words being heard: shown at once, and the last verdict gives way to them.
  const onInterim = useCallback((text: string) => {
    setHeard(text);
    if (text) setJudged(null);
  }, []);

  // A right answer or a Pas is judged the moment it is heard, not after a pause.
  const pace = useCallback<Pace>((alts) => {
    const r = game.current?.round;
    if (!r || game.current?.phase !== 'playing') return 'settle';
    return spokenPace(alts, current(r).question.answers);
  }, []);

  // Every answer of the round (and the pass words), for the recognizer to
  // expect: one request serves the whole round (see listener.ts).
  const context = useCallback(() => contextFor(game.current?.round?.letters.flatMap((l) => l.question.answers) ?? []), []);

  // From the Başla button: the mic opens for the whole round (in a match it is
  // already open and only gets this round's handler) and the bed starts. In
  // this order: the session is set first, then the mic, and only once its
  // start has settled (settleAudio) the bed and the host's first line (read).
  const begin = useCallback(() => {
    started.current = true;
    const live = () => alive.current && !ended.current && !away.current;
    const open = () => {
      if (!voice) return;
      listener.onState = setMic;
      listener.onInterim = onInterim;
      listener.listen(onHeard, pace, context());
    };
    // The round's audio as its mic came up, for SES OTURUMU (one line per round).
    const settled = () => {
      if (!live()) return;
      if (voice) {
        const r = noteRoundAudio();
        if (selfTestOn()) logAudio('round-start', r.round);
      }
      sounds.startBg();
    };
    // A match's next turn: the mic is open, the session long set.
    if (listener.open) {
      open();
      if (audioSettled()) settled();
      else settleAudio().then(settled);
      return;
    }
    prepareAudio().then(() => {
      if (!live()) return;
      if (voice) sounds.hushCues();
      open();
      return settleAudio().then(settled);
    });
  }, [voice, onHeard, onInterim, pace, context]);

  // The app went to the background (or a call, Control Centre): silence
  // everything, close the mic and stop the clock. Back in front: the bed and
  // the mic again, and the current clue is read anew.
  const away = useRef(false);
  const started = useRef(false);
  const [awayState, setAway] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const g = game.current;
      if (state === 'active') {
        if (!away.current) return;
        away.current = false;
        setAway(false);
        g?.pause(false);
        if (!started.current || ended.current || !g || g.phase === 'over') return;
        if (voice) {
          listener.listen(onHeard, pace, context());
          readFor.current = -1;  // read the current clue again, once the mic has settled
        }
        settleAudio().then(() => { if (alive.current && !away.current && !ended.current) sounds.startBg(); });
      } else if (state === 'background' || state === 'inactive') {
        if (away.current) return;
        away.current = true;
        setAway(true);
        g?.pause(true);
        dropAnswer();
        if (speakTimer.current) clearTimeout(speakTimer.current);
        if (readingRef.current) {
          readingRef.current = false;
          setReading(false);
          g?.hold(false);
        }
        host.cancel();
        sounds.stopAll();
        listener.stop();
      }
    });
    return () => sub.remove();
  }, [voice, onHeard, pace, context, dropAnswer]);

  const read = useCallback((r: Round) => {
    const g = game.current;
    if (!g || away.current || missed.current) return;
    dropAnswer();
    if (speakTimer.current) clearTimeout(speakTimer.current);
    const lines: Line[] = [];
    if (first.current) lines.push(hostLine('go'));
    if (prefix.current) lines.push(prefix.current);
    first.current = false;
    prefix.current = null;
    const clueAt = lines.length;
    lines.push(clueLine(current(r).question));
    const asked = readFor.current;
    // The recognizer is left alone: its request already expects every answer of the round.
    readingRef.current = true;
    setReading(true);
    g.hold(true);
    const speak = () => {
      // Only what is said from here on is an answer to this clue: the last
      // answer's late words (and its final) never are (#358).
      listener.clueStarts();
      host.speak(lines, () => {
        readingRef.current = false;
        setReading(false);
        game.current?.hold(false);
      }, undefined, (i) => { if (i === clueAt) setShownFor(asked); });
    };
    // Right after an answer the cue sounds first and the host a moment later.
    const go = () => {
      const lead = cueAt.current + CUE_LEAD_MS - Date.now();
      if (lead > 0) speakTimer.current = setTimeout(speak, lead);
      else speak();
    };
    // The round's first line (and the first after coming back) waits for the
    // mic's start to settle, with the clock held: see settleAudio.
    const my = ++readGen.current;
    if (audioSettled()) go();
    else settleAudio().then(() => { if (my === readGen.current && readingRef.current && !away.current) go(); });
  }, [dropAnswer]);

  const onAnswer = useCallback(({ verdict, was }: Answered) => {
    stopReading();
    setHeard('');
    sounds.play(verdict === 'pass' ? 'pas' : verdict);
    cueAt.current = Date.now();
    if (!voice) return;
    if (verdict === 'correct') {
      wrongRun.current = 0;
      // The host now and then confirms out loud, as on the show.
      if (rng() < 0.6) prefix.current = hostLine(CORRECT[Math.floor(rng() * CORRECT.length)]);
    } else if (verdict === 'wrong') {
      wrongRun.current++;
      if (missEndsTurn) missed.current = true;
      const lines = missEndsTurn ? [answerLine(was.question)] : [hostLine('wrong'), answerLine(was.question)];
      if (!missEndsTurn && wrongRun.current === 2) lines.push(hostLine('listen'));
      // The reveal waits for these lines, and ends anyway if they are cut off
      // (host.speak's `cut`) or never start (dropAnswer): it may never hang on them.
      dropAnswer();
      const release = game.current?.holdReveal() ?? null;
      answerRelease.current = release;
      answerTimer.current = setTimeout(() => {
        answerTimer.current = null;
        answerRelease.current = null;
        host.speak(lines, release ?? undefined, release ?? undefined);
      }, 400);
    }
  }, [voice, rng, missEndsTurn, stopReading, dropAnswer]);

  const onOver = useCallback((r: Round) => {
    ended.current = true;
    stopReading();
    sounds.stopBg();
    if (voice) {
      const all = r.correct === r.letters.length;
      const lines = all ? [hostLine('allcorrect')] : r.timeLeft <= 0 ? [hostLine('timeup'), hostLine('end')] : [hostLine('end')];
      // After the last answer's cue; not cleared on leaving: the host finishes the line on the next screen.
      const lead = cueAt.current + CUE_LEAD_MS - Date.now();
      if (lead > 0) setTimeout(() => host.speak(lines), lead);
      else host.speak(lines);
    }
    // After the cue and the host's line have started: the mic closes once they are over (see listener.stop).
    listener.stop();
  }, [voice, stopReading]);

  // A match turn whose round ran out: the mic stays open for the next player.
  const onTurnOver = useCallback((r: Round) => {
    ended.current = true;
    stopReading();
    sounds.stopBg();
    if (voice && r.timeLeft <= 0) host.speak([hostLine('timeup')]);
  }, [voice, stopReading]);

  // Called on every render with the round's current state.
  const bind = (g: Game) => {
    game.current = g;
  };

  // With the host reading, a question's clue and its letter are shown from
  // the moment its clue line starts; typed (voice off) at once.
  const clueShown = useCallback((asked: number) => !voice || shownFor === asked, [voice, shownFor]);

  return { reading, heard, clueShown, judged, mic, away: awayState, begin, read, onAnswer, onOver, onTurnOver, bind, readFor, lastSec, voice };
}

// The effects that follow the round: read each new question, warn in the last ten seconds.
export function useVoiceEffects(v: ReturnType<typeof useVoiceRound>, g: Game) {
  v.bind(g);
  const { phase, asked, round } = g;
  useEffect(() => {
    if (!v.voice || v.away || phase !== 'playing' || !round || round.done || v.readFor.current === asked) return;
    v.readFor.current = asked;
    v.read(round);
  }, [phase, asked, v.voice, v.away]);

  const sec = round ? Math.ceil(round.timeLeft) : 0;
  useEffect(() => {
    if (phase === 'playing' && sec > 0 && sec <= 10 && sec < v.lastSec.current) sounds.play('warn');
    v.lastSec.current = sec;
  }, [sec, phase]);
}

const READY = /hazır|hazir|başla|basla|tamam|evet|hadi/;
const READY_WORDS = ['hazırım', 'hazır', 'tamam', 'başla'];

// The "Sıra: <name>" screen of a match (and the result card before it): the
// host says `lines` and the player moves on by saying "hazırım" (or tap).
// Opens the mic the first time; later turns keep it open and its request
// with it, so `answers` should be every player's answers: the first request
// of the match expects them along with the ready words (see listener.ts).
export function useReadyByVoice(voice: boolean, onReady: () => void, lines: Line[] = [hostLine('turn')], answers: readonly string[] = []) {
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    if (!voice) return;
    let live = true;
    const context = contextFor([...READY_WORDS, ...answers]);
    const open = () => listener.listen((alts) => { if (alts.some((a) => READY.test(a))) ready.current(); }, undefined, context);
    // The session, then the mic, then (once its start has settled) the host.
    prepareAudio().then(() => {
      if (!live) return;
      open();
      return settleAudio().then(() => { if (live) host.speak(lines); });
    });
    // In the background: quiet and the mic closed; back in front the mic opens again.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') open();
      else { host.cancel(); listener.stop(); }
    });
    return () => { live = false; sub.remove(); };
  }, [voice]);
}
