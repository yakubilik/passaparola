import { Redirect, router } from 'expo-router';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { CATEGORIES } from '../data/questions';
import { counts, PASS_MARK } from '../game/round';
import { selectionHasLevel } from '../game/selection';
import { lastResult } from '../game/session';
import { Button } from '../ui/Button';
import { Ring } from '../ui/Ring';
import { Screen } from '../ui/Screen';
import { C, F, type BubbleKind } from '../ui/theme';

// Round end: the ring as it finished, the score, what unlocked, the answers missed.
export default function RoundEnd() {
  const res = lastResult();
  const { width } = useWindowDimensions();
  if (!res) return <Redirect href="/menu" />;
  const { round, level, quick, passed, unlockedNext, catsParam } = res;
  const c = counts(round);
  const all = round.correct === round.letters.length;
  const size = Math.min(width - 80, 300);
  const nextReady = passed && !quick && selectionHasLevel(res.cats, level + 1, CATEGORIES);
  const missed = round.letters.filter((l) => l.status !== 'correct');

  const title = all ? 'HARFİYEN!' : passed ? `Bölüm ${level} geçildi!` : quick ? 'Tur bitti' : 'Az kaldı!';
  const sub = all
    ? 'Bütün harfleri bildin.'
    : quick
      ? 'Hızlı oyun ilerlemeye sayılmaz.'
      : passed
        ? unlockedNext
          ? nextReady ? `Bölüm ${level + 1} açıldı.` : `Bölüm ${level + 1} açıldı, soruları yakında.`
          : 'Bu bölümü yine geçtin.'
        : `Sonraki bölüm için en az ${PASS_MARK} doğru gerekiyor.`;

  const toMap = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/levels', params: { cats: catsParam } }));

  return (
    <Screen light="intro">
      <ScrollView contentContainerStyle={{ padding: 22, gap: 18, alignItems: 'stretch' }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.accentSoft }}>
            {quick ? 'HIZLI OYUN' : `BÖLÜM ${level}`} · TUR SONU
          </Text>
          <Text testID="result-title" style={{ fontFamily: F.display, fontSize: 40, lineHeight: 44, color: passed ? C.text : C.soft }}>{title}</Text>
          <Text style={{ fontFamily: F.body, fontSize: 15, color: unlockedNext ? C.greenSoft : C.dim, textAlign: 'center' }}>{sub}</Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Ring
            size={size}
            bubble={Math.round(size * 0.085)}
            items={round.letters.map((l) => ({
              label: l.letter,
              kind: (l.status !== 'pending' ? l.status : l.passed ? 'passed' : 'pending') as BubbleKind,
            }))}
          >
            <Text testID="score" style={{ fontFamily: F.display, fontSize: 72, lineHeight: 76, color: C.text }}>{round.correct}</Text>
            <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.dim }}>/ 28 doğru</Text>
          </Ring>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Num n={c.correct} label="doğru" color={C.greenSoft} />
          <Num n={c.wrong} label="yanlış" color={C.redSoft} />
          <Num n={c.empty} label="boş" color={C.yellow} />
        </View>

        <View style={{ gap: 10 }}>
          {nextReady && (
            <Button label="Sonraki bölüm" onPress={() => router.replace({ pathname: '/game', params: { cats: catsParam, level: String(level + 1) } })} />
          )}
          <Button
            kind={nextReady ? 'ghost' : 'primary'}
            label="Tekrar oyna"
            onPress={() => router.replace({ pathname: '/game', params: { cats: catsParam, level: String(level), ...(quick ? { quick: '1' } : {}) } })}
          />
          <Button kind="ghost" label={quick ? 'Ana menü' : 'Bölüm haritası'} onPress={quick ? () => router.replace('/menu') : toMap} />
        </View>

        {missed.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.dim }}>CEVAPLAR</Text>
            {missed.map((l) => (
              <View key={l.letter} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: C.card }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: l.status === 'wrong' ? C.red : C.yellow }}>
                  <Text style={{ fontFamily: F.displayBold, fontSize: 17, color: l.status === 'wrong' ? '#fff' : C.yellowInk }}>{l.letter}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.text }}>{l.question.answers[0]}</Text>
                  <Text numberOfLines={2} style={{ fontFamily: F.body, fontSize: 13, color: C.dim }}>{l.question.clue}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Num({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
      <Text style={{ fontFamily: F.display, fontSize: 30, color }}>{n}</Text>
      <Text style={{ fontFamily: F.bodySemi, fontSize: 13, color: C.dim }}>{label}</Text>
    </View>
  );
}
