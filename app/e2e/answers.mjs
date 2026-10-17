import fs from 'node:fs';
const [file, seed] = process.argv.slice(2);
const L = 'A B C Ç D E F G H I İ J K L M N O Ö P R S Ş T U Ü V Y Z'.split(' ');
function rng(s){let a=s>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const r = rng(Number(seed));
const lv = JSON.parse(fs.readFileSync(file,'utf8')).levels.find(l=>l.level===1);
const out = {};
for (const l of L){ const qs = lv.questions.filter(q=>q.letter===l); r(); out[l]=qs[Math.floor(r()*qs.length)].answers[0]; }
console.log(JSON.stringify(out));
