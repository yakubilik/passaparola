import type { Question } from '../data/questions';
import { trUpper } from '../game/normalize';

// What the host says. Every line has a key: a recording at
// assets/voice/<key>.mp3 plays when it exists, otherwise the text is read by
// the phone's own Turkish voice. The wording matches the recordings
// (tools/host-lines.json for host lines, tools/gen-app-voice.py for clues).

export type Line = { key?: string; text: string };

export const HOST_LINES = {
  welcome: 'Başarılar diliyorum.',
  ready: 'Hazır mısınız?',
  go: 'İşte sağ cepten sorular çıkıyor efendim.',
  correct1: 'Doğru.',
  correct2: 'Doğru efendim.',
  correct3: 'Doğru yanıt.',
  wrong: 'Değil, olmadı.',
  listen: 'Ne olur dikkatli dinleyin.',
  turn: 'Sizdeyim efendim.',
  time: 'Daha zamanımız var.',
  timeup: 'Süre doldu.',
  allcorrect: 'Bravo! Bütün harfleri bildiniz. Harfiyen!',
  end: 'Çok güzel bir yarış. Tebrik ediyorum.',
  win: 'Bravo!',
  // Pass and play: the turn goes to the next player after a Pas or a wrong answer.
  pass_next: 'Pas geçildi. Sıradaki yarışmacıya geçiyoruz.',
  wrong_next: 'Hayır, olmadı. Sıradaki yarışmacıya geçiyoruz.',
} as const;

export type HostKey = keyof typeof HOST_LINES;

// Letter names as said aloud, so "B ile başlıyor" is read "Be ile başlıyor".
const NAMES: Record<string, string> = {
  A: 'a', B: 'be', C: 'ce', Ç: 'çe', D: 'de', E: 'e', F: 'fe', G: 'ge', H: 'he', I: 'ı', İ: 'i', J: 'je', K: 'ke',
  L: 'le', M: 'me', N: 'ne', O: 'o', Ö: 'ö', P: 'pe', R: 're', S: 'se', Ş: 'şe', T: 'te', U: 'u', Ü: 'ü', V: 've',
  Y: 'ye', Z: 'ze',
};

export function host(key: HostKey): Line {
  return { key, text: HOST_LINES[key] };
}

export function clueLine(q: Question): Line {
  const name = NAMES[q.letter] ?? q.letter;
  const tail = q.type === 'contains' ? `İçinde ${name} var.` : `${trUpper(name[0])}${name.slice(1)} ile başlıyor.`;
  return { key: q.id, text: `${q.clue.replace(/\.$/, '')}... ${tail}` };
}

// After a wrong answer: "<answer> olacaktı."
export function answerLine(q: Question): Line {
  return { key: `${q.id}-cevap`, text: `${q.answers[0]} olacaktı.` };
}
