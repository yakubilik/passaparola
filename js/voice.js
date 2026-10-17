// Voice: the questions are read aloud in Turkish and the player answers by
// speaking. The microphone is closed while the game itself is talking, so it
// never hears its own questions.
//
// iOS Safari rarely marks a result final, so interim results are used and an
// answer counts as said once the words stop changing for a moment.
(function (root) {
  var synth = root.speechSynthesis;
  var SR = root.SpeechRecognition || root.webkitSpeechRecognition;
  var SETTLE_MS = 900;
  var voice = null, rec = null, wanted = false, handler = null, speaking = 0;
  var onState = function () {}, onInterim = function () {};
  var token = 0, settleTimer = null, lastAlts = null, session = 0;

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

  function speak(text, done) {
    var my = ++token;
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      speaking = Math.max(0, speaking - 1);
      if (my === token) { resume(); if (done) done(); }
    }
    if (!synth) { if (done) setTimeout(done, 0); return; }
    synth.cancel();
    pauseMic();
    speaking++;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    if (voice) u.voice = voice;
    u.rate = 1.05;
    u.onend = finish;
    u.onerror = finish;
    onState('speaking');
    synth.speak(u);
    // Safari sometimes never fires onend; don't let the game hang on it.
    setTimeout(finish, 1500 + text.length * 110);
  }

  function cancel() {
    token++;
    speaking = 0;
    if (synth) synth.cancel();
  }

  function deliver(my) {
    clearTimeout(settleTimer);
    if (my !== session || !lastAlts) return;
    var alts = lastAlts;
    lastAlts = null;
    session++;            // ignore whatever this recognition says from now on
    pauseMic();
    if (handler && !speaking) handler(alts);
    if (!speaking) setTimeout(resume, 200);
  }

  function startRec() {
    if (!SR || !wanted || rec || speaking) return;
    var my = ++session;
    var r = new SR();
    rec = r;
    r.lang = 'tr-TR';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.onresult = function (e) {
      if (my !== session) return;
      var res = e.results[e.results.length - 1];
      if (!res) return;
      var alts = [];
      for (var i = 0; i < res.length; i++) if (res[i].transcript.trim()) alts.push(res[i].transcript.trim());
      if (!alts.length) return;
      lastAlts = alts;
      onInterim(alts[0]);
      clearTimeout(settleTimer);
      if (res.isFinal) deliver(my);
      else settleTimer = setTimeout(function () { deliver(my); }, SETTLE_MS);
    };
    r.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wanted = false; onState('denied'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') { log('rec error ' + e.error); onState('error', e.error); }
    };
    r.onend = function () {
      if (rec === r) rec = null;
      if (my === session && lastAlts) return deliver(my);
      if (wanted && !speaking) setTimeout(startRec, 250);
      else if (!wanted) onState('off');
    };
    try { r.start(); onState('listening'); } catch (e) { rec = null; onState('tap'); }
  }

  function pauseMic() {
    clearTimeout(settleTimer);
    if (rec) { var r = rec; rec = null; try { r.abort(); } catch (e) { /* already stopped */ } }
  }

  function resume() { if (wanted && !speaking) startRec(); }

  function listen(fn) { handler = fn; wanted = true; resume(); }

  // From a tap on the mic button: restarts recognition inside a user gesture.
  function kick() {
    if (!SR) return;
    wanted = true;
    if (speaking) return;
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
