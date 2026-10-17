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

  var api = { norm: norm, fold: fold, isCorrect: isCorrect, isPass: isPass };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PP = Object.assign(root.PP || {}, api);
})(this);
