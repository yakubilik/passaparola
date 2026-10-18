import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { createMatch, endTurn, hasOther, parseNames, pickForPlayers, type Match } from '../game/match';
import { formatClock, seededRng, type Round } from '../game/round';
import { parseCats } from '../game/selection';
import { setLastMatch } from '../game/session';
import { useRound } from '../game/useRound';
import { useSettings } from '../store/SettingsContext';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { MicCheck } from '../ui/MicCheck';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';
import { host, listener, prepareAudio, sounds } from '../voice/engine';
import { host as hostLine } from '../voice/lines';
import { useReadyByVoice, useVoiceEffects, useVoiceRound } from '../voice/useVoiceRound';
import { GameView } from './game';

type Why = 'wrong' | 'pass' | 'time' | 'done';

const WHY_TEXT: Record<Why, string> = { wrong: 'yanlış cevap', pass: 'pas', time: 'süre doldu', done: 'harfler bitti' };

// A pass-and-play match: a "Sıra: <name>" screen to hand the phone over,
// then that player's own round on the game screen until a wrong answer or
// Pas (when someone else can still play), their time or their letters run
// out. A Pas or a wrong answer first stops on a result card (what happened,
// the score so far, the host bridging to the next player) until "Sıradaki
// oyuncu" is pressed or "hazırım" said. Nothing here is recorded as progress. With the voice on the mic is
// opened on the first "Sıra" screen and stays open for the whole match.
export default function MatchGame() {
  const { settings, ready, update } = useSettings();
  if (!ready) return <Screen light="game"><View /></Screen>;
  if (settings.voice && !settings.micChecked) {
    return (
      <Screen light="game">
        <View style={{ paddingHorizontal: 22, paddingTop: 10 }}>
          <BackLink />
        </View>
        <MicCheck onDone={() => update({ micChecked: true })} onTypeInstead={() => update({ voice: false, micChecked: true })} />
      </Screen>
    );
  }
  return <MatchScreen voice={settings.voice} />;
}

function MatchScreen({ voice }: { voice: boolean }) {
  const params = useLocalSearchParams<{ names?: string; cats?: string; level?: string; seed?: string }>();
  const level = Number(params.level) || 1;
  const [initial] = useState<Match | null>(() => {
    const names = parseNames(params.names);
    if (!names) return null;
    const rng = params.seed ? seededRng(Number(params.seed)) : Math.random;
    const sets = pickForPlayers(CATEGORIES, parseCats(params.cats), level, names.length, rng);
    return sets ? createMatch(names, sets) : null;
  });
  const [match, setMatch] = useState(initial);
  const [turn, setTurn] = useState(0);
  const [handover, setHandover] = useState<{ note?: string } | null>({});
  const [result, setResult] = useState<TurnResult | null>(null);
  const ref = useRef(match);
  ref.current = match;

  // The theme once for the match; the mic closes when the match screen goes.
  useEffect(() => {
    if (!initial) return;
    prepareAudio().then(() => sounds.play('theme'));
    return () => listener.stop();
  }, [initial]);

  const onTurnEnd = useCallback((round: Round, why: Why, answer?: string) => {
    const m = ref.current!;
    const next = endTurn(m, round);
    if (next.done) {
      listener.stop();
      if (voice) host.speak([hostLine('end')]);
      setLastMatch({ players: next.players, catsParam: params.cats ?? '', level });
      router.replace('/match-result');
      return;
    }
    ref.current = next;
    setMatch(next);
    setTurn((t) => t + 1);
    const note = `${m.players[m.cur].name}: ${WHY_TEXT[why]}`;
    if (why === 'pass' || why === 'wrong') {
      setResult({ why, name: m.players[m.cur].name, round, answer, next: next.players[next.cur].name, note });
    } else {
      setHandover({ note });
    }
  }, [params.cats, level, voice]);

  if (!match) {
    return (
      <Screen light="game">
        <View style={{ padding: 22, gap: 20 }}>
          <BackLink />
          <Text style={{ fontFamily: F.display, fontSize: 32, color: C.text }}>Bu bölüm yakında</Text>
          <Text style={{ fontFamily: F.body, fontSize: 16, color: C.dim }}>Bu bölümde herkese ayrı soru yetmiyor. Başka bir bölüm ya da kategori seç.</Text>
        </View>
      </Screen>
    );
  }

  const p = match.players[match.cur];
  if (result) {
    return (
      <ResultCard
        result={result}
        match={match}
        voice={voice}
        onNext={() => { setResult(null); setHandover({ note: result.note }); }}
      />
    );
  }
  if (handover) return <Handover match={match} note={handover.note} voice={voice} onStart={() => setHandover(null)} />;
  return <MatchTurn key={turn} round={p.round} name={p.name} others={hasOther(match)} voice={voice} onTurnEnd={onTurnEnd} />;
}

