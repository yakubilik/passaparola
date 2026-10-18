// Dictation slips: what the iPhone's recognizer writes for a spoken answer is
// often spelt differently from the answer. These must count as right; the
// near misses below are other words and must stay wrong.
import { judgeSpoken, numberWords, phon, saidPass, spellNumbers, spokenPace } from '../normalize';

// [what the recognizer wrote, the question's answers]
const SLIPS: [string, string[]][] = [
  ['jimnastik', ['Cimnastik']],
  ['cevap jimnastik', ['Cimnastik']],
  ['Jimnastik yapmak', ['Cimnastik']],
  ['yogurt', ['Yoğurt']],
  ['Tardigrad', ['Tardigrat']],
  ['Gaus', ['Gauss']],
  ['Oktavyan', ['Oktavian']],
  ['Tazmanya', ['Tasmanya']],
  ['Tasmania', ['Tasmanya']],
  ['Formula bir', ['Formula 1', 'F1']],
  ['F bir', ['Formula 1', 'F1']],
  ['ilk on bir', ['İlk 11']],
  ['Birinci Dünya Savaşı', ['1. Dünya Savaşı']],
  ['3', ['Üç']],
  ['bin dokuz yüz yirmi üç', ['1923']],
  ['Ahmet Mithat', ['Ahmet Midhat']],
  ['Mehmed', ['Mehmet']],
  ['kitab', ['Kitap']],
  ['Zonguldağ', ['Zonguldak']],
  ['Zeybeğ', ['Zeybek']],
  ['ut', ['Ud']],
  ['Malazgirtte', ['Malazgirt']],
  ["Malazgirt'te", ['Malazgirt']],
  ['Osmos', ['Osmoz']],
  ['Bisans', ['Bizans']],
  ['Cengiz Aytmatof', ['Cengiz Aytmatov']],
  ['Gandi', ['Gandhi']],
  ['Hamid Kaplan', ['Hamit Kaplan']],
  ['Mutasiyon', ['Mutasyon']],
  ['Saltanatı', ['Saltanat']],
  ['Busula', ['Pusula']],
  ['Viyetnam', ['Vietnam']],
  ['Kütaya', ['Kütahya']],
  ['Nevton', ['Newton']],
  ['ibrahim müteferika', ['İbrahim Müteferrika']],
  ['Pasarovça', ['Pasarofça']],
  ['Mohaç meydan muharabesi', ['Mohaç Meydan Muharebesi']],
  ['Curasik', ['Jurasik']],
  ['Ağrı dağ efsanesi', ['Ağrı Dağı Efsanesi']],
  ['isinma', ['Isınma']],
];

// [what the player said, the answers]: a different word, so wrong.
const NEAR_MISSES: [string, string[]][] = [
  ['kartel', ['Kartal']],
  ['Antalya', ['Antakya']],
  ['kalıp', ['Kalp']],
  ['bala', ['Bal']],
  ['kediler', ['Kedi']],
  ['Amasra', ['Amasya']],
  ['bakar', ['Bakır']],
  ['masa', ['Kasa']],
  ['Erzurum', ['Erzincan']],
  ['İzmit', ['İzmir']],
  ['Sivas', ['Siirt']],
  ['adana', ['Ada']],
  ['Marmara', ['Marmaris']],
  ['Burdur', ['Bursa']],
  ['Romanya', ['Roma']],
  ['güneş', ['Güney']],
  ['kanon', ['Kanun']],
  ['lala', ['Lale']],
  ['pasta', ['Pas']],
  ['Avustralya', ['Avusturya']],
  ['Irak', ['İran']],
  ['Orhan', ['Osman']],
  ['Kemal Tahir', ['Kemal Sunal']],
  ['bayram', ['Bayrak']],
  ['mantı', ['Mantar']],
  ['Halil', ['Halit']],
  ['Salim', ['Selim']],
  ['Mısra', ['Mısır']],
  ['Fransız', ['Fransa']],
  ['bin dokuz yüz yirmi', ['1923']],
];

