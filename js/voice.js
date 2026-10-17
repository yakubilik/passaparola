// Voice: the questions are read aloud in Turkish and the player answers by
// speaking. The microphone stays open the whole game (iOS chimes every time it
// is switched on, and a late start misses the answer), so the player can answer
// while a question is still being read. Words the game itself is saying are
// filtered out of what the microphone hears.
//
// iOS Safari rarely marks a result final and keeps growing one result for
// everything said, so interim results are used, words already handled are cut
// off the front, and an answer counts as said once the words stop changing.
(function (root) {
  var synth = root.speechSynthesis;
  var SR = root.SpeechRecognition || root.webkitSpeechRecognition;
  var SETTLE_MS = 900;
  var voice = null, rec = null, wanted = false, handler = null, speaking = 0;
  var onState = function () {}, onInterim = function () {};
  var token = 0, settleTimer = null, lastAlts = null, lastKey = '', session = 0;
  var used = {};          // result index -> words already handled
  var echo = [], echoUntil = 0;  // what the game is saying, folded words

  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices().filter(function (v) { return /^tr/i.test(v.lang); });
    var pref = ['Yelda', 'Google', 'Cem', 'Siri'];
    voice = vs.sort(function (a, b) {
      var ia = pref.findIndex(function (p) { return a.name.indexOf(p) >= 0; });
      var ib = pref.findIndex(function (p) { return b.name.indexOf(p) >= 0; });
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })[0] || null;
  }
  if (synth) { pickVoice(); synth.addEventListener && synth.addEventListener('voiceschanged', pickVoice); }

  // Call from a tap: iOS only lets speech start inside a user gesture the first time.
  function unlock() {
    if (!synth) return;
    var u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  }

  // input: a sentence, or a list of {key, text}. A part with a recorded clip
  // (assets/voice/<key>.mp3, listed in PP.VOICE_LINES) plays the recording;
  // anything else is read by the browser's own voice.
  function speak(input, done) {
    var parts = typeof input === 'string' ? [{ text: input }] : input;
    var my = ++token;
    var finished = false, i = 0;
    var S = root.PP.Sound, lines = root.PP.VOICE_LINES || {};
    function finish() {
      if (finished) return;
      finished = true;
      speaking = Math.max(0, speaking - 1);
      echoUntil = Date.now() + 1500;  // the room still rings for a moment
      if (my === token) { if (!speaking) onState(rec ? 'listening' : 'off'); resume(); if (done) done(); }
    }
    function synthPart(text, next) {
      if (!synth || !text) return next();
      var called = false;
      function once() { if (!called) { called = true; next(); } }
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'tr-TR';
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.onend = once;
      u.onerror = once;
      synth.speak(u);
      // Safari sometimes never fires onend; don't let the game hang on it.
      setTimeout(once, 1500 + text.length * 110);
    }
    function next() {
      if (my !== token || i >= parts.length) return finish();
      var p = parts[i++];
      if (S && S.isMuted()) return next();
      if (p.key && lines[p.key] && S && S.voiceReady()) S.playVoice(p.key, next, function () { synthPart(p.text, next); });
      else synthPart(p.text, next);
    }
    if (synth) synth.cancel();
    if (S) S.stopVoice();
    setEcho(parts);
    speaking++;
    onState('speaking');
    next();
  }

  function cancel() {
    token++;
    if (speaking) { speaking = 0; echoUntil = Date.now() + 1500; onState(rec ? 'listening' : 'off'); }
    if (synth) synth.cancel();
    if (root.PP.Sound) root.PP.Sound.stopVoice();
  }

  function words(s) { return root.PP.norm(s).split(' ').filter(Boolean); }
  function setEcho(parts) {
    var lines = root.PP.VOICE_LINES || {};
    echo = [];
    parts.forEach(function (p) { echo = echo.concat(words((p.key && lines[p.key]) || p.text || '').map(root.PP.fold)); });
    echoUntil = Infinity;
  }
  // A heard word is the game's own voice if it matches, or nearly matches, a word being said.
  function isEcho(w) {
    if (Date.now() > echoUntil) return false;
    var f = root.PP.fold(w);
    // "Hazır mısınız?" must not swallow the player's "hazırım", so only a one-letter slip counts as near.
    return echo.some(function (e) { return e === f || (f.length >= 5 && Math.abs(e.length - f.length) <= 1 && e.slice(0, 4) === f.slice(0, 4)); });
  }

  function deliver(my, idx, count) {
    clearTimeout(settleTimer);
    if (my !== session || !lastAlts) return;
    var alts = lastAlts;
    lastAlts = null;
    lastKey = '';
    used[idx] = Math.max(used[idx] || 0, count);  // the next answer starts after these words
    if (handler) handler(alts);
  }

  function startRec() {
    if (!SR || !wanted || rec) return;
    var my = ++session;
    var r = new SR();
    rec = r;
    used = {};
    lastAlts = null;
    lastKey = '';
    r.lang = 'tr-TR';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.onresult = function (e) {
      if (my !== session) return;
      var idx = e.results.length - 1, res = e.results[idx];
      if (!res) return;
      var skip = used[idx] || 0, count = 0, alts = [];
      for (var i = 0; i < res.length; i++) {
        var w = words(res[i].transcript);
        if (i === 0) count = w.length;
        w = w.slice(skip).filter(function (x) { return !isEcho(x); });
        if (w.length) alts.push(w.join(' '));
      }
      if (!alts.length) {
        // Only the game's own voice so far: mark it handled so it never prefixes an answer.
        if (!lastAlts && speaking) used[idx] = Math.max(skip, count);
        return;
      }
      if (alts[0] === lastKey && !res.isFinal) return;  // nothing new, keep the settle timer running
      lastKey = alts[0];
      lastAlts = alts;
      onInterim(alts[0]);
      clearTimeout(settleTimer);
      if (res.isFinal) deliver(my, idx, count);
      else settleTimer = setTimeout(function () { deliver(my, idx, count); }, SETTLE_MS);
    };
    r.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wanted = false; onState('denied'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') { log('rec error ' + e.error); onState('error', e.error); }
    };
    r.onend = function () {
      if (rec === r) rec = null;
      if (my === session && lastAlts) deliver(my, -1, 0);
      if (wanted) setTimeout(startRec, 250);
      else if (!wanted) onState('off');
    };
    try { r.start(); if (!speaking) onState('listening'); } catch (e) { rec = null; onState('tap'); }
  }

  function pauseMic() {
    clearTimeout(settleTimer);
    if (rec) { var r = rec; rec = null; try { r.abort(); } catch (e) { /* already stopped */ } }
  }

  function resume() { if (wanted) startRec(); }

  function listen(fn) { handler = fn; wanted = true; resume(); }

  // From a tap on the mic button: restarts recognition inside a user gesture.
  function kick() {
    if (!SR) return;
    wanted = true;
    pauseMic();
    startRec();
  }

  var ERRORS = {
    'not-allowed': 'Mikrofon izni verilmedi. Ayarlar > Safari > Mikrofon\'dan izin ver.',
    'service-not-allowed': 'Dikte kapalı. Ayarlar > Genel > Klavye > Dikte\'yi aç.',
    'audio-capture': 'Mikrofon açılamadı; başka bir uygulama kullanıyor olabilir.',
    'network': 'Ses tanıma için internet bağlantısı gerekiyor.',
    'no-speech': 'Ses gelmedi. Biraz daha yüksek sesle tekrar dene.',
    'language-not-supported': 'Bu cihazda Türkçe ses tanıma yok.',
    'aborted': 'Dinleme yarıda kesildi, tekrar dene.'
  };
  function explain(code) { return ERRORS[code] || ('Hata: ' + code); }

  // Send a line to the server log so problems on the phone can be seen on the Mac.
  function log(msg) { try { fetch('__log?' + encodeURIComponent(msg)).catch(function () {}); } catch (e) { /* ignore */ } }
  log('boot sr=' + !!SR + ' tts=' + !!synth + ' cam=' + !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) +
    ' standalone=' + !!navigator.standalone + ' ua=' + navigator.userAgent);

  // Microphone check before the game: listens once and reports what it heard.
  function test(update) {
    if (!SR) { update({ state: 'error', text: 'Bu tarayıcı sesli cevabı desteklemiyor. Safari ya da Chrome\'da aç.' }); return function () {}; }
    stopListening();
    cancel();
    var r = new SR(), heard = '', done = false;
    r.lang = 'tr-TR';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    var t = null;
    function finish(state, text) {
      if (done) return;
      done = true;
      clearTimeout(t);
      try { r.abort(); } catch (e) { /* stopped */ }
      log('mictest ' + state + ' ' + text);
      update({ state: state, text: text });
    }
    r.onresult = function (e) {
      var res = e.results[e.results.length - 1];
      heard = res[0].transcript.trim();
      update({ state: 'hearing', text: heard });
      clearTimeout(t);
      t = setTimeout(function () { finish('ok', heard); }, res.isFinal ? 0 : SETTLE_MS);
    };
    r.onerror = function (e) { if (!heard) finish('error', explain(e.error)); };
    r.onend = function () { if (heard) finish('ok', heard); else finish('error', explain('no-speech')); };
    try { r.start(); update({ state: 'listening', text: '' }); }
    catch (e) { finish('error', 'Mikrofon başlatılamadı: ' + e.message); }
    return function () { done = true; clearTimeout(t); try { r.abort(); } catch (e) { /* stopped */ } };
  }

  function stopListening() { wanted = false; handler = null; lastAlts = null; session++; pauseMic(); onState('off'); }

  root.PP = Object.assign(root.PP || {}, {
    Voice: {
      canSpeak: !!synth, canListen: !!SR,
      unlock: unlock, speak: speak, cancel: cancel, listen: listen, stopListening: stopListening, kick: kick,
      test: test, explain: explain, log: log,
      onState: function (fn) { onState = fn; },
      onInterim: function (fn) { onInterim = fn; }
    }
  });
})(this);
