import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { EMPTY_PROGRESS, PROGRESS_KEY, recordRound } from '../store/progress';
import { SETTINGS_KEY } from '../store/settings';

// Node's fs, typed here: the app has no Node type definitions.
declare const __dirname: string;
const { readdirSync, readFileSync, statSync } = jest.requireActual<{
  readdirSync: (dir: string) => string[];
  readFileSync: (file: string, enc: 'utf8') => string;
  statSync: (path: string) => { isDirectory: () => boolean };
}>('fs');
const join = (...parts: string[]) => parts.join('/');

// No accounts, no rooms, no network: everything the app keeps stays on the phone.
jest.mock('../data/questions', () =>
  require('../test-utils/mockQuestions').mockQuestions({ tarih: [1, 2], spor: [1], cografya: [], bilim: [], sanat: [] }),
);

jest.setTimeout(600_000);  // room for a loaded machine (the full suite runs its files in parallel)

// What would suggest an account or online play.
const ACCOUNT = /apple|google|giriş|misafir|hesap|profil|oda|kodunu|günün turu|login|sign.?in/i;

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ voice: false, micChecked: true }));
});

function expectNoAccountText() {
  expect(screen.queryAllByText(ACCOUNT)).toEqual([]);
  expect(screen.queryAllByLabelText(ACCOUNT)).toEqual([]);
}

test.each([
  ['/', 'HARFİYEN'],
  ['/menu', 'Hızlı oyun'],
  ['/settings', 'Ayarlar'],
  ['/category', 'Kategori seç'],
  ['/levels?cats=tarih', 'BÖLÜM HARİTASI'],
  ['/multi', 'Çok oyunculu'],
  ['/game?cats=tarih&level=1', 'Hazır mısın?'],
])('%s shows nothing about accounts, rooms or signing in', async (url, marker) => {
  await renderRouter('./src/app', { initialUrl: url });
  expect((await screen.findAllByText(marker)).length).toBeGreaterThan(0);
  expectNoAccountText();
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'test-utils' ? [] : sources(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

test('no account words and no network calls anywhere in the app source', () => {
  const files = sources(join(__dirname, '..'));
  expect(files.length).toBeGreaterThan(10);
  for (const f of files) {
    // The font packages are named after Google Fonts; that is a file on the phone, not a login.
    const text = readFileSync(f, 'utf8').replace(/@expo-google-fonts\/[\w-]+/g, '');
    expect([f, text.match(/apple|google|misafir|login|sign.?in|giriş|hesapla/i)?.[0]]).toEqual([f, undefined]);
    expect([f, text.match(/\bfetch\(|XMLHttpRequest|WebSocket|axios|https?:\/\//)?.[0]]).toEqual([f, undefined]);
  }
});

test('intro: one Başla straight to the menu', async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByTestId('intro-start')).toHaveTextContent('Başla');
  await fireEvent.press(screen.getByTestId('intro-start'));
  expect(await screen.findByText('Hızlı oyun')).toBeOnTheScreen();
});

test('menu: single player, multiplayer and Ayarlar; the bottom bar has only working tabs', async () => {
  await renderRouter('./src/app', { initialUrl: '/menu' });
  expect(await screen.findByText('KARİYER · TEK OYUNCU')).toBeOnTheScreen();
  expect(screen.getByText('Çok oyunculu')).toBeOnTheScreen();
  expect(screen.queryByText('Odaya katıl')).toBeNull();
  expect(screen.queryByText('GÜNÜN TURU')).toBeNull();
  expect(screen.queryByText('Profil')).toBeNull();
  expect(screen.queryByText('YAKINDA')).toBeNull();
  expect(screen.getAllByRole('tab').map((t) => t.props.children)).toHaveLength(3);
  for (const tab of ['Ana sayfa', 'Kategoriler', 'Ayarlar']) expect(screen.getByRole('tab', { name: tab })).toBeOnTheScreen();

  // Tek oyunculu: category → level map.
  await fireEvent.press(screen.getByText('Başla'));
  await fireEvent.press(await screen.findByTestId('cat-tarih'));
  await fireEvent.press(screen.getByText('Bölümlere git'));
  expect(await screen.findByText('BÖLÜM HARİTASI')).toBeOnTheScreen();
});

test.each(['Kategoriler', 'Ayarlar'])('tab %s opens its screen', async (tab) => {
  await renderRouter('./src/app', { initialUrl: '/menu' });
  await fireEvent.press(await screen.findByText(tab));
  expect(await screen.findByText(tab === 'Ayarlar' ? 'İlerlemeyi sıfırla' : 'Kategori seç')).toBeOnTheScreen();
});

test('menu: Çok oyunculu opens the one-phone setup', async () => {
  await renderRouter('./src/app', { initialUrl: '/menu' });
  await fireEvent.press(await screen.findByTestId('menu-multi'));
  expect(await screen.findByText(/2–4 kişi|Oyuncu/)).toBeOnTheScreen();
});

test('progress and settings survive an app restart', async () => {
  // First run: a setting changed in Ayarlar, a level passed.
  await renderRouter('./src/app', { initialUrl: '/settings' });
  await fireEvent(await screen.findByTestId('setting-music'), 'valueChange', false);
  await act(async () => {});
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(recordRound(EMPTY_PROGRESS, ['tarih'], 1, 21)));

  // A fresh app over the same storage.
  await renderRouter('./src/app', { initialUrl: '/levels?cats=tarih' });
  expect(await screen.findByLabelText('Bölüm 2, açık')).toBeEnabled();
  expect(screen.getByText('Kolay · En iyi: 21 / 28')).toBeOnTheScreen();
  await renderRouter('./src/app', { initialUrl: '/settings' });
  expect((await screen.findByTestId('setting-music')).props.value).toBe(false);
});

test('Ayarlar: İlerlemeyi sıfırla asks first, Vazgeç keeps everything, Sıfırla clears it for good', async () => {
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(recordRound(EMPTY_PROGRESS, ['tarih'], 1, 21)));
  await renderRouter('./src/app', { initialUrl: '/menu' });
  expect(await screen.findByText('Bölüm 2')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Ayarlar'));

  await fireEvent.press(await screen.findByText('İlerlemeyi sıfırla'));
  expect(screen.getByText(/Emin misin\?/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('reset-cancel'));
  expect(screen.queryByText(/Emin misin\?/)).toBeNull();
  expect(await AsyncStorage.getItem(PROGRESS_KEY)).not.toBeNull();

  await fireEvent.press(screen.getByText('İlerlemeyi sıfırla'));
  await fireEvent.press(screen.getByTestId('reset-confirm'));
  await act(async () => {});
  expect(await AsyncStorage.getItem(PROGRESS_KEY)).toBeNull();
  expect(screen.getByText(/İlerleme sıfırlandı/)).toBeOnTheScreen();
  // Settings are kept.
  expect(JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY))!)).toMatchObject({ voice: false });

  await fireEvent.press(screen.getByText('‹ Geri'));
  expect(await screen.findByText('Bölüm 1')).toBeOnTheScreen();
  expect(screen.getByText('Kategorini seç, ilk bölümden başla')).toBeOnTheScreen();

  // And after a restart too.
  await renderRouter('./src/app', { initialUrl: '/levels?cats=tarih' });
  expect(await screen.findByLabelText('Bölüm 2, kilitli')).toBeDisabled();
});
