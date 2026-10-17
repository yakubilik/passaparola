import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CATEGORIES, hasQuestions, playableLevels, type CategoryFile } from '../data/questions';
import { difficulty, MIXED } from '../game/selection';
import { selectionUnlocked, unlockedLevel } from '../store/progress';
import { useProgress } from '../store/ProgressContext';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';

// 1f: choose one or more categories, or "karışık" (every letter from a different one).
export default function CategoryChoice() {
  const { progress } = useProgress();
  const [picked, setPicked] = useState<string[]>([]);
  const [mixed, setMixed] = useState(false);
  const ready = CATEGORIES.filter(hasQuestions).map((c) => c.category);

  const toggle = (id: string) => {
    setMixed(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const chosen = mixed ? ready : picked;
  const level = chosen.length ? selectionUnlocked(progress, chosen) : 1;
  const go = () => router.push({ pathname: '/levels', params: { cats: mixed ? MIXED : picked.join(',') } });

  return (
    <Screen light="none">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 16, gap: 16 }}>
        <BackLink />
        <Text style={{ fontFamily: F.display, fontSize: 36, color: C.text, lineHeight: 40 }}>Kategori seç</Text>

        <Pressable
          testID="cat-karisik"
          accessibilityRole="checkbox"
          accessibilityLabel="Karışık"
          accessibilityState={{ checked: mixed, disabled: !ready.length }}
          disabled={!ready.length}
          onPress={() => { setMixed((m) => !m); setPicked([]); }}
          style={[box(mixed), { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }]}
        >
          <View style={{ gap: 2 }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 18, color: C.text }}>Karışık</Text>
            <Text style={{ fontFamily: F.body, fontSize: 13, color: mixed ? '#c3d0ff' : C.dim }}>Her harfte farklı kategori</Text>
          </View>
          <View
            style={{
              width: 24, height: 24, borderRadius: 12,
              borderWidth: mixed ? 7 : 2,
              borderColor: mixed ? C.accentSoft : 'rgba(255,255,255,0.25)',
            }}
          />
        </Pressable>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATEGORIES.map((c) => (
            <CategoryTile key={c.category} cat={c} on={chosen.includes(c.category)} unlocked={unlockedLevel(progress, c.category)} played={!!progress.best[c.category]} onPress={() => toggle(c.category)} />
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 22, paddingBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.dim }}>
            {mixed ? 'Karışık' : `${picked.length} kategori seçildi`}
          </Text>
          <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.dim }}>Zorluk: {difficulty(level)}</Text>
        </View>
        <Button label="Bölümlere git" disabled={!chosen.length} onPress={go} />
      </View>
    </Screen>
  );
}

function box(on: boolean) {
  return {
    borderRadius: 18,
    backgroundColor: on ? 'rgba(61,107,255,0.16)' : C.card,
    borderWidth: on ? 1.5 : 1,
    borderColor: on ? C.accent : C.cardBorder,
  };
}

function CategoryTile({ cat, on, unlocked, played, onPress }: {
  cat: CategoryFile; on: boolean; unlocked: number; played: boolean; onPress: () => void;
}) {
  const levels = playableLevels(cat);
  const soon = levels.length === 0;
  const sub = soon ? 'Yakında' : played ? `Bölüm ${Math.min(unlocked, levels.length)} / ${levels.length}` : 'Başlanmadı';
  return (
    <Pressable
      testID={`cat-${cat.category}`}
      accessibilityRole="checkbox"
      accessibilityLabel={cat.title}
      accessibilityState={{ checked: on, disabled: soon }}
      disabled={soon}
      onPress={onPress}
      style={[box(on), { width: '48.5%', minHeight: 80, padding: 14, justifyContent: 'space-between', gap: 8, opacity: soon ? 0.55 : 1 }]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.text }}>{cat.title}</Text>
        {!soon && (
          <View
            style={{
              width: 20, height: 20, borderRadius: 6,
              backgroundColor: on ? C.accentSoft : 'transparent',
              borderWidth: on ? 0 : 2,
              borderColor: 'rgba(255,255,255,0.25)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {on && <Text style={{ color: C.bg, fontSize: 13, fontFamily: F.bodyBold }}>✓</Text>}
          </View>
        )}
      </View>
      <Text style={{ fontFamily: F.body, fontSize: 13, color: soon ? C.accentSoft : on ? '#c3d0ff' : C.dim }}>{sub}</Text>
    </Pressable>
  );
}
