// Harfiyen's TV-studio look (docs/design/harfiyen/harfiyen-mobil.html).
export const C = {
  bg: '#0a0d1f',
  card: '#141a33',
  cardBorder: 'rgba(255,255,255,0.07)',
  tabBar: '#0d1127',
  text: '#f3f4f8',
  dim: '#9aa3c0',
  soft: '#c3c9e0',
  accent: '#3d6bff',
  accentSoft: '#8fa8ff',
  green: '#22b45e',
  yellow: '#f2bd2c',
  yellowInk: '#1a1400',
  red: '#e5484d',
  redSoft: '#ff7a7e',
  greenSoft: '#4fd889',
};

export const F = {
  body: 'Barlow_500Medium',
  bodySemi: 'Barlow_600SemiBold',
  bodyBold: 'Barlow_700Bold',
  display: 'BarlowCondensed_800ExtraBold',
  displayBold: 'BarlowCondensed_700Bold',
};

// Spotlight from above, as on every screen of the design.
export function spotlight(strength: 'game' | 'menu' | 'intro' = 'game'): string {
  const at = { game: '90% 42% at 50% 0%', menu: '90% 35% at 50% 0%', intro: '90% 50% at 50% 30%' }[strength];
  const color = strength === 'menu' ? '#1c2766' : '#22307a';
  return `radial-gradient(${at}, ${color} 0%, rgba(10,13,31,0) 72%)`;
}

export type BubbleKind = 'pending' | 'correct' | 'wrong' | 'passed' | 'active' | 'locked' | 'soon';

// Letter (and level) bubble colours: background, ink, glow.
export const BUBBLE: Record<BubbleKind, { bg: string; fg: string; glow: string }> = {
  pending: { bg: '#3a5ef0', fg: '#ffffff', glow: '0 2px 8px rgba(20,40,160,0.5)' },
  correct: { bg: C.green, fg: '#ffffff', glow: '0 0 14px rgba(34,180,94,0.45)' },
  passed: { bg: C.yellow, fg: C.yellowInk, glow: '0 0 14px rgba(242,189,44,0.45)' },
  wrong: { bg: C.red, fg: '#ffffff', glow: '0 0 14px rgba(229,72,77,0.45)' },
  active: { bg: '#ffffff', fg: C.bg, glow: '0 0 0 4px rgba(255,255,255,0.25), 0 0 26px rgba(160,190,255,0.95)' },
  locked: { bg: '#1d2546', fg: '#8d96bb', glow: '0 0 0 0 transparent' },
  soon: { bg: '#141a33', fg: '#5c6587', glow: '0 0 0 0 transparent' },
};

export const PENDING_GRADIENT = 'linear-gradient(180deg, #4f78ff, #2643d1)';
