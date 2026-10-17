import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { difficulty, mapLength, parseCats, selectionHasLevel, selectionTitle } from '../game/selection';
import { PASS_MARK } from '../game/round';
import { bestScore, selectionUnlocked } from '../store/progress';
import { useProgress } from '../store/ProgressContext';
import { BackLink } from '../ui/BackLink';
import { Bubble } from '../ui/Bubble';
import { Screen } from '../ui/Screen';
import { C, F, type BubbleKind } from '../ui/theme';

type Stop = { level: number; state: 'done' | 'open' | 'locked' | 'soon'; best?: number };

const STATE_TEXT = { done: 'geçildi', open: 'açık', locked: 'kilitli', soon: 'yakında' };
const STOP_SIZE = 64;
const ROW = 104;

// The level map: the stops of the career, lit up as the player gets through
// them. Same bubbles as the ring: green passed, white the next one to play,
// blue locked, dim "yakında" where no questions are written yet.
export default function LevelMap() {
  const params = useLocalSearchParams<{ cats?: string }>();
  const { progress, ready } = useProgress();
  const { width } = useWindowDimensions();
  const cats = parseCats(params.cats);
  const title = selectionTitle(params.cats) || 'Bölümler';
  const open = selectionUnlocked(progress, cats);
  const stops: Stop[] = Array.from({ length: mapLength(cats) }, (_, i) => {
    const level = i + 1;
    const best = bestScore(progress, cats, level);
    if (!selectionHasLevel(cats, level)) return { level, state: 'soon' };
    if (level > open) return { level, state: 'locked' };
    return { level, state: best != null && best >= PASS_MARK ? 'done' : 'open', best };
  });

  const lane = width - 44 - STOP_SIZE;
  const xs = [0.12, 0.5, 0.88, 0.5];

  return (
    <Screen light="menu">
      <View style={{ paddingHorizontal: 22, paddingTop: 14, gap: 10 }}>
        <BackLink />
        <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.accentSoft }}>BÖLÜM HARİTASI</Text>
        <Text style={{ fontFamily: F.display, fontSize: 36, lineHeight: 40, color: C.text }}>{title}</Text>
        <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim }}>
          Bir bölümü en az {PASS_MARK} doğruyla bitir, sonraki açılsın.
        </Text>
      </View>
      {!ready || !cats.length ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {ready && <Text style={{ fontFamily: F.bodySemi, color: C.dim, fontSize: 16 }}>Bu kategori yakında.</Text>}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ height: stops.length * ROW + 60 }}>
          {stops.slice(1).map((s, i) => {
            const x1 = lane * xs[i % 4] + STOP_SIZE / 2;
            const x2 = lane * xs[(i + 1) % 4] + STOP_SIZE / 2;
            const dx = x2 - x1;
            const len = Math.hypot(dx, ROW);
            return (
              <View
                key={'path' + s.level}
                style={{
                  position: 'absolute',
                  left: 22 + (x1 + x2) / 2 - len / 2,
                  top: 20 + i * ROW + STOP_SIZE / 2 + ROW / 2,
                  width: len,
                  height: 0,
                  borderTopWidth: 3,
                  borderStyle: 'dashed',
                  borderColor: s.state === 'soon' || s.state === 'locked' ? 'rgba(143,168,255,0.18)' : 'rgba(143,168,255,0.55)',
                  transform: [{ rotate: `${Math.atan2(ROW, dx)}rad` }],
                }}
              />
            );
          })}
          {stops.map((s, i) => (
            <StopView key={s.level} stop={s} cats={params.cats ?? ''} left={22 + lane * xs[i % 4]} top={20 + i * ROW} labelLeft={xs[i % 4] > 0.6} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function StopView({ stop, cats, left, top, labelLeft }: { stop: Stop; cats: string; left: number; top: number; labelLeft: boolean }) {
  const kind: BubbleKind = { done: 'correct', open: 'active', locked: 'locked', soon: 'soon' }[stop.state] as BubbleKind;
  const playable = stop.state === 'done' || stop.state === 'open';
  const grow = stop.state === 'open' ? 8 : 0;
  const sub =
    stop.state === 'soon' ? 'Yakında' :
    stop.state === 'locked' ? 'Kilitli' :
    stop.best != null ? `En iyi: ${stop.best} / 28` : 'Oyna';
  return (
    <Pressable
      testID={`level-${stop.level}`}
      accessibilityRole="button"
      accessibilityLabel={`Bölüm ${stop.level}, ${STATE_TEXT[stop.state]}`}
      accessibilityState={{ disabled: !playable }}
      disabled={!playable}
      onPress={() => router.push({ pathname: '/game', params: { cats, level: String(stop.level) } })}
      style={{ position: 'absolute', left: left - grow / 2, top: top - grow / 2, width: STOP_SIZE + grow, height: STOP_SIZE + grow }}
    >
      <Bubble label={String(stop.level)} kind={kind} size={STOP_SIZE + grow} />
      <View
        style={[
          { position: 'absolute', top: (STOP_SIZE + grow) / 2 - 22, width: 170 },
          labelLeft ? { right: STOP_SIZE + grow + 12, alignItems: 'flex-end' } : { left: STOP_SIZE + grow + 12 },
        ]}
      >
        <Text style={{ fontFamily: F.display, fontSize: 20, color: playable ? C.text : C.dim }}>Bölüm {stop.level}</Text>
        <Text style={{ fontFamily: F.bodySemi, fontSize: 13, color: stop.state === 'soon' ? C.accentSoft : stop.state === 'done' ? C.greenSoft : C.dim }}>
          {difficulty(stop.level)} · {sub}
        </Text>
      </View>
    </Pressable>
  );
}
