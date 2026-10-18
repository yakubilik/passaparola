import { Redirect, router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { standings, tiedForFirst } from '../game/match';
import { formatClock } from '../game/round';
import { selectionTitle } from '../game/selection';
import { lastMatchResult } from '../game/session';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';

// Pass and play end: the players ranked by correct answers, then fewer wrong,
// then time left. Players level on all three share a place.
export default function MatchEnd() {
  const res = lastMatchResult();
  if (!res) return <Redirect href="/menu" />;
  const { players, catsParam, level } = res;
  const rows = standings(players);
  const tied = tiedForFirst(players);
  const title = tied.length ? 'Berabere!' : `${rows[0].player.name} kazandı!`;
  const sub = tied.length
    ? `${tied.map((p) => p.name).join(' ve ')} eşit: aynı doğru, yanlış ve süre.`
    : `${rows[0].player.round.correct} doğruyla birinci.`;

  return (
    <Screen light="intro">
      <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.accentSoft }}>
            {selectionTitle(catsParam).toLocaleUpperCase('tr-TR')} · BÖLÜM {level} · SONUÇ
          </Text>
          <Text testID="match-title" style={{ fontFamily: F.display, fontSize: 40, lineHeight: 44, color: C.text, textAlign: 'center' }}>{title}</Text>
          <Text style={{ fontFamily: F.body, fontSize: 15, color: C.dim, textAlign: 'center' }}>{sub}</Text>
        </View>

        <View style={{ gap: 10 }}>
          {rows.map(({ player, index, place }, i) => (
            <View
              key={index}
              testID={`rank-${i + 1}`}
              accessibilityLabel={`${place}. ${player.name}, ${player.round.correct} doğru, ${player.round.wrong} yanlış`}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18,
                backgroundColor: place === 1 ? 'rgba(61,107,255,0.16)' : C.card,
                borderWidth: 1, borderColor: place === 1 ? C.accent : C.cardBorder,
              }}
            >
              <Text style={{ width: 28, fontFamily: F.display, fontSize: 30, color: place === 1 ? C.text : C.dim }}>{place}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text testID="rank-name" numberOfLines={1} style={{ fontFamily: F.bodyBold, fontSize: 18, color: C.text }}>{player.name}</Text>
                <Text style={{ fontFamily: F.bodySemi, fontSize: 13, color: C.dim }}>
                  <Text style={{ color: C.greenSoft }}>{player.round.correct} doğru</Text> · <Text style={{ color: C.redSoft }}>{player.round.wrong} yanlış</Text> · {formatClock(player.round.timeLeft)} kaldı
                </Text>
              </View>
              <Text style={{ fontFamily: F.display, fontSize: 34, color: C.text }}>{player.round.correct}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 10 }}>
          <Button
            label="Tekrar oyna"
            onPress={() => router.replace({ pathname: '/match', params: { names: JSON.stringify(players.map((p) => p.name)), cats: catsParam, level: String(level) } })}
          />
          <Button kind="ghost" label="Ana menü" onPress={() => router.replace('/menu')} />
        </View>
        <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim, textAlign: 'center' }}>Çok oyunculu oyunlar bölüm açmaz.</Text>
      </ScrollView>
    </Screen>
  );
}
