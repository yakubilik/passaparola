import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, Switch, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent,
} from 'react-native';

import { CATEGORIES } from '../data/questions';
import { counts, createRound, seededRng, current, formatClock, pickQuestions, PASS_MARK, promptLine, type Round, type RoundLetter } from '../game/round';
import { parseCats } from '../game/selection';
import { setLastResult } from '../game/session';
import { useRound } from '../game/useRound';
import { selectionUnlocked } from '../store/progress';
import { useProgress } from '../store/ProgressContext';
import { useSettings } from '../store/SettingsContext';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { Face } from '../ui/Face';
import { MicCheck } from '../ui/MicCheck';
import { Ring, type RingItem } from '../ui/Ring';
import { Screen } from '../ui/Screen';
import { C, F, type BubbleKind } from '../ui/theme';
import { useVoiceEffects, useVoiceRound } from '../voice/useVoiceRound';

const STATUS_TEXT = { correct: 'doğru', wrong: 'yanlış', passed: 'pas', pending: 'bekliyor', active: 'sırada' };

// The question block has a fixed height per mode, so neither its text nor the
// ring size can push the other around.
const QUESTION_H = { full: 144, compact: 96 };
// The big letter in front of the clue (Barlow Condensed, as the design's 120 px "İ").
const LETTER_SIZE = { full: 92, compact: 64 };
const GAP = 6;
const RING_MAX = 400;
const RING_MIN = 160;
const COMPACT_BELOW = 300;

// Ring size and question mode from the stage: the whole space between the top
// bar and the answer row. That space only changes with the window or the
// keyboard, never with what is drawn inside it, so there is no layout loop.
function stageLayout(w: number, h: number) {
  const compact = h - QUESTION_H.full - GAP < COMPACT_BELOW;
  const questionH = compact ? QUESTION_H.compact : QUESTION_H.full;
  const size = Math.max(RING_MIN, Math.min(w - GAP, h - questionH - 2 * GAP, RING_MAX));
  return { compact, questionH, size };
}

// The big letter in front of the clue.
function letterStyle(compact: boolean) {
  const size = LETTER_SIZE[compact ? 'compact' : 'full'];
  return {
    fontFamily: F.display, fontSize: size, lineHeight: size,
    color: C.text, textShadowColor: 'rgba(120,160,255,0.8)', textShadowRadius: 18,
    minWidth: Math.round(size * 0.55), textAlign: 'center' as const,
  };
}

function kindOf(l: RoundLetter, active: boolean): BubbleKind {
  if (l.status !== 'pending') return l.status;
  if (active) return 'active';
  return l.passed ? 'passed' : 'pending';
}

// The game, variant 1a "Klasik": the letter ring over the camera picture, the
// question below, the answer spoken (or typed in). Before the first voice
// game the mic check comes first.
export default function Game() {
  const { settings, ready: settingsReady, update } = useSettings();
  if (!settingsReady) return <Screen light="game"><View /></Screen>;
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
  return <GameRound voice={settings.voice} />;
}

