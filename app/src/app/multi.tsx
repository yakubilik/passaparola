import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { CATEGORIES, hasQuestions } from '../data/questions';
import { matchLevels, MAX_PLAYERS, MIN_PLAYERS, playerNames } from '../game/match';
import { difficulty, MIXED, parseCats } from '../game/selection';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';

// Pass and play setup: 2 to 4 names, one category or karışık, one level.
// Everyone plays that level with their own questions.
export default function MultiSetup() {
  const [names, setNames] = useState<string[]>(['', '']);
  const [cat, setCat] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const ready = CATEGORIES.filter(hasQuestions);
  const levels = cat ? matchLevels(CATEGORIES, parseCats(cat), names.length) : [];
  const chosenLevel = level != null && levels.includes(level) ? level : null;

  const setName = (i: number, v: string) => setNames((ns) => ns.map((n, j) => (j === i ? v : n)));
  const pickCat = (id: string) => {
    setCat(id);
    setLevel(null);
  };
  const go = () => {
    if (!cat || chosenLevel == null) return;
    router.push({ pathname: '/match', params: { names: JSON.stringify(playerNames(names)), cats: cat, level: String(chosenLevel) } });
  };

  return (
    <Screen light="none">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 16 }}>
        {/* A tap off the name fields and the choices puts the keyboard away. */}
        <Pressable testID="multi-body" accessible={false} onPress={() => Keyboard.dismiss()} style={{ gap: 16 }}>
        <BackLink />
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: F.display, fontSize: 36, color: C.text, lineHeight: 40 }}>Çok oyunculu</Text>
          <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim }}>
            Tek telefon, sırayla. Yanlış ya da pas deyince sıra sonrakine geçer.
          </Text>
        </View>

        <Section title="OYUNCULAR">
          {names.map((n, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TextInput
                testID={`name-${i}`}
                accessibilityLabel={`${i + 1}. oyuncunun adı`}
                value={n}
                onChangeText={(v) => setName(i, v)}
                placeholder={`Oyuncu ${i + 1}`}
                placeholderTextColor="#6f7899"
                maxLength={16}
                autoCorrect={false}
                autoCapitalize="words"
                keyboardAppearance="dark"
                style={{
                  flex: 1, height: 48, borderRadius: 14, paddingHorizontal: 16,
                  backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
                  color: C.text, fontFamily: F.bodySemi, fontSize: 17,
                }}
              />
              {names.length > MIN_PLAYERS && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}. oyuncuyu çıkar`}
                  hitSlop={8}
                  onPress={() => setNames((ns) => ns.filter((_, j) => j !== i))}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: C.dim, fontSize: 15 }}>✕</Text>
                </Pressable>
              )}
            </View>
          ))}
          {names.length < MAX_PLAYERS && (
            <Pressable accessibilityRole="button" onPress={() => setNames((ns) => [...ns, ''])} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.accentSoft }}>+ Oyuncu ekle</Text>
            </Pressable>
          )}
        </Section>

        <Section title="KATEGORİ">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip id="mcat-karisik" label="Karışık" on={cat === MIXED} disabled={!ready.length} onPress={() => pickCat(MIXED)} />
            {CATEGORIES.map((c) => (
              <Chip key={c.category} id={`mcat-${c.category}`} label={c.title} on={cat === c.category} disabled={!hasQuestions(c)} onPress={() => pickCat(c.category)} />
            ))}
          </View>
        </Section>

        {cat && (
          <Section title="BÖLÜM">
            {levels.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {levels.map((lv) => (
                  <Chip key={lv} id={`mlevel-${lv}`} label={`Bölüm ${lv} · ${difficulty(lv)}`} on={chosenLevel === lv} onPress={() => setLevel(lv)} />
                ))}
              </View>
            ) : (
              <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim }}>Bu kategoride {names.length} kişiye yetecek soru yok.</Text>
            )}
          </Section>
        )}
        </Pressable>
      </ScrollView>

      <View style={{ paddingHorizontal: 22, paddingBottom: 12, gap: 8 }}>
        <Text style={{ fontFamily: F.bodySemi, fontSize: 13, color: C.dim }}>Çok oyunculu oyunlar bölüm açmaz.</Text>
        <Button testID="match-start" label="Başla" disabled={!cat || chosenLevel == null} onPress={go} />
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.dim }}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({ id, label, on, disabled, onPress }: { id: string; label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
        backgroundColor: on ? 'rgba(61,107,255,0.16)' : C.card,
        borderWidth: on ? 1.5 : 1, borderColor: on ? C.accent : C.cardBorder,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: C.text }}>{label}</Text>
    </Pressable>
  );
}
