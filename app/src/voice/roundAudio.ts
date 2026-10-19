import { lastStartOptions, readVoiceProcessing, type VoiceProcessingInfo } from './recognizer';
import { readAudioSession, type SessionInfo } from './sessionInfo';

// The audio as each round found it once its mic was up and settled: the iOS
// session, the recognizer engine's voice processing and ducking, and what the
// recognizer was started with. Shown per round under SES OTURUMU (the result
// screen and the mic check), so round 1 and round 2 can be compared on a
// screenshot when the sound changes between them.

export type RoundAudio = {
  /** 1 for the first round since the app started. */
  round: number;
  session: SessionInfo | null;
  vp: VoiceProcessingInfo | null;
  /** The recognizer's voice processing and session category as asked for at its start. */
  asked: { voiceProcessing: boolean; category: unknown } | null;
};

const MAX = 6;
const rounds: RoundAudio[] = [];
let count = 0;

/** Called once per round, when its mic is up and settled (useVoiceRound). */
export function noteRoundAudio(): RoundAudio {
  const start = lastStartOptions();
  const entry: RoundAudio = {
    round: ++count,
    session: readAudioSession(),
    vp: readVoiceProcessing(),
    asked: start ? { voiceProcessing: start.iosVoiceProcessingEnabled, category: start.iosCategory } : null,
  };
  rounds.push(entry);
  if (rounds.length > MAX) rounds.shift();
  return entry;
}

/** The last rounds, oldest first. */
export function roundAudio(): readonly RoundAudio[] {
  return rounds;
}

const pct = (v: number) => `%${Math.round(v * 100)}`;
const onOff = (b: boolean) => (b ? 'açık' : 'kapalı');

/** One line for a round: category (options), mode, phone volume, voice processing, ducking. */
export function roundLine(r: RoundAudio): string {
  const s = r.session;
  const session = s
    ? `${s.category}${s.options.length ? ` (${s.options.join(', ')})` : ''}, mod ${s.mode}, telefon sesi ${pct(s.outputVolume)}`
    : 'oturum okunamıyor';
  const vp = r.vp
    ? `yankı önleme ${onOff(r.vp.enabled)}${r.vp.running ? '' : ' (motor durmuş)'}, kısma ${r.vp.duckingLevel == null ? '-' : `${r.vp.duckingLevel}${r.vp.advancedDucking ? ' gelişmiş' : ''}`}${r.vp.rebuilds ? `, yeniden kurulum ${r.vp.rebuilds}` : ''}`
    : `yankı önleme ${r.asked ? `${onOff(r.asked.voiceProcessing)} istendi` : '-'}, motor okunamıyor`;
  return `${session}; ${vp}`;
}