// One player's turn on the game screen. It starts at once (the tap on the
// "Sıra" screen was the start) and hands the round back when the turn ends.
function MatchTurn({ round, name, others, voice, onTurnEnd }: {
  round: Round; name: string; others: boolean; voice: boolean; onTurnEnd: (r: Round, why: Why, answer?: string) => void;
}) {
  const v = useVoiceRound(voice, { theme: false, keepMic: true, missEndsTurn: others });
  const ended = useRef(false);
  const end = useCallback((r: Round, why: Why, answer?: string) => {
    if (ended.current) return;
    ended.current = true;
    onTurnEnd(r, why, answer);
  }, [onTurnEnd]);
  const onOver = useCallback((r: Round) => {
    v.onTurnOver(r);
    end(r, r.timeLeft <= 0 ? 'time' : 'done');
  }, [end, v.onTurnOver]);
  const game = useRound(round, onOver, v.onAnswer);
  useVoiceEffects(v, game);
  const { start } = game;
  const { begin } = v;
  useLayoutEffect(() => { start(); begin(); }, [start, begin]);

  // A settled letter makes a new letters array (a clock tick does not): a
  // wrong answer ends the turn once its reveal is over, a Pas at once.
  const prev = useRef(round);
  const wrongShown = useRef<string | null>(null);
  useEffect(() => {
    const r = game.round!;
    const p = prev.current;
    prev.current = r;
    if (!others || r.letters === p.letters || r.done) return;
    if (r.wrong > p.wrong) {
      const missed = r.letters.find((l, i) => l.status === 'wrong' && p.letters[i].status !== 'wrong');
      wrongShown.current = missed?.question.answers[0] ?? '';
    } else if (r.correct === p.correct) end(r, 'pass');
  }, [game.round, others, end]);
  useEffect(() => {
    if (wrongShown.current !== null && game.phase === 'playing') end(game.round!, 'wrong', wrongShown.current);
  }, [game.phase, game.round, end]);

  return <GameView game={game} voice={v} player={name} />;
}

type TurnResult = { why: 'pass' | 'wrong'; name: string; round: Round; answer?: string; next: string; note: string };

// What ended the turn, before the phone changes hands: Pas, or the wrong
// answer with the right one, the player's score so far and the host's bridge
// to the next player. Nothing moves on until the button or "hazırım".
function ResultCard({ result, match, voice, onNext }: { result: TurnResult; match: Match; voice: boolean; onNext: () => void }) {
  const { why, name, round, answer, next } = result;
  useReadyByVoice(voice, onNext, why === 'pass' ? [hostLine('pass_next')] : []);
  const passed = round.letters.filter((l) => l.passed && l.status === 'pending').length;
  return (
    <Screen light="intro">
      <View style={{ flex: 1, padding: 32, gap: 22, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.accentSoft }}>{name.toLocaleUpperCase('tr-TR')}</Text>
          <Text testID="turn-result" style={{ fontFamily: F.display, fontSize: 44, lineHeight: 50, color: why === 'pass' ? C.yellow : C.redSoft, textAlign: 'center' }}>
            {why === 'pass' ? 'Pas' : `Yanlış — doğru cevap: ${answer}`}
          </Text>
        </View>
        <View
          testID="turn-score"
          accessibilityLabel={`${name}: ${round.correct} doğru, ${round.wrong} yanlış, ${passed} pas`}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, paddingVertical: 14, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}
        >
          <Text style={{ fontFamily: F.bodySemi, fontSize: 16, color: C.greenSoft }}>{round.correct} doğru</Text>
          <Text style={{ fontFamily: F.bodySemi, fontSize: 16, color: C.redSoft }}>{round.wrong} yanlış</Text>
          <Text style={{ fontFamily: F.bodySemi, fontSize: 16, color: C.yellow }}>{passed} pas</Text>
          <Text style={{ fontFamily: F.bodySemi, fontSize: 16, color: C.dim, fontVariant: ['tabular-nums'] }}>{formatClock(round.timeLeft)}</Text>
        </View>
        <Button testID="next-player" label={`Sıradaki oyuncu: ${next}`} onPress={onNext} />
        {voice && <Text testID="say-ready" style={{ fontFamily: F.body, fontSize: 14, color: C.dim, textAlign: 'center' }}>ya da “hazırım” de</Text>}
      </View>
    </Screen>
  );
}

function Handover({ match, note, voice, onStart }: { match: Match; note?: string; voice: boolean; onStart: () => void }) {
  const p = match.players[match.cur];
  useReadyByVoice(voice, onStart);
  return (
    <Screen light="intro">
      <View style={{ flex: 1, padding: 32, gap: 22, justifyContent: 'center' }}>
        {!!note && <Text testID="handover-note" style={{ fontFamily: F.bodySemi, fontSize: 15, color: C.dim, textAlign: 'center' }}>{note}</Text>}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.accentSoft }}>TELEFONU VER</Text>
          <Text testID="handover" style={{ fontFamily: F.display, fontSize: 44, lineHeight: 50, color: C.text, textAlign: 'center' }}>Sıra: {p.name}</Text>
        </View>
        <View style={{ gap: 8 }}>
          {match.players.map((q, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
                backgroundColor: i === match.cur ? 'rgba(61,107,255,0.16)' : C.card,
                borderWidth: 1, borderColor: i === match.cur ? C.accent : C.cardBorder,
                opacity: q.round.done ? 0.55 : 1,
              }}
            >
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bodyBold, fontSize: 16, color: C.text }}>{q.name}</Text>
              <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.greenSoft }}>{q.round.correct} doğru</Text>
              <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.dim, fontVariant: ['tabular-nums'] }}>
                {q.round.done ? 'bitti' : formatClock(q.round.timeLeft)}
              </Text>
            </View>
          ))}
        </View>
        <Button label="Başla" onPress={onStart} />
        {voice && <Text testID="say-ready" style={{ fontFamily: F.body, fontSize: 14, color: C.dim, textAlign: 'center' }}>ya da “hazırım” de</Text>}
      </View>
    </Screen>
  );
}
