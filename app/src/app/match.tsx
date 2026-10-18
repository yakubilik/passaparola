import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { createMatch, endTurn, hasOther, parseNames, pickForPlayers, type Match } from '../game/match';
import { formatClock, seededRng, type Round } from '../game/round';
import { parseCats } from '../game/selection';
import { setLastMatch } from '../game/session';
import { useRound } from '../game/useRound';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';
import { GameView } from './game';

type Why = 'wrong' | 'pass' | 'time' | 'done';

const WHY_TEXT: Record<Why, string> = { wrong: 'yanlış cevap', pass: 'pas', time: 'süre doldu', done: 'harfler bitti' };

// A pass-and-play match: a "Sıra: <name>" screen to hand the phone over,
// then that player's own round on the game screen until a wrong answer or
// Pas (when someone else can still play), their time or their letters run
// out. Nothing here is recorded as progress.
export default function MatchGame() {
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
  const ref = useRef(match);
  ref.current = match;

  const onTurnEnd = useCallback((round: Round, why: Why) => {
    const m = ref.current!;
    const next = endTurn(m, round);
    if (next.done) {
      setLastMatch({ players: next.players, catsParam: params.cats ?? '', level });
      router.replace('/match-result');
      return;
    }
    ref.current = next;
    setMatch(next);
    setTurn((t) => t + 1);
    setHandover({ note: `${m.players[m.cur].name}: ${WHY_TEXT[why]}` });
  }, [params.cats, level]);

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
  if (handover) return <Handover match={match} note={handover.note} onStart={() => setHandover(null)} />;
  return <MatchTurn key={turn} round={p.round} name={p.name} others={hasOther(match)} onTurnEnd={onTurnEnd} />;
}

// One player's turn on the game screen. It starts at once (the tap on the
// "Sıra" screen was the start) and hands the round back when the turn ends.
function MatchTurn({ round, name, others, onTurnEnd }: {
  round: Round; name: string; others: boolean; onTurnEnd: (r: Round, why: Why) => void;
}) {
  const ended = useRef(false);
  const end = useCallback((r: Round, why: Why) => {
    if (ended.current) return;
    ended.current = true;
    onTurnEnd(r, why);
  }, [onTurnEnd]);
  const onOver = useCallback((r: Round) => end(r, r.timeLeft <= 0 ? 'time' : 'done'), [end]);
  const game = useRound(round, onOver);
  const { start } = game;
  useLayoutEffect(() => start(), [start]);

  // A settled letter makes a new letters array (a clock tick does not): a
  // wrong answer ends the turn once its reveal is over, a Pas at once.
  const prev = useRef(round);
  const wrongShown = useRef(false);
  useEffect(() => {
    const r = game.round!;
    const p = prev.current;
    prev.current = r;
    if (!others || r.letters === p.letters || r.done) return;
    if (r.wrong > p.wrong) wrongShown.current = true;
    else if (r.correct === p.correct) end(r, 'pass');
  }, [game.round, others, end]);
  useEffect(() => {
    if (wrongShown.current && game.phase === 'playing') end(game.round!, 'wrong');
  }, [game.phase, game.round, end]);

  return <GameView game={game} player={name} />;
}

function Handover({ match, note, onStart }: { match: Match; note?: string; onStart: () => void }) {
  const p = match.players[match.cur];
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
      </View>
    </Screen>
  );
}