function GameRound({ voice }: { voice: boolean }) {
  const params = useLocalSearchParams<{ cats?: string; level?: string; quick?: string; seed?: string }>();
  const level = Number(params.level) || 1;
  const quick = params.quick === '1';
  const cats = parseCats(params.cats);
  const { progress, ready, record } = useProgress();

  // The round is drawn once per visit.
  const [picked] = useState(() => pickQuestions(CATEGORIES, cats, level, params.seed ? seededRng(Number(params.seed)) : Math.random));
  const initial = useMemo(() => (picked ? createRound(picked) : null), [picked]);
  const locked = !!initial && ready && !quick && level > selectionUnlocked(progress, cats);

  const v = useVoiceRound(voice, { open: !!initial && ready && !locked });
  const onOver = useCallback(async (r: Round) => {
    v.onOver(r);
    const played = Array.from(new Set(r.letters.map((l) => l.category)));
    const before = selectionUnlocked(progress, played);
    let unlockedNext = false;
    if (!quick) {
      const after = await record(played, level, r.correct);
      unlockedNext = selectionUnlocked(after, played) > before;
    }
    setLastResult({ round: r, cats: played, catsParam: params.cats ?? '', level, quick, passed: r.correct >= PASS_MARK, unlockedNext });
    router.replace('/result');
  }, [progress, record, quick, level, params.cats, v.onOver]);

  const game = useRound(initial, onOver, v.onAnswer);
  useVoiceEffects(v, game);

  if (!initial || locked) {
    return (
      <Screen light="game">
        <View style={{ padding: 22, gap: 20 }}>
          <BackLink />
          <Text style={{ fontFamily: F.display, fontSize: 32, color: C.text }}>
            {locked ? 'Bu bölüm henüz kilitli' : 'Bu bölüm yakında'}
          </Text>
          <Text style={{ fontFamily: F.body, fontSize: 16, color: C.dim }}>
            {locked ? `Önceki bölümü en az ${PASS_MARK} doğruyla bitir.` : 'Soruları hazırlanıyor. Başka bir bölüm ya da kategori seç.'}
          </Text>
        </View>
      </Screen>
    );
  }

  return <GameView game={game} voice={v} />;
}

