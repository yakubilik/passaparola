(function () {
  'use strict';
  var PP = window.PP, S = PP.Sound;
  var $ = function (s) { return document.querySelector(s); };
  var KEY = 'passaparola.settings';
  var REVEAL_MS = 1700;

  var settings = { players: '1', time: '150', host: '0', camera: '0', muted: false, names: ['', ''] };
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
    S.play('theme');
    newGame();
    location.hash = '#/oyun';
  });

  // ---------- game state ----------
  var game = null, lastResult = null;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function makePlayer(name, set) {
    return {
      name: name, time: Number(settings.time), correct: 0, wrong: 0, idx: 0, done: false,
      letters: set.map(function (q) { return { l: q.l, t: q.t, q: q.q, a: q.a, status: 'pending' }; })
    };
  }

  function newGame() {
    var n = settings.players === '2' ? 2 : 1;
    var sets = shuffle(PP.SETS.map(function (_, i) { return i; })).slice(0, n);
    var defaults = n === 2 ? ['1. Yarışmacı', '2. Yarışmacı'] : ['Yarışmacı'];
    game = {
      players: sets.map(function (si, i) { return makePlayer(settings.names[i] || defaults[i], PP.SETS[si]); }),
      cur: 0, running: false, busy: true, ended: false, timer: null, last: 0, host: settings.host === '1'
    };
    buildStages();
    $('#answer').hidden = game.host;
    $('#hostbar').hidden = !game.host;
    startCamera();
    render();
    showQuestion();
    overlay(n === 2 ? 'Sıra: <b>' + esc(cur().name) + '</b>' : 'Hazır mısın?', begin);
  }

  function cur() { return game.players[game.cur]; }
  function other() { return game.players.filter(function (p, i) { return i !== game.cur && !p.done; })[0] || null; }

  function begin() {
    game.busy = false;
    startClock();
    showQuestion();
    focusInput();
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
    if (after < before && after > 0) S.play(after <= 10 ? 'warn' : 'tick');
    if (p.time <= 0) timeUp();
    renderHud();
  }

  function timeUp() {
    var p = cur();
    stopClock();
    p.done = true;
    game.busy = true;
    S.play('end');
    game.gong = true;
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

  function canAct() { return game && game.running && !game.busy && !game.ended; }

  function submit(text) {
    if (!canAct()) return;
    if (PP.isPass(text)) return doPass();
    if (PP.isCorrect(text, currentQ().a)) return doCorrect();
    doWrong();
  }

  function doCorrect() {
    var p = cur(), q = currentQ();
    q.status = 'correct';
    p.correct++;
    S.play('correct');
    pop(q);
    afterAnswer(false);
  }

  function doWrong() {
    var p = cur(), q = currentQ();
    q.status = 'wrong';
    p.wrong++;
    S.play('wrong');
    pop(q);
    stopClock();
    game.busy = true;
    var r = $('#reveal');
    r.innerHTML = 'Doğru cevap: <b>' + esc(q.a[0]) + '</b>';
    r.hidden = false;
    render();
    setTimeout(function () {
      if (!game || game.ended) return;
      r.hidden = true;
      game.busy = false;
      afterAnswer(true);
    }, REVEAL_MS);
  }

  function doPass() {
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
    if (!game.running) startClock();
    showQuestion();
    clearInput();
  }

  function nextTurnOrEnd() {
    if (!game || game.ended) return;
    if (other()) return switchTurn();
    if (!cur().done) { game.busy = false; startClock(); showQuestion(); return; }
    endGame();
  }

  function switchTurn() {
    stopClock();
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
    var full = game.players.some(function (p) { return p.correct === p.letters.length; });
    if (game.players.length === 2 || full) S.play('win');
    else if (!game.gong) S.play('end');
    stopCamera();
    location.replace('#/sonuc');
  }

  function abort() {
    if (!game) return;
    stopClock();
    game.ended = true;
    game = null;
    $('#overlay').hidden = true;
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
    if (settings.camera !== '1' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    if (stream) return moveCamera();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(function (s) {
      if (!game) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s;
      $('#cam').srcObject = s;
      moveCamera();
    }).catch(function () { toast('Kamera açılamadı', 'bad'); });
  }
  function moveCamera() {
    if (!stream || !game) return;
    var v = $('#cam');
    v.hidden = false;
    cur().stage.querySelector('.figure').appendChild(v);
    v.play && v.play().catch(function () {});
  }
  function stopCamera() {
    if (!stream) return;
    stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    var v = $('#cam');
    v.hidden = true;
    v.srcObject = null;
    document.body.appendChild(v);
  }

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
})();
