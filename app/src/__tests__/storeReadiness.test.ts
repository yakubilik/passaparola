// App Store readiness: app.json, the store texts and privacy page in docs/store/, and the
// screenshots. Plain file checks, no rendering.

// Node's fs, typed here: the app has no Node type definitions.
declare const __dirname: string;
type Buf = { length: number; readUInt32BE: (at: number) => number; [i: number]: number; toString: (enc: 'ascii', from: number, to: number) => string };
const { existsSync, readdirSync, readFileSync } = jest.requireActual<{
  existsSync: (path: string) => boolean;
  readdirSync: (dir: string) => string[];
  readFileSync: ((file: string, enc: 'utf8') => string) & ((file: string) => Buf);
}>('fs');
const join = (...parts: string[]) => parts.join('/');

const APP = join(__dirname, '..', '..');
const STORE = join(APP, '..', 'docs', 'store');
const config = JSON.parse(readFileSync(join(APP, 'app.json'), 'utf8')).expo;

/** Width, height and whether the PNG has an alpha channel, from its IHDR chunk. */
function png(file: string) {
  const b = readFileSync(file);
  expect(b.toString('ascii', 12, 16)).toBe('IHDR');
  const colorType = b[25];
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 };
}

/** One "## Heading" section of a markdown file, trimmed. */
function section(md: string, heading: string): string {
  const parts = md.split(/^## /m);
  const hit = parts.find((p) => p.startsWith(`${heading}\n`));
  if (!hit) throw new Error(`no "## ${heading}" section`);
  return hit.slice(heading.length + 1).trim();
}

// Turkish letters that only a Turkish sentence would carry.
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
// Names Harfiyen must never use in the store: the TV formats it resembles, their channels and presenters.
const TRADEMARKS = /passaparola|kelime av[ıi]|kelime oyunu|ali ihsan|varol|show tv|kanal d|atv|star tv|trt|fox tv|tv8|lingo|wheel of fortune|çarkıfelek/i;

describe('app.json is store-ready', () => {
  const ios = config.ios;
  const plist = ios.infoPlist;

  it('is version 1.0.0 with a numeric build number the release lane bumps', () => {
    expect(config.version).toBe('1.0.0');
    expect(ios.buildNumber).toMatch(/^\d+$/);
    const fastfile = readFileSync(join(APP, 'fastlane', 'Fastfile'), 'utf8');
    expect(fastfile).toMatch(/latest_testflight_build_number/);
    expect(fastfile).toMatch(/CFBundleVersion/);
  });

  it('is iPhone-only, with the right bundle id and no export-compliance question', () => {
    expect(ios.bundleIdentifier).toBe('com.skolalabs.harfiyen');
    expect(ios.supportsTablet).toBe(false);
    expect(plist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it.each(['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription'])(
    '%s is a Turkish sentence that names Harfiyen',
    (key) => {
      const text: string = plist[key];
      expect(text).toMatch(TURKISH);
      expect(text).toMatch(/Harfiyen/);
      expect(text).not.toMatch(/\b(the|your|you)\b/i);
    },
  );

  it('says the camera picture stays on the phone and the voice is not kept', () => {
    expect(plist.NSCameraUsageDescription).toMatch(/gönderilmez/);
    expect(plist.NSMicrophoneUsageDescription).toMatch(/saklanmaz/);
    expect(plist.NSSpeechRecognitionUsageDescription).toMatch(/Apple/);
  });

  it('gives the config plugins the same strings, so prebuild cannot overwrite them', () => {
    const opts = (name: string) => config.plugins.find((p: unknown) => Array.isArray(p) && p[0] === name)[1];
    expect(opts('expo-audio').microphonePermission).toBe(plist.NSMicrophoneUsageDescription);
    expect(opts('expo-speech-recognition').microphonePermission).toBe(plist.NSMicrophoneUsageDescription);
    expect(opts('expo-speech-recognition').speechRecognitionPermission).toBe(plist.NSSpeechRecognitionUsageDescription);
  });

  it('has a 1024 app icon without alpha', () => {
    expect(png(join(APP, config.icon))).toEqual({ width: 1024, height: 1024, alpha: false });
  });
});

describe('store listing (docs/store/tr.md)', () => {
  const md = readFileSync(join(STORE, 'tr.md'), 'utf8');

  it('has every field in Turkish within the App Store limits', () => {
    expect(section(md, 'Name')).toMatch(/^Harfiyen\b/);
    expect(section(md, 'Name').length).toBeLessThanOrEqual(30);
    expect(section(md, 'Subtitle').length).toBeLessThanOrEqual(30);
    expect(section(md, 'Promotional text').length).toBeLessThanOrEqual(170);
    expect(section(md, 'Description').length).toBeLessThanOrEqual(4000);
    expect(section(md, 'Keywords').length).toBeLessThanOrEqual(100);
    expect(section(md, "What's New")).toBe('İlk sürüm.');
    for (const f of ['Name', 'Promotional text', 'Description', 'Keywords']) expect(section(md, f)).toMatch(TURKISH);
  });

  it('keywords are comma separated without spaces around the commas and do not repeat the name', () => {
    const kw = section(md, 'Keywords');
    expect(kw).not.toMatch(/\s,|,\s/);
    expect(kw.toLocaleLowerCase('tr-TR')).not.toMatch(/harfiyen/);
  });

  it('never names a TV show, channel or presenter', () => {
    expect(md).not.toMatch(TRADEMARKS);
  });
});

describe('privacy policy (docs/store/privacy.md)', () => {
  const md = readFileSync(join(STORE, 'privacy.md'), 'utf8');

  it('has a Turkish and an English part, both saying nothing is collected or sent', () => {
    const tr = section(md, 'Türkçe');
    const en = section(md, 'English');
    expect(tr).toMatch(/Hiçbir veri toplamıyoruz/);
    expect(tr).toMatch(/göndermez/);
    expect(en).toMatch(/We collect no data/);
    expect(en).toMatch(/sends no information/);
  });

  it('covers the camera, the microphone with speech recognition, and tracking', () => {
    for (const word of [/Kamera/, /Mikrofon/, /konuşma tanıma/, /IDFA/]) expect(section(md, 'Türkçe')).toMatch(word);
    for (const word of [/Camera/, /Microphone/, /speech recognition/, /IDFA/]) expect(section(md, 'English')).toMatch(word);
  });

  it('never names a TV show, channel or presenter', () => {
    expect(md).not.toMatch(TRADEMARKS);
  });
});

describe('screenshots (docs/store/screenshots)', () => {
  const SIZES = { '6.9': [1320, 2868], '6.5': [1284, 2778] } as const;
  const SCREENS = ['menu', 'levels', 'game', 'match-result'];

  it.each(Object.entries(SIZES))('%s" has the menu, level map, game and multiplayer result at %p', (size, [w, h]) => {
    const dir = join(STORE, 'screenshots', size);
    expect(existsSync(dir)).toBe(true);
    const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const s of SCREENS) expect(files.some((f) => f.includes(s))).toBe(true);
    for (const f of files) expect(png(join(dir, f))).toEqual({ width: w, height: h, alpha: false });
  });
});
