// Answer checking, forgiving the way a host would be: case and Turkish
// dotted/dotless I don't matter, nor does a keyboard without Turkish letters.
(function (root) {
  var FOLD = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u' };

  function norm(s) {
    return String(s == null ? '' : s)
      .toLocaleLowerCase('tr-TR')
      .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
      .replace(/[.,!?;:'"’‘`´()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function fold(s) {
    return norm(s).replace(/[çğıöşü]/g, function (c) { return FOLD[c]; }).replace(/ /g, '');
  }

  function isCorrect(input, answers) {
    var given = norm(input);
    if (!given) return false;
    var folded = fold(input);
    return answers.some(function (a) {
      return norm(a) === given || fold(a) === folded;
    });
  }

  function isPass(input) {
    var n = fold(input);
    return n === 'pas' || n === 'pass' || n === 'passaparola';
  }

  var PASS_WORDS = ['pas', 'pass', 'paso', 'bas', 'passaparola', 'gec', 'geciyorum', 'bilmiyorum'];

  // Speech recognition gives a few guesses, often with extra words around the
  // answer ("cevap Ankara"). Any guess, any word or pair of words may match.
  function judgeSpoken(alts, answers) {
    var pieces = [];
    alts.forEach(function (alt) {
      var w = norm(alt).split(' ').filter(Boolean);
      pieces.push(w.join(' '));
      for (var i = 0; i < w.length; i++) { pieces.push(w[i]); if (i + 1 < w.length) pieces.push(w[i] + ' ' + w[i + 1]); }
    });
    if (pieces.some(function (p) { return isCorrect(p, answers); })) return 'correct';
    var first = norm(alts[0]).split(' ');
    if (first.length <= 3 && first.some(function (w) { return PASS_WORDS.indexOf(fold(w)) >= 0; })) return 'pass';
    return 'wrong';
  }

  var api = { norm: norm, fold: fold, isCorrect: isCorrect, isPass: isPass, judgeSpoken: judgeSpoken };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PP = Object.assign(root.PP || {}, api);
})(this);