// `player`: whose turn it is in a pass-and-play match (app/match.tsx).
export function GameView({ game, voice, player }: { game: ReturnType<typeof useRound>; voice: ReturnType<typeof useVoiceRound>; player?: string }) {
  const { update } = useSettings();
  const { round, phase, reveal } = game;
  const r = round!;
  const { width } = useWindowDimensions();
  // The stage as last measured: the keyboard going up shrinks it, going down
  // gives the whole height back, so the ring, the camera square and the
  // question block return to the keyboard-down layout. 0 = not measured yet.
  const [stage, setStage] = useState({ w: width, h: 0 });
  const [text, setText] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const c = counts(r);
  const now = current(r);
  const shown = reveal?.letter ?? now;
  const live = phase === 'playing';
  // With the host reading, the clue and the active letter wait for the moment its reading starts.
  const clueShown = voice.clueShown(game.asked);

  // Clock ticks keep the same letters array, so the ring is not rebuilt on a tick.
  const items: RingItem[] = useMemo(() => r.letters.map((l, i) => {
    const kind = kindOf(l, live && clueShown && i === r.idx);
    const label = kind === 'active' ? 'sırada' : STATUS_TEXT[kind as keyof typeof STATUS_TEXT];
    return { label: l.letter, kind, testID: `letter-${l.letter}`, accessibilityLabel: `${l.letter} harfi, ${label}` };
  }), [r.letters, r.idx, live, clueShown]);

  const stageH = stage.h || 520;
  const { compact, questionH, size } = stageLayout(stage.w, stageH);
  const onStage = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setStage((s) => (s.w === w && s.h === h ? s : { w, h }));
  };

  const send = () => {
    if (!live || !text.trim()) return;
    game.submit(text);
    setText('');
  };
  const quit = () => {
    if (phase === 'over') return;
    Alert.alert('Oyundan çıkılsın mı?', 'Bu tur sayılmaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çık', style: 'destructive', onPress: () => (router.canGoBack() ? router.back() : router.replace('/menu')) },
    ]);
  };

  return (
    <Screen light="game" bottomInset={false}>
      <KeyboardAvoidingView testID="game-keyboard" style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* A tap anywhere off the answer field and the buttons puts the keyboard away. */}
        <Pressable testID="game-body" accessible={false} onPress={() => Keyboard.dismiss()} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Oyundan çık"
            onPress={quit}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text, fontSize: 16 }}>✕</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text testID="turn-player" numberOfLines={1} style={{ fontFamily: F.bodySemi, fontSize: 11, letterSpacing: 1.5, color: player ? C.accentSoft : C.dim }}>
              {player ? player.toLocaleUpperCase('tr-TR') : 'KALAN SÜRE'}
            </Text>
            <Text testID="clock" style={{ fontFamily: F.display, fontSize: 32, lineHeight: 34, fontVariant: ['tabular-nums'], color: r.timeLeft <= 10 ? C.redSoft : C.text }}>
              {formatClock(r.timeLeft)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            <Count n={c.correct} bg={C.green} fg="#fff" label="doğru" />
            <Count n={c.passed} bg={C.yellow} fg={C.yellowInk} label="pas" />
            <Count n={c.wrong} bg={C.red} fg="#fff" label="yanlış" />
          </View>
        </View>

        <View testID="stage" style={{ flex: 1, gap: GAP }} onLayout={onStage}>
        <View testID="ring-area" style={{ height: stageH - questionH - GAP, alignItems: 'center', justifyContent: 'center' }}>
          <Board items={items} size={size} />
        </View>

        <View testID="question" style={{ paddingHorizontal: 24, gap: compact ? 4 : 8, height: questionH, overflow: 'hidden' }}>
          {reveal ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Devam" onPress={game.skipReveal} testID="reveal" style={{ gap: 4 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.redSoft }}>YANLIŞ · {shown.letter}</Text>
              {!!reveal.said && <Text style={{ fontFamily: F.body, fontSize: 15, color: C.dim }}>Senin cevabın: {reveal.said}</Text>}
              <Text style={{ fontFamily: F.bodySemi, fontSize: compact ? 19 : 23, color: C.text }}>
                Doğru cevap: <Text style={{ fontFamily: F.bodyBold, color: C.greenSoft }}>{shown.question.answers[0]}</Text>
              </Text>
            </Pressable>
          ) : !clueShown ? (
            <View testID="clue-waiting" style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: compact ? 12 : 16 }}>
              {/* The big letter's place, empty until the host starts reading the clue. */}
              <Text style={[letterStyle(compact), { color: C.dim, textShadowRadius: 0 }]}>?</Text>
              <View style={{ flex: 1, gap: compact ? 4 : 8 }}>
                <Text style={{ fontFamily: F.bodySemi, fontSize: compact ? 19 : 23, lineHeight: compact ? 24 : 29, color: C.dim }}>
                  {game.asked === 0 ? 'Hazır olun…' : 'Sıradaki soru geliyor…'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: compact ? 12 : 16 }}>
              {/* The letter the answer starts with, large in front of the clue, as in the design. */}
              <Text
                testID="clue-letter"
                accessibilityLabel={`${now.letter} harfi`}
                style={letterStyle(compact)}
              >
                {now.letter}
              </Text>
              <View style={{ flex: 1, gap: compact ? 4 : 8 }}>
                <Text testID="prompt" style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.accentSoft }}>{promptLine(now)}</Text>
                <Text testID="clue" numberOfLines={compact ? 3 : 4} style={{ fontFamily: F.bodySemi, fontSize: compact ? 19 : 23, lineHeight: compact ? 24 : 29, color: C.text }}>
                  {now.question.clue}
                </Text>
              </View>
            </View>
          )}
        </View>
        </View>

        {voice.voice && live && (
          <View testID="voice-status" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingTop: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: voice.reading ? C.accentSoft : voice.mic === 'listening' ? C.greenSoft : C.redSoft }} />
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bodySemi, fontSize: 14, color: C.dim }}>
              {voiceStatus(voice)}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pas"
            testID="pass"
            disabled={!live}
            onPress={() => { game.pass(); setText(''); }}
            style={({ pressed }) => ({
              width: 76, height: 48, borderRadius: 24, borderWidth: 2, borderColor: C.yellow,
              alignItems: 'center', justifyContent: 'center', opacity: !live ? 0.4 : pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ fontFamily: F.display, fontSize: 20, letterSpacing: 1.2, color: C.yellow }}>PAS</Text>
          </Pressable>
          <TextInput
            ref={input}
            testID="answer"
            accessibilityLabel="Cevabın"
            value={text}
            onChangeText={setText}
            onSubmitEditing={send}
            editable={phase !== 'over'}
            autoFocus={!voice.voice}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="send"
            submitBehavior="submit"
            placeholder={voice.voice ? 'Söyle ya da yaz' : 'Cevabını yaz'}
            placeholderTextColor="#6f7899"
            keyboardAppearance="dark"
            style={{
              flex: 1, height: 48, borderRadius: 24, paddingHorizontal: 18,
              backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
              color: C.text, fontFamily: F.bodySemi, fontSize: 18,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gönder"
            testID="send"
            disabled={!live}
            onPress={send}
            style={({ pressed }) => ({
              width: 48, height: 48, borderRadius: 24, backgroundColor: C.accent,
              boxShadow: '0 0 0 6px rgba(61,107,255,0.22)', alignItems: 'center', justifyContent: 'center',
              opacity: !live ? 0.4 : pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontSize: 22, fontFamily: F.bodyBold }}>→</Text>
          </Pressable>
        </View>
        </Pressable>
      </KeyboardAvoidingView>

      {phase === 'ready' && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(5,7,18,0.82)', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 18 }}>
          <Text style={{ fontFamily: F.display, fontSize: 44, color: C.text }}>Hazır mısın?</Text>
          <Text style={{ fontFamily: F.body, fontSize: 16, color: C.soft, textAlign: 'center', lineHeight: 22 }}>
            28 harf, {formatClock(r.timeLeft)} süre. Bilmediğin harfe pas de, tur sonunda geri gelir.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.text }}>Sesli oyun</Text>
              <Text style={{ fontFamily: F.body, fontSize: 13, color: C.dim }}>
                {voice.voice ? 'Sunucu okur, sen söylersin. Yazmak da olur.' : 'Sorular ekranda, cevabı yazarsın.'}
              </Text>
            </View>
            <Switch accessibilityLabel="Sesli oyun" testID="voice-toggle" value={voice.voice} onValueChange={(on) => update({ voice: on })} />
          </View>
          <Button
            label="Başla"
            style={{ alignSelf: 'stretch' }}
            onPress={() => { game.start(); voice.begin(); if (!voice.voice) input.current?.focus(); }}
          />
        </View>
      )}
    </Screen>
  );
}

