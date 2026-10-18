// Writes the Maestro flow that walks the app and leaves screenshots.
const ans = JSON.parse(process.argv[2]);
const fold = (s) => s.replace(/[çÇ]/g, (c) => (c === 'ç' ? 'c' : 'C')).replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/İ/g, 'I')
  .replace(/[öÖ]/g, (c) => (c === 'ö' ? 'o' : 'O')).replace(/[şŞ]/g, (c) => (c === 'ş' ? 's' : 'S')).replace(/[üÜ]/g, (c) => (c === 'ü' ? 'u' : 'U'));
const L = 'A B C Ç D E F G H I İ J K L M N O Ö P R S Ş T U Ü V Y Z'.split(' ');
const wrong = new Set(['B', 'J', 'V']);
const pas = new Set(['C', 'Ş']);
const out = [];
const say = (t) => out.push(`- inputText: "${t}"`, '- pressKey: Enter');
const plan = [...L, 'C', 'Ş'];
plan.forEach((l, i) => {
  const lap2 = i >= L.length;
  if (!lap2 && pas.has(l)) out.push('- tapOn:\n    id: "pass"');
  else if (!lap2 && wrong.has(l)) { say('Kale'); out.push('- tapOn:\n    id: "reveal"'); }
  else say(fold(ans[l]));
  if (l === 'E' && !lap2) out.push('- takeScreenshot: game');
});
console.log(`appId: com.skolalabs.harfiyen
---
- launchApp
- extendedWaitUntil:
    visible:
      id: "intro-start"
    timeout: 180000
- takeScreenshot: intro
- tapOn:
    id: "intro-start"
- extendedWaitUntil:
    visible: "Hızlı oyun"
    timeout: 10000
- takeScreenshot: menu
- tapOn: "Kategoriler"
- tapOn:
    id: "cat-tarih"
- takeScreenshot: category
- tapOn: "Bölümlere git"
- extendedWaitUntil:
    visible: "BÖLÜM HARİTASI"
    timeout: 10000
- takeScreenshot: levels
- openLink: "harfiyen://game?cats=tarih&level=1&seed=7"
- extendedWaitUntil:
    visible: "Hazır mısın?"
    timeout: 10000
- tapOn: "Başla"
${out.join('\n')}
- extendedWaitUntil:
    visible: "TUR SONU"
    timeout: 10000
- takeScreenshot: result
- tapOn: "Bölüm haritası"
- extendedWaitUntil:
    visible: "BÖLÜM HARİTASI"
    timeout: 10000
- takeScreenshot: levels-after-pass
`);