test.each(SLIPS)('"%s" counts for %j', (heard, answers) => {
  expect(judgeSpoken([heard], answers)).toBe('correct');
});

test.each(NEAR_MISSES)('"%s" stays wrong for %j', (heard, answers) => {
  expect(judgeSpoken([heard], answers)).toBe('wrong');
});

test('the table is big enough', () => {
  expect(SLIPS.length).toBeGreaterThanOrEqual(30);
  expect(NEAR_MISSES.length).toBeGreaterThanOrEqual(15);
});

test('a slip counts in any of the recognizer\'s guesses', () => {
  expect(judgeSpoken(['jim nastik', 'jimnastik'], ['Cimnastik'])).toBe('correct');
  expect(judgeSpoken(['başka bir şey', 'jimnastik'], ['Cimnastik'])).toBe('correct');
});

test('numbers are said as words', () => {
  expect(numberWords(0)).toBe('sıfır');
  expect(numberWords(11)).toBe('on bir');
  expect(numberWords(100)).toBe('yüz');
  expect(numberWords(1000)).toBe('bin');
  expect(numberWords(1923)).toBe('bin dokuz yüz yirmi üç');
  expect(numberWords(2_000_005)).toBe('iki milyon beş');
  expect(spellNumbers('1. Dünya Savaşı')).toBe('birinci Dünya Savaşı');
  expect(spellNumbers('4.')).toBe('dördüncü');
  expect(spellNumbers('2.')).toBe('ikinci');
  expect(spellNumbers('6.')).toBe('altıncı');
});

test('the sound key folds the spelling', () => {
  expect(phon('Cimnastik')).toBe(phon('jimnastik'));
  expect(phon('Yoğurt')).toBe(phon('yogurt'));
  expect(phon('Şanlıurfa')).toBe(phon('sanliurfa'));
  expect(phon('Gauss')).toBe(phon('gaus'));
  expect(phon('Zonguldak')).toBe(phon('zonguldağ'));
});

describe('Pas', () => {
  const PASSES = ['pas', 'Pas', 'pass', 'paso', 'bas', 'baş', 'geç', 'pas geçiyorum', 'geçiyorum', 'bilmiyorum', 'pas pas', 'passaparola'];
  test.each(PASSES)('"%s" passes', (w) => {
    expect(saidPass([w])).toBe(true);
    expect(judgeSpoken([w], ['Ankara'])).toBe('pass');
    expect(judgeSpoken([w], ['Cimnastik'])).toBe('pass');
  });

  test('"bas" passes only when said alone', () => {
    expect(judgeSpoken(['bas gitar'], ['Ankara'])).toBe('wrong');
    expect(judgeSpoken(['bas'], ['Ankara'])).toBe('pass');
  });

  test('a long sentence with "geç" in it is not a Pas', () => {
    expect(judgeSpoken(['dün akşam eve geç geldim'], ['Ankara'])).toBe('wrong');
  });

  test('the answer itself is never taken for a Pas', () => {
    expect(judgeSpoken(['pas'], ['Pas'])).toBe('correct');
    expect(judgeSpoken(['basketbol'], ['Basketbol'])).toBe('correct');
  });

  test('a Pas is judged at once, unless it may still grow into the answer', () => {
    expect(spokenPace(['pas'], ['Ankara'])).toBe('now');
    expect(spokenPace(['pas geçiyorum'], ['Ankara'])).toBe('now');
    expect(spokenPace(['pas'], ['Pasifik Okyanusu', 'Pasifik'])).toBe('settle');
  });
});

test('how soon heard words are judged', () => {
  expect(spokenPace(['ankara'], ['Ankara'])).toBe('now');
  expect(spokenPace(['jimnastik'], ['Cimnastik'])).toBe('now');
  expect(spokenPace(['izmir'], ['Ankara'])).toBe('settle');
  expect(spokenPace(['reşat'], ['Reşat Nuri Güntekin'])).toBe('partial');
});
