import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { listener } from '../voice/engine';
import { RECOGNITION_OPTIONS } from '../voice/recognizer';
import { readAudioSession, type SessionInfo } from '../voice/sessionInfo';
import { masterGain } from '../voice/sounds';
import { C, F } from './theme';

const REFRESH_MS = 500;
const pct = (v: number) => `%${Math.round(v * 100)}`;

// The iOS audio session right now, for a screenshot when the game sounds
// wrong: category and options, mode, where the sound goes, the phone's volume
// (it moves with the volume buttons) and the game's own Ses level.
export function AudioDiagnostic() {
  const [info, setInfo] = useState<SessionInfo | null>(() => readAudioSession());
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => { setInfo(readAudioSession()); setTick((n) => n + 1); }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const rows: [string, string][] = info
    ? [
      ['Kategori', `${info.category}${info.options.length ? ` (${info.options.join(', ')})` : ''}`],
      ['Mod', info.mode],
      ['Çıkış', info.outputs.join(', ') || '-'],
      ['Mikrofon', info.inputs.join(', ') || '-'],
      ['Telefon sesi', pct(info.outputVolume)],
      ['Oyun sesi', pct(masterGain())],
      ['Oyun mikrofonu', `${listener.listening ? 'açık' : 'kapalı'}, yankı önleme ${RECOGNITION_OPTIONS.iosVoiceProcessingEnabled ? 'açık' : 'kapalı'}`],
    ]
    : [['Ses oturumu', 'bu sürümde okunamıyor'], ['Oyun sesi', pct(masterGain())]];

  return (
    <View testID="audio-diagnostic" style={{ borderRadius: 14, padding: 12, gap: 3, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder }}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.5, color: C.dim }}>SES OTURUMU</Text>
      {rows.map(([k, v]) => (
        <Text key={k} testID={`diag-${k}`} style={{ fontFamily: F.body, fontSize: 12, lineHeight: 16, color: C.soft }}>
          <Text style={{ fontFamily: F.bodySemi, color: C.text }}>{k}: </Text>{v}
        </Text>
      ))}
    </View>
  );
}
