import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORIES } from '../data/questions';
import { difficulty, mapLength, MIXED, parseCats, selectionTitle } from '../game/selection';
import { selectionUnlocked } from '../store/progress';
import { useProgress } from '../store/ProgressContext';
import { SoonTag } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';

function greeting(h = new Date().getHours()): string {
  if (h >= 5 && h < 12) return 'Günaydın';
  if (h >= 12 && h < 18) return 'İyi günler';
  if (h >= 18 && h < 23) return 'İyi akşamlar';
  return 'İyi geceler';
}

function Card({ children, onPress, testID }: { children: ReactNode; onPress?: () => void; testID?: string }) {
  const style = { borderRadius: 20, padding: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder };
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.8 : 1 }]}>
      {children}
    </Pressable>
  );
}

// 1e: main menu.
export default function Menu() {
  const { progress } = useProgress();
  const insets = useSafeAreaInsets();
  const last = progress.last;
  const lastParam = last ? last.cats.join(',') : '';
  const lastCats = last ? parseCats(lastParam) : [];
  const level = last && lastCats.length ? Math.min(last.level, selectionUnlocked(progress, lastCats)) : 1;
  const total = lastCats.length ? mapLength(lastCats) : 8;

  return (
    <Screen light="menu" bottomInset={false}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 24, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim }}>{greeting()}</Text>
            <Text style={{ fontFamily: F.display, fontSize: 32, color: C.text, lineHeight: 36 }}>Misafir</Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1d2546', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.bodyBold, color: C.text, fontSize: 16 }}>M</Text>
          </View>
        </View>

        <View
          style={{
            borderRadius: 24,
            padding: 20,
            gap: 14,
            backgroundColor: C.accent,
            backgroundImage: 'linear-gradient(160deg, #3d6bff 0%, #2335a8 100%)',
            boxShadow: '0 20px 40px rgba(61,107,255,0.25)',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ gap: 2, flex: 1 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: '#d4ddff' }}>KARİYER · TEK OYUNCU</Text>
              <Text style={{ fontFamily: F.display, fontSize: 34, color: '#fff', lineHeight: 38 }}>Bölüm {level}</Text>
              <Text style={{ fontFamily: F.body, fontSize: 15, color: '#d4ddff' }}>
                {last ? `${selectionTitle(lastParam)} · ${difficulty(level)}` : 'Kategorini seç, ilk bölümden başla'}
              </Text>
            </View>
            <Text style={{ fontFamily: F.display, fontSize: 60, lineHeight: 60, color: 'rgba(255,255,255,0.18)' }}>
              {String(level).padStart(2, '0')}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <View style={{ width: `${Math.round(((level - 1) / total) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => (last && lastCats.length ? router.push({ pathname: '/levels', params: { cats: lastParam } }) : router.push('/category'))}
            style={({ pressed }) => ({ height: 50, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: '#1a2a8f' }}>{last ? 'Devam et' : 'Başla'}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Card onPress={() => router.push({ pathname: '/game', params: { cats: MIXED, level: '1', quick: '1' } })}>
              <View style={{ minHeight: 78, gap: 6 }}>
                <Text style={{ fontFamily: F.display, fontSize: 24, color: C.text }}>Hızlı oyun</Text>
                <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, lineHeight: 19 }}>Karışık kategoriler, tek tur</Text>
              </View>
            </Card>
          </View>
          <View style={{ flex: 1 }}>
            <Card>
              <View style={{ minHeight: 78, gap: 6 }}>
                <Text style={{ fontFamily: F.display, fontSize: 24, color: C.text }}>Arkadaşlarla</Text>
                <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, lineHeight: 19 }}>2–4 kişi, sırayla</Text>
                <View style={{ flexDirection: 'row' }}><SoonTag /></View>
              </View>
            </Card>
          </View>
        </View>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.text }}>Odaya katıl</Text>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim }}>Arkadaşının kodunu gir</Text>
            </View>
            <SoonTag />
          </View>
        </Card>

        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.dim }}>GÜNÜN TURU</Text>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: C.text }}>{CATEGORIES[0].title}</Text>
                <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim }}>Herkese aynı 28 soru</Text>
              </View>
              <SoonTag />
            </View>
          </Card>
        </View>
      </ScrollView>

      <View
        style={{
          backgroundColor: C.tabBar,
          borderTopWidth: 1,
          borderTopColor: C.cardBorder,
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
        }}
      >
        <Tab label="Ana sayfa" on />
        <Tab label="Kategoriler" onPress={() => router.push('/category')} />
        <Tab label="Profil" />
      </View>
    </Screen>
  );
}

function Tab({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: !!on }} onPress={onPress} style={{ alignItems: 'center', gap: 6, minWidth: 80 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: on ? C.accent : 'transparent' }} />
      <Text style={{ fontFamily: F.bodySemi, fontSize: 13, color: on ? C.text : C.dim }}>{label}</Text>
    </Pressable>
  );
}
