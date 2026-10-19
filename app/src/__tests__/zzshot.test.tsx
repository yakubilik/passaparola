import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderRouter, screen } from 'expo-router/testing-library';

import { SETTINGS_KEY } from '../store/settings';

declare const require: any;
const fs = jest.requireActual<any>('fs');
jest.setTimeout(120_000);

const css = (st: any): string => {
  const s = Object.assign({}, ...[st].flat(Infinity).filter(Boolean));
  const out: string[] = [];
  for (const [k, v] of Object.entries(s)) {
    if (v == null || typeof v === 'object') continue;
    let key = k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
    let val: any = typeof v === 'number' && !['opacity', 'flex', 'font-weight', 'z-index'].includes(key) ? `${v}px` : v;
    if (key === 'padding-horizontal') { out.push(`padding-left:${val};padding-right:${val}`); continue; }
    if (key === 'padding-vertical') { out.push(`padding-top:${val};padding-bottom:${val}`); continue; }
    if (key === 'margin-horizontal') { out.push(`margin-left:${val};margin-right:${val}`); continue; }
    if (key === 'font-family') { val = /Condensed/.test(String(v)) ? "'Barlow Condensed'" : "'Barlow'"; out.push(`font-weight:${/800|Extra/.test(String(v)) ? 800 : /700|Bold/.test(String(v)) ? 700 : /600|Semi/.test(String(v)) ? 600 : 500}`); }
    if (key === 'flex') { out.push(`flex:${v} 1 0%`); continue; }
    if (key === 'border-width') { out.push(`border-style:solid`); }
    out.push(`${key}:${val}`);
  }
  return out.join(';');
};
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function html(n: any, inText = false): string {
  if (n == null) return '';
  if (typeof n === 'string' || typeof n === 'number') return esc(String(n));
  if (Array.isArray(n)) return n.map((c) => html(c, inText)).join('');
  const kids = html(n.children, inText || n.type === 'Text');
  if (n.type === 'Text') return `<span style="${inText ? '' : 'display:block;'}${css(n.props.style)}">${kids}</span>`;
  if (n.type === 'RCTSwitch') {
    const on = n.props.value;
    return `<div style="width:51px;height:31px;border-radius:16px;background:${on ? '#3d6bff' : '#2a3256'};position:relative;flex-shrink:0"><div style="position:absolute;top:2px;${on ? 'right' : 'left'}:2px;width:27px;height:27px;border-radius:14px;background:#fff"></div></div>`;
  }
  return `<div style="display:flex;flex-direction:column;position:relative;box-sizing:border-box;${css(n.props.style)}">${kids}</div>`;
}
async function shot(url: string, marker: string, file: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await screen.findAllByText(marker);
  await act(async () => {});
  const body = html(screen.toJSON());
  fs.writeFileSync(`/tmp/shot355/${file}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:'Barlow';font-weight:500;src:url(file:///Users/dilarakilic/projects/passaparola/app/node_modules/@expo-google-fonts/barlow/500Medium/Barlow_500Medium.ttf)}@font-face{font-family:'Barlow';font-weight:600;src:url(file:///Users/dilarakilic/projects/passaparola/app/node_modules/@expo-google-fonts/barlow/600SemiBold/Barlow_600SemiBold.ttf)}@font-face{font-family:'Barlow';font-weight:700;src:url(file:///Users/dilarakilic/projects/passaparola/app/node_modules/@expo-google-fonts/barlow/700Bold/Barlow_700Bold.ttf)}@font-face{font-family:'Barlow Condensed';font-weight:700;src:url(file:///Users/dilarakilic/projects/passaparola/app/node_modules/@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf)}@font-face{font-family:'Barlow Condensed';font-weight:800;src:url(file:///Users/dilarakilic/projects/passaparola/app/node_modules/@expo-google-fonts/barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf)}body{margin:0;background:#0a0d1f;width:390px;min-height:844px;padding-top:54px;box-sizing:border-box}</style></head><body>${body}</body></html>`);
}

test('shots', async () => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: true, micChecked: true, volume: 70 }));
  await shot('/settings', 'Ayarlar', 'ayarlar');
  (globalThis as any).expo = (globalThis as any).expo ?? {};
  (globalThis as any).expo.modules = { ...((globalThis as any).expo.modules ?? {}), AudioSessionInfo: { get: () => ({
    category: 'AVAudioSessionCategoryPlayAndRecord', mode: 'AVAudioSessionModeDefault', categoryOptions: 0x1 | 0x4 | 0x8,
    outputs: ['Speaker (Hoparlör)'], inputs: ['MicrophoneBuiltIn (iPhone Mikrofonu)'], outputVolume: 0.375, sampleRate: 48000, otherAudioPlaying: false,
  }) } };
  await shot('/mic', 'Sesli cevap verelim', 'mikrofon');
});