const VERDICT_TEXT = { correct: 'doğru', wrong: 'yanlış', pass: 'pas' } as const;
const capital = (s: string) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);

// What the mic heard is always shown: "Duydum: Merkür…" while it is being
// judged, then the verdict for a moment.
function voiceStatus(v: ReturnType<typeof useVoiceRound>): string {
  if (v.heard && (v.reading || v.mic === 'listening')) return `Duydum: ${capital(v.heard)}…`;
  if (v.judged) return `Duydum: ${capital(v.judged.text)} — ${VERDICT_TEXT[v.judged.verdict]}`;
  if (v.reading) return 'Sunucu okuyor… bildiysen hemen söyle';
  if (v.mic === 'denied') return 'Mikrofon kapalı. Cevabı yazabilirsin.';
  if (v.mic === 'error') return 'Mikrofon duymuyor. Cevabı yazabilirsin.';
  if (v.mic === 'listening') return 'Dinliyorum…';
  return 'Mikrofon açılıyor…';
}

// The camera square with the letter ring drawn over it, as on the show: the
// picture is as wide as the ring and the letters overlap it around the
// player's head. Memoised: a clock tick re-renders the screen but leaves this
// alone unless a letter or the size changed.
const Board = memo(function Board({ items, size }: { items: RingItem[]; size: number }) {
  return (
    <Ring testID="ring" items={items} size={size} bubble={Math.round(size * 0.079)} halo>
      <Face size={size} />
    </Ring>
  );
});

function Count({ n, bg, fg, label }: { n: number; bg: string; fg: string; label: string }) {
  return (
    <View accessibilityLabel={`${n} ${label}`} style={{ minWidth: 26, height: 26, paddingHorizontal: 4, borderRadius: 8, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontFamily: F.bodyBold, fontSize: 13 }}>{n}</Text>
    </View>
  );
}
