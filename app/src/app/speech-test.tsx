import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { C, F } from '../ui/theme';
import { prepareAudio } from '../voice/engine';
import { DEFAULT_PROBE, latency, PROBE_WORDS, runProbe, summary, type ProbeConfig, type ProbeState, type TaskHint } from '../voice/probe';
import { supportsOnDevice } from '../voice/recognizer';

// Ses tanıma testi: a debug screen, reached by a long press on "Mikrofonu
// dene" in Ayarlar. Ten words, each in its own request as in the game; every
// result as it comes with its time, the mode Apple was asked for, and how
// long after the end of each word it was recognised (see voice/probe.ts).
const HINTS: TaskHint[] = ['search', 'confirmation', 'dictation', 'unspecified'];

const ms = (x: number | null) => (x == null ? '—' : `${x} ms`);

export default function SpeechTest() {
  const [config, setConfig] = useState<ProbeConfig>(DEFAULT_PROBE);
  const [state, setState] = useState<ProbeState | null>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const running = !!state?.running;
  const supports = state?.supportsOnDevice ?? supportsOnDevice();
  const mode = state?.mode ?? (config.onDevice && supports ? 'on-device' : 'server');
  const word = state?.running ? state.words[state.index]?.word : null;
  const sum = state ? summary(state.words) : null;

  const start = () => {
    stop.current?.();
    let gone = false;
    let cancel: (() => void) | null = null;
    stop.current = () => { gone = true; cancel?.(); };
    prepareAudio().then(() => { if (!gone) cancel = runProbe(config, setState); });
  };

  return (
    <Screen light="none">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24, gap: 14 }}>
        <BackLink />
        <Text style={{ fontFamily: F.display, fontSize: 32, color: C.text, lineHeight: 36 }}>Ses tanıma testi</Text>

        <View style={{ borderRadius: 16, padding: 14, gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
          <Text testID="probe-mode" style={{ fontFamily: F.bodyBold, fontSize: 16, color: C.text }}>
            Etkin mod: {mode === 'on-device' ? 'cihaz üstü' : 'sunucu (Apple)'}
          </Text>
          <Text testID="probe-supports" style={{ fontFamily: F.body, fontSize: 13, color: C.dim, lineHeight: 18 }}>
            Cihaz üstü tanıma bu iPhone'da {supports ? 'var' : 'yok'} (Apple bunu telefonun dili için söyler).
          </Text>
          <Row label="Cihaz üstü iste">
            <Switch testID="probe-ondevice" value={config.onDevice} disabled={running}
              onValueChange={(onDevice) => setConfig({ ...config, onDevice })} trackColor={{ true: C.accent, false: '#2a3256' }} />
          </Row>
          <Row label="Yankı engelleme">
            <Switch testID="probe-vp" value={config.voiceProcessing} disabled={running}
              onValueChange={(voiceProcessing) => setConfig({ ...config, voiceProcessing })} trackColor={{ true: C.accent, false: '#2a3256' }} />
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {HINTS.map((h) => (
              <Pressable key={h} testID={`probe-hint-${h}`} accessibilityRole="button" accessibilityState={{ selected: config.taskHint === h, disabled: running }}
                disabled={running} onPress={() => setConfig({ ...config, taskHint: h })}
                style={{ paddingHorizontal: 10, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: config.taskHint === h ? C.accent : '#2a3256' }}>
                <Text style={{ fontFamily: F.bodySemi, fontSize: 13, color: C.text }}>{h}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 2, minHeight: 64, justifyContent: 'center' }}>
          {word ? (
            <>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.6, color: C.accentSoft }}>
                SÖYLE · {state!.index + 1} / {state!.words.length}
              </Text>
              <Text testID="probe-word" style={{ fontFamily: F.display, fontSize: 40, lineHeight: 44, color: C.text }}>{word}</Text>
            </>
          ) : (
            <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, textAlign: 'center' }}>
              {state?.error ?? `Sırayla ${PROBE_WORDS.length} kelime gösterilir; her birini bir kez, normal sesle söyle.`}
            </Text>
          )}
        </View>

        <Button testID="probe-start" label={running ? 'Durdur' : state ? 'Tekrar başlat' : 'Testi başlat'}
          onPress={running ? () => { stop.current?.(); stop.current = null; } : start} />

        {state && sum && (
          <View style={{ borderRadius: 16, padding: 12, gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
            <Text testID="probe-summary" style={{ fontFamily: F.bodyBold, fontSize: 14, color: C.text, lineHeight: 20 }}>
              Doğru {sum.hits}/{state.words.length} · konuşma sonu → doğru sonuç {ms(sum.match)} · → son sonuç {ms(sum.final)} · açılış {ms(sum.open)} (ortanca)
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['Kelime', 'Duyulan', 'Doğru', 'Son', 'Açılış'].map((h, i) => (
                <Text key={h} style={[cell(i), { fontFamily: F.bodyBold, color: C.dim }]}>{h}</Text>
              ))}
            </View>
            {state.words.map((w, i) => {
              const l = latency(w);
              return (
                <View key={w.word} testID={`probe-row-${i}`} style={{ flexDirection: 'row', gap: 6 }}>
                  <Text style={[cell(0), { color: C.text }]}>{w.word}</Text>
                  <Text style={[cell(1), { color: w.ok ? C.greenSoft : w.heard ? C.redSoft : C.dim }]} numberOfLines={1}>{w.heard || '—'}</Text>
                  <Text style={[cell(2), { color: C.text }]}>{ms(l.match)}</Text>
                  <Text style={[cell(3), { color: C.text }]}>{ms(l.final)}{w.forced ? '*' : ''}</Text>
                  <Text style={[cell(4), { color: C.text }]}>{ms(w.openMs)}</Text>
                </View>
              );
            })}
            <Text style={{ fontFamily: F.body, fontSize: 11, color: C.dim, lineHeight: 15 }}>
              Süreler Apple'ın son sonuçta verdiği kelime bitişinden itibaren. * son sonuç ancak istek durdurulunca geldi.
            </Text>
          </View>
        )}

        {state && (
          <View testID="probe-log" style={{ borderRadius: 16, padding: 12, gap: 2, backgroundColor: '#0d1127', borderWidth: 1, borderColor: C.cardBorder }}>
            {state.log.slice(-40).map((line, i) => (
              <Text key={i} style={{ fontFamily: F.body, fontSize: 12, color: C.soft, fontVariant: ['tabular-nums'] }}>
                {`+${(line.at / 1000).toFixed(2)} s  ${line.text}`}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: F.bodySemi, fontSize: 14, color: C.soft }}>{label}</Text>
      {children}
    </View>
  );
}

const WIDTHS = [2.2, 3, 1.6, 1.6, 1.6];
const cell = (i: number) => ({ flex: WIDTHS[i], fontFamily: F.body, fontSize: 12, fontVariant: ['tabular-nums' as const] });
