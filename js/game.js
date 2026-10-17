(function () {
  'use strict';
  var PP = window.PP, S = PP.Sound, V = PP.Voice;
  var $ = function (s) { return document.querySelector(s); };
  var KEY = 'passaparola.settings.v2';
  var REVEAL_MS = 1700;

  var settings = { players: '1', time: '150', host: '0', camera: '1', voice: '1', muted: false, names: ['', ''] };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* fresh start */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ } }

  var SILHOUETTE = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<circle cx="50" cy="40" r="17" fill="#7fb0ff"/>' +
    '<path d="M16 100c0-22 15-36 34-36s34 14 34 36z" fill="#5a92f0"/></svg>';

  // ---------- setup screen ----------
  function syncSetup() {
    document.querySelectorAll('.seg').forEach(function (seg) {
      var v = String(settings[seg.dataset.name]);
      seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    });
    document.body.classList.toggle('two', settings.players === '2');
    $('#name1').value = settings.names[0] || '';
    $('#name2').value = settings.names[1] || '';
    $('#mute').textContent = settings.muted ? '🔇' : '🔊';
    S.setMuted(settings.muted);
  }

  document.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      settings[seg.dataset.name] = b.dataset.v;
      save();
      syncSetup();
    });
  });

  $('#setup').addEventListener('submit', function (e) {
    e.preventDefault();
    settings.names = [$('#name1').value.trim(), $('#name2').value.trim()];
    save();
    S.init();
    V.unlock();
    S.play('theme');
    newGame();
    location.hash = '#/oyun';
  });

  function voiceOn() { return settings.voice === '1' && game && !game.host; }

  // ---------- game state ----------
  var game = null, lastResult = null;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function makePlayer(name, set, si) {
    return {
      name: name, set: si, time: Number(settings.time), correct: 0, wrong: 0, idx: 0, done: false, fresh: true,
      letters: set.map(function (q) { return { l: q.l, t: q.t, q: q.q, a: q.a, status: 'pending' }; })
    };
  }

  function newGame() {
    var n = settings.players === '2' ? 2 : 1;
    var sets = shuffle(PP.SETS.map(function (_, i) { return i; })).slice(0, n);
    var defaults = n === 2 ? ['1. Yarışmacı', '2. Yarışmacı'] : ['Yarışmacı'];
    game = {
      players: sets.map(function (si, i) { return makePlayer(settings.names[i] || defaults[i], PP.SETS[si], si); }),
      cur: 0, running: false, busy: true, ended: false, timer: null, last: 0, host: settings.host === '1'
    };
    buildStages();
    $('#answer').hidden = game.host;
    $('#mic').hidden = !(settings.voice === '1' && V.canListen);
    $('#hostbar').hidden = !game.host;
    startCamera();
    render();
    showQuestion();
    if (voiceOn() && V.canListen) V.listen(onHeard);
    else if (voiceOn()) toast('Bu tarayıcı sesli cevabı desteklemiyor', 'bad');
    overlay(n === 2 ? 'Sıra: <b>' + esc(cur().name) + '</b>' : 'Hazır mısın?', begin);
  }

  function cur() { return game.players[game.cur]; }
  function other() { return game.players.filter(function (p, i) { return i !== game.cur && !p.done; })[0] || null; }

  function begin() {
    if (game.firstTurn === undefined) game.firstTurn = true;
    game.busy = false;
    game.turnStart = true;
    cur().fresh = false;
    S.play('bg');
    ask();
  }

  // Shows the current question; in voice mode reads it out first and starts
  // the clock when the reading ends.
  function ask() {
    showQuestion();
    clearInput();
    if (!voiceOn() || !V.canSpeak) {
      if (!game.running) startClock();
      focusInput();
      return;
    }
    stopClock();
    game.reading = true;
    render();
    var q = currentQ(), g = game, p = cur();
    var parts = [{ key: qKey('q'), text: q.q + ' ' + (q.t === 'b' ? q.l + '.' : 'İçinde ' + q.l + '.') }];
    if (g.turnStart && g.firstTurn) parts.unshift(line('go'));
    g.turnStart = g.firstTurn = false;
    if (g.prefix) { parts.unshift(g.prefix); g.prefix = null; }
    preloadNext();
    S.duck(true);
    setTimeout(function () {
      if (game !== g || g.ended || !g.reading) return;
      V.speak(parts, function () {
        if (game !== g || g.ended || !g.reading) return;
        g.reading = false;
        S.duck(false);
        if (!g.busy && !cur().done) startClock();
      });
    }, 300);
  }

  function qKey(kind, p) { p = p || cur(); return kind + '-' + p.set + '-' + p.idx; }
  function line(key) { return { key: key, text: (PP.VOICE_LINES && PP.VOICE_LINES[key]) || HOST_TEXT[key] || '' }; }
  // Fallback wording when a recording is missing (tools/host-lines.json has the recorded ones).
  var HOST_TEXT = { welcome: 'Başarılar diliyorum.', welcome2: 'Her ikinize de başarılar diliyorum.', ready: 'Hazır mısınız?',
    go: 'İşte sağ cepten sorular çıkıyor efendim.', correct1: 'Doğru.', correct2: 'Doğru efendim.', correct3: 'Doğru yanıt.',
    wrong: 'Değil, olmadı.', listen: 'Ne olur dikkatli dinleyin.', turn: 'Sizdeyim efendim.', turn2: 'Sizinle devam ediyorum.',
    timeup: 'Süre doldu.', allcorrect: 'Bravo! Bütün harfleri bildiniz. Passaparola!', end: 'Çok güzel bir yarış. Tebrik ediyorum.',
    end2: 'Tebrik ediyorum her ikinizi de. Gerçekten çok güzel yarıştınız.', draw: 'Berabere bitti! Çok güzel bir final.', win: 'Bravo!' };
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // Fetch the next few questions' recordings ahead so there is no gap.
  function preloadNext() {
    if (!voiceOn()) return;
    var keys = [], p = cur(), n = p.letters.length;
    for (var k = 0, found = 0; k < n && found < 3; k++) {
      var j = (p.idx + k) % n;
      if (p.letters[j].status === 'pending') { keys.push('q-' + p.set + '-' + j, 'a-' + p.set + '-' + j); found++; }
    }
    S.preloadVoice(keys.filter(function (key) { return PP.VOICE_LINES && PP.VOICE_LINES[key]; }));
  }

  function interrupt() {
    if (!game.reading) return;
    V.cancel();
    game.reading = false;
    S.duck(false);
  }

  function onHeard(alts) {
    if (!game || game.ended) return;
    if (!$('#overlay').hidden) {
      if (alts.some(function (a) { return /hazır|hazir|başla|basla|tamam|evet|hadi/.test(PP.norm(a)); })) $('#overlaygo').click();
      return;
    }
    if (!canAct()) return;
    var v = PP.judgeSpoken(alts, currentQ().a);
    // While the question is still being read, longer talk is more likely the room than an answer.
    if (v === 'wrong' && game.reading && PP.norm(alts[0]).split(' ').length > 2) return;
    $('#guess').value = alts[0];
    if (v === 'correct') doCorrect(); else if (v === 'pass') doPass(); else doWrong(alts[0]);
  }

  // ---------- clock ----------
  function startClock() {
    stopClock();
    game.running = true;
    game.last = performance.now();
    game.timer = setInterval(onTick, 100);
    render();
  }

  function stopClock() {
    if (!game) return;
    game.running = false;
    clearInterval(game.timer);
    game.timer = null;
  }

  function onTick() {
    if (!game || !game.running) return;
    var now = performance.now(), p = cur();
    var before = Math.ceil(p.time);
    p.time = Math.max(0, p.time - (now - game.last) / 1000);
    game.last = now;
    var after = Math.ceil(p.time);
    // The every-second tick is left out in voice mode: it talks over the player.
    if (after < before && after > 0 && (after <= 10 || !voiceOn())) S.play(after <= 10 ? 'warn' : 'tick');
    if (p.time <= 0) timeUp();
    renderHud();
  }

  function timeUp() {
    var p = cur();
    stopClock();
    p.done = true;
    game.busy = true;
    S.play('end');
    S.stopBg();
    game.gong = true;
    if (voiceOn()) V.speak([line('timeup')]);
    toast('Süre doldu!', 'bad');
    render();
    setTimeout(nextTurnOrEnd, 1600);
  }

  // ---------- moves ----------
  function currentQ() { var p = cur(); return p.letters[p.idx]; }

  function moveNext(p) {
    var n = p.letters.length;
    for (var k = 1; k <= n; k++) {
      var j = (p.idx + k) % n;
      if (p.letters[j].status === 'pending') { p.idx = j; return true; }
    }
    return false;
  }

  function canAct() { return game && (game.running || game.reading) && !game.busy && !game.ended; }

  function submit(text) {
    if (!canAct()) return;
    if (PP.isPass(text)) return doPass();
    if (PP.isCorrect(text, currentQ().a)) return doCorrect();
    doWrong(text);
  }

  function doCorrect() {
    interrupt();
    var p = cur(), q = currentQ();
    p.wrongRun = 0;
    q.status = 'correct';
    p.correct++;
    S.play('correct');
    // The host now and then confirms out loud, as on the show.
    if (voiceOn() && Math.random() < 0.6) game.prefix = line(pick(['correct1', 'correct2', 'correct3']));
    pop(q);
    afterAnswer(false);
  }

  function doWrong(said) {
    interrupt();
    var p = cur(), q = currentQ();
    q.status = 'wrong';
    p.wrong++;
    S.play('wrong');
    pop(q);
    stopClock();
    game.busy = true;
    var r = $('#reveal');
    r.innerHTML = (said ? 'Senin cevabın: ' + esc(said) + '<br>' : '') + 'Doğru cevap: <b>' + esc(q.a[0]) + '</b>';
    r.hidden = false;
    render();
    var g = game, waits = 1;
    function go() {
      if (--waits > 0 || game !== g || g.ended) return;
      r.hidden = true;
      g.busy = false;
      afterAnswer(true);
    }
    if (voiceOn()) {
      waits++;
      var parts = [line('wrong'), { key: qKey('a'), text: q.a[0] + ' olacaktı.' }];
      p.wrongRun = (p.wrongRun || 0) + 1;
      if (p.wrongRun === 2) parts.push(line('listen'));
      setTimeout(function () { V.speak(parts, go); }, 500);
    }
    setTimeout(go, REVEAL_MS);
  }

  function doPass() {
    interrupt();
    var q = currentQ();
    q.passed = true;
    S.play('pas');
    toast('Pas!', 'pas');
    afterAnswer(true);
  }

  // turnEnds: a wrong answer or Pas hands the turn to the other player.
  function afterAnswer(turnEnds) {
    var p = cur();
    var more = moveNext(p);
    if (!more) {
      p.done = true;
      stopClock();
      game.busy = true;
      render();
      toast(p.correct === p.letters.length ? 'PASSAPAROLA!' : 'Bütün harfler bitti', 'ok');
      setTimeout(nextTurnOrEnd, 1300);
      return;
    }
    if (turnEnds && other()) return switchTurn();
    ask();
  }

  function nextTurnOrEnd() {
    if (!game || game.ended) return;
    if (other()) return switchTurn();
    if (!cur().done) { game.busy = false; S.play('bg'); ask(); return; }
    endGame();
  }

  function switchTurn() {
    stopClock();
    S.stopBg();
    game.busy = true;
    game.cur = game.players.indexOf(other());
    S.play('turn');
    moveCamera();
    render();
    showQuestion();
    clearInput();
    overlay('Sıra: <b>' + esc(cur().name) + '</b>', begin);
  }

  function endGame() {
    stopClock();
    game.ended = true;
    lastResult = game.players;
    renderResult();
    S.stopBg();
    V.stopListening();
    var full = game.players.some(function (p) { return p.correct === p.letters.length; });
    if (game.players.length === 2 || full) S.play('win');
    else if (!game.gong) S.play('end');
    if (voiceOn()) {
      var two = game.players.length === 2, ps = game.players;
      var draw = two && ps[0].correct === ps[1].correct && ps[0].wrong === ps[1].wrong;
      var parts = [line(full ? 'allcorrect' : draw ? 'draw' : two ? 'end2' : 'end')];
      setTimeout(function () { V.speak(parts); }, 1200);
    }
    stopCamera();
    location.replace('#/sonuc');
  }

  function abort() {
    if (!game) return;
    stopClock();
    game.ended = true;
    game = null;
    $('#overlay').hidden = true;
    S.stopBg();
    V.cancel();
    V.stopListening();
    stopCamera();
  }

  // ---------- rendering ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  function buildRing(p, small) {
    var ring = document.createElement('div');
    ring.className = 'ring' + (small ? ' small' : '');
    var center = document.createElement('div');
    center.className = 'center';
    center.innerHTML = '<div class="figure">' + SILHOUETTE + '</div>';
    ring.appendChild(center);
    var n = p.letters.length;
    p.letters.forEach(function (q, k) {
      var d = document.createElement('div');
      d.className = 'l';
      d.textContent = q.l;
      d.style.setProperty('--a', (-90 + k * 360 / n) + 'deg');
      ring.appendChild(d);
      if (!small) q.el = d;
      else d.dataset.s = q.status;
    });
    return ring;
  }

  function buildStages() {
    var box = $('#stages');
    box.innerHTML = '';
    box.classList.toggle('duo', game.players.length === 2);
    game.players.forEach(function (p) {
      var st = document.createElement('div');
      st.className = 'stage';
      st.appendChild(buildRing(p, false));
      var hud = document.createElement('div');
      hud.className = 'hud';
      hud.innerHTML = '<div class="clock"><span class="t"></span></div><div class="score"><span class="c"></span></div>';
      st.appendChild(hud);
      var name = document.createElement('div');
      name.className = 'pname';
      name.textContent = p.name;
      st.appendChild(name);
      box.appendChild(st);
      p.stage = st;
    });
  }

  function render() {
    if (!game) return;
    game.players.forEach(function (p, i) {
      var active = i === game.cur && !game.ended;
      p.stage.classList.toggle('active', active);
      p.stage.classList.toggle('done', p.done);
      p.letters.forEach(function (q, k) {
        q.el.dataset.s = q.status;
        q.el.classList.toggle('now', active && !p.done && k === p.idx && q.status === 'pending');
      });
    });
    renderHud();
  }

  function renderHud() {
    if (!game) return;
    var sb = '';
    game.players.forEach(function (p, i) {
      p.stage.querySelector('.t').textContent = Math.ceil(p.time);
      p.stage.querySelector('.c').textContent = p.correct;
      p.stage.querySelector('.clock').classList.toggle('low', p.time <= 10);
      sb += '<div class="pill' + (i === game.cur ? ' on' : '') + (p.done ? ' done' : '') + '">' +
        '<span class="n">' + esc(p.name) + '</span><span class="tm">' + Math.ceil(p.time) + '</span>' +
        '<span class="ok">' + p.correct + '</span><span class="no">' + p.wrong + '</span></div>';
    });
    $('#scoreboard').innerHTML = sb;
  }

  function showQuestion() {
    var q = currentQ();
    $('#qletter').textContent = q.l;
    $('#qtype').textContent = q.t === 'b' ? 'ile başlar' : 'İçinde ' + q.l + ' var';
    $('#qletter').classList.toggle('inside', q.t === 'i');
    $('#qtext').textContent = q.q;
    $('#hostanswer').textContent = q.a.join(' / ');
    render();
  }

  function pop(q) {
    q.el.classList.remove('pop');
    void q.el.offsetWidth;
    q.el.classList.add('pop');
  }

  var toastTimer = null;
  function toast(text, kind) {
    var t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.className = 'toast show ' + (kind || '');
    t.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 1100);
  }

  function overlay(html, onGo) {
    $('#overlaytext').innerHTML = html;
    $('#overlay').hidden = false;
    var go = $('#overlaygo');
    go.onclick = function () {
      $('#overlay').hidden = true;
      go.onclick = null;
      S.init();
      onGo();
    };
    setTimeout(function () { go.focus(); }, 50);
    if (voiceOn()) {
      var first = game.players.every(function (p) { return p.fresh; }) && game.cur === 0;
      var parts = first ? [line(game.players.length === 2 ? 'welcome2' : 'welcome'), line('ready')] : [line(pick(['turn', 'turn2']))];
      setTimeout(function () { V.speak(parts); }, first ? 1800 : 600);
    }
  }

  function clearInput() { $('#guess').value = ''; }
  function focusInput() { if (!game.host) { clearInput(); $('#guess').focus(); } }

  function renderResult() {
    var ps = lastResult, title;
    if (ps.length === 2) {
      var a = ps[0], b = ps[1];
      var diff = (a.correct - b.correct) || (b.wrong - a.wrong);
      title = diff === 0 ? 'Berabere!' : 'Kazanan: ' + esc(diff > 0 ? a.name : b.name);
    } else {
      var p = ps[0];
      title = p.correct === p.letters.length ? 'PASSAPAROLA! Hepsini bildin!' : p.correct + ' doğru!';
    }
    $('#winner').innerHTML = title;
    var box = $('#results');
    box.innerHTML = '';
    ps.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'card res';
      var empty = p.letters.filter(function (q) { return q.status === 'pending'; }).length;
      card.innerHTML = '<h3>' + esc(p.name) + '</h3><div class="nums">' +
        '<div class="ok"><b>' + p.correct + '</b>doğru</div><div class="no"><b>' + p.wrong + '</b>yanlış</div>' +
        '<div class="em"><b>' + empty + '</b>boş</div></div>';
      card.insertBefore(buildRing(p, true), card.querySelector('.nums'));
      var missed = p.letters.filter(function (q) { return q.status !== 'correct'; });
      if (missed.length) {
        var ul = document.createElement('ul');
        ul.className = 'missed';
        ul.innerHTML = missed.map(function (q) {
          return '<li data-s="' + q.status + '"><span class="ml">' + q.l + '</span>' + esc(q.a[0]) + '</li>';
        }).join('');
        card.appendChild(ul);
      }
      box.appendChild(card);
    });
  }

  // ---------- camera: the contestant's own face inside the ring ----------
  var stream = null;
  function startCamera() {
    if (settings.camera !== '1') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast(location.protocol === 'https:' ? 'Bu tarayıcı kamerayı açamıyor, Safari\'de aç' : 'Kamera için https linkini kullan', 'bad');
      return;
    }
    if (stream) return moveCamera();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false }).then(function (s) {
      if (!game) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s;
      var v = $('#cam');
      v.srcObject = s;
      v.play && v.play().catch(function () {});
      if (PP.Face) PP.Face.start(v);
      moveCamera();
    }).catch(function (err) {
      toast(err && err.name === 'NotAllowedError' ? 'Kamera izni verilmedi' : 'Kamera açılamadı', 'bad');
    });
  }
  // The picture is drawn by PP.Face into a canvas; the <video> itself plays
  // off screen. Without PP.Face the plain video goes into the circle.
  function moveCamera() {
    if (!stream || !game) return;
    var fig = cur().stage.querySelector('.figure'), v = $('#cam');
    if (PP.Face) { v.className = 'offscreen'; PP.Face.attach(fig); }
    else { v.className = ''; fig.appendChild(v); }
  }
  function stopCamera() {
    if (!stream) return;
    if (PP.Face) PP.Face.stop();
    stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    var v = $('#cam');
    v.className = 'offscreen';
    v.srcObject = null;
    document.body.appendChild(v);
  }

  // ---------- voice state ----------
  V.onState(function (st, detail) {
    var el = $('#voicestate');
    var txt = { listening: '🎤 Dinliyorum', speaking: '🔈 Okuyor', denied: '🎤 Mikrofon izni yok',
      tap: '🎤 Konuşmak için dokun', error: '🎤 ' + (detail ? V.explain(detail) : 'Duyamadım') + ' Dokun.' }[st];
    el.textContent = txt || '';
    el.hidden = !txt;
    el.dataset.s = st;
  });
  V.onInterim(function (text) { if (game && canAct()) $('#guess').value = text; });
  function kickMic() { if (game && voiceOn()) V.kick(); }
  $('#voicestate').addEventListener('click', kickMic);
  $('#mic').addEventListener('click', kickMic);

  // ---------- microphone check ----------
  var stopTest = null;
  function runMicTest() {
    if (stopTest) stopTest();
    V.unlock();
    $('#micbox').hidden = false;
    $('#micheard').textContent = '';
    $('#micmsg').textContent = '';
    $('#micmsg').className = 'mic-msg';
    $('#micbox').dataset.s = 'listening';
    stopTest = V.test(function (u) {
      $('#micbox').dataset.s = u.state;
      if (u.state === 'listening') $('#micmsg').textContent = '🎤 Dinliyorum…';
      if (u.state === 'hearing') { $('#micheard').textContent = '“' + u.text + '”'; $('#micmsg').textContent = '🎤 Duyuyorum…'; }
      if (u.state === 'ok') {
        $('#micheard').textContent = '“' + u.text + '”';
        $('#micmsg').textContent = '✓ Mikrofon çalışıyor, sesli oynayabilirsin.';
        $('#micmsg').className = 'mic-msg ok';
      }
      if (u.state === 'error') { $('#micmsg').textContent = '✗ ' + u.text; $('#micmsg').className = 'mic-msg bad'; }
    });
  }
  $('#mictest').addEventListener('click', runMicTest);
  $('#micagain').addEventListener('click', runMicTest);
  $('#micclose').addEventListener('click', function () { if (stopTest) stopTest(); stopTest = null; $('#micbox').hidden = true; });

  // ---------- input ----------
  $('#answer').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#guess').value;
    if (!v.trim()) return;
    submit(v);
  });
  $('#pass').addEventListener('click', function () { if (canAct()) doPass(); $('#guess').focus(); });
  $('#hostbar').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || !canAct()) return;
    ({ correct: doCorrect, wrong: doWrong, pas: doPass })[b.dataset.judge]();
  });
  document.addEventListener('keydown', function (e) {
    if (!game || !game.host || !canAct() || e.target.tagName === 'INPUT') return;
    var k = e.key.toLocaleLowerCase('tr-TR');
    if (k === 'd') doCorrect(); else if (k === 'y') doWrong(); else if (k === 'p') doPass();
  });
  $('#quit').addEventListener('click', function () {
    if (game && !game.ended && !confirm('Oyundan çıkılsın mı?')) return;
    history.back();
  });
  $('#mute').addEventListener('click', function () {
    settings.muted = !settings.muted;
    if (settings.muted) V.cancel();
    save();
    syncSetup();
  });
  $('#again').addEventListener('click', function () {
    S.init();
    S.play('theme');
    newGame();
    location.replace('#/oyun');
  });
  $('#tomenu').addEventListener('click', function () { history.back(); });

  // ---------- routing: Back moves between screens inside the game ----------
  function showScreen(id) {
    ['menu', 'game', 'result'].forEach(function (s) { $('#' + s).hidden = s !== id; });
  }
  function route() {
    var h = location.hash;
    if (h === '#/oyun') {
      if (!game || game.ended) return location.replace('#/');
      showScreen('game');
    } else if (h === '#/sonuc') {
      if (!lastResult) return location.replace('#/');
      showScreen('result');
    } else {
      if (game && !game.ended) abort();
      showScreen('menu');
    }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', stopCamera);

  syncSetup();
  route();

  // test hook
  PP.state = function () { return game; };
  PP.hear = function (alts) { onHeard(alts); };
})();
