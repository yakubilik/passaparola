import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { listener, prepareAudio } from '../voice/engine';
import { testMic, type MicTest } from '../voice/recognizer';
import { Button } from './Button';
import { C, F } from './theme';

// The mic check before the first voice game: the player says something and
// sees what was heard, or why nothing was (permission off, Siri and
// Dictation off, no Turkish recognition, silence).
export function MicCheck({ onDone, onTypeInstead }: { onDone: () => void; onTypeInstead: () => void }) {
  const [test, setTest] = useState<MicTest | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const run = () => {
    cancel.current?.();
    setTest({ state: 'listening', text: '' });
    // The round's audio session is set up only now, on the player's tap.
    let stop: (() => void) | null = null;
    let gone = false;
    cancel.current = () => { gone = true; stop?.(); };
    // A game's mic still closing (it waits for silence) gives the recognizer up now.
    listener.release();
    prepareAudio().then(() => { if (!gone) stop = testMic(setTest); });
  };
  const busy = test?.state === 'listening' || test?.state === 'hearing';

  return (
    <View style={{ flex: 1, padding: 24, gap: 18, justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.9, color: C.accentSoft }}>MİKROFON DENEMESİ</Text>
      <Text style={{ fontFamily: F.display, fontSize: 36, lineHeight: 40, color: C.text }}>Sesli cevap verelim</Text>
      <Text style={{ fontFamily: F.body, fontSize: 16, lineHeight: 22, color: C.soft }}>
        Sunucu soruları okur, sen cevabı söylersin. Önce mikrofonu deneyelim: düğmeye bas ve “Ankara” de.
      </Text>

      <View
        testID="mic-result"
        style={{ minHeight: 96, borderRadius: 18, padding: 16, gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, justifyContent: 'center' }}
      >
        {!test && <Text style={{ fontFamily: F.body, fontSize: 15, color: C.dim }}>Henüz denemedin.</Text>}
        {test?.state === 'listening' && <Text style={{ fontFamily: F.bodySemi, fontSize: 17, color: C.accentSoft }}>Dinliyorum… bir şey söyle.</Text>}
        {(test?.state === 'hearing' || test?.state === 'ok') && (
          <>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.5, color: C.greenSoft }}>
              {test.state === 'ok' ? 'DUYDUM' : 'DUYUYORUM'}
            </Text>
            <Text style={{ fontFamily: F.bodySemi, fontSize: 22, color: C.text }}>“{test.text}”</Text>
          </>
        )}
        {test?.state === 'error' && (
          <>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 12, letterSpacing: 1.5, color: C.redSoft }}>DUYAMADIM</Text>
            <Text style={{ fontFamily: F.bodySemi, fontSize: 16, lineHeight: 22, color: C.text }}>{test.text}</Text>
          </>
        )}
      </View>

      <Button label={busy ? 'Dinliyorum…' : test ? 'Tekrar dene' : 'Mikrofonu dene'} disabled={busy} onPress={run} />
      <Button kind="ghost" label={test?.state === 'ok' ? 'Oyuna geç' : 'Denemeden geç'} onPress={() => { cancel.current?.(); onDone(); }} />
      <Button kind="ghost" label="Sesi kapat, yazarak oyna" onPress={() => { cancel.current?.(); onTypeInstead(); }} />
    </View>
  );
}
