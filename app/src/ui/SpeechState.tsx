import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { host } from '../voice/engine';
import type { SpeechEvent } from '../voice/host';
import { C, F } from './theme';

const SAID: Record<SpeechEvent['state'], string> = {
  asked: 'istendi',
  started: 'başladı',
  done: 'bitti',
  stopped: 'kesildi',
  error: 'hata',
  nostart: 'başlamadı',
  silent: 'SESSİZ',
};

/** One line on what the phone voice did, e.g. "TELEFON SESİ · tarih-2-A-1: başladı (1. deneme) · başlayan 3 · sessiz 0". */
export function speechStateLine(log: readonly SpeechEvent[]): string {
  const last = log[log.length - 1];
  if (!last) return 'TELEFON SESİ · henüz okunmadı';
  const started = log.filter((e) => e.state === 'started').length;
  const silent = log.filter((e) => e.state === 'silent').length;
  return `TELEFON SESİ · ${last.key ?? last.text}: ${SAID[last.state]} (${last.attempt}. deneme) · başlayan ${started} · sessiz ${silent}`;
}

// The speech-state diagnostic (#362), on the game screen of the speech
// self-test: whether the phone voice really started reading the clue.
export function SpeechState() {
  const [line, setLine] = useState(() => speechStateLine(host.speechLog));
  useEffect(() => {
    host.onSpeech = () => setLine(speechStateLine(host.speechLog));
    return () => { host.onSpeech = () => {}; };
  }, []);
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 6 }}>
      <Text testID="speech-state" style={{ fontFamily: F.bodySemi, fontSize: 13, color: C.accentSoft }}>{line}</Text>
    </View>
  );
}
