// Sound cues. Each cue is synthesised with Web Audio; if a clip exists at
// assets/sounds/original/<cue>.mp3 (gitignored, for the show's own clips) or
// assets/sounds/<cue>.mp3, that file is played instead.
(function (root) {
  var CUES = ['theme', 'correct', 'wrong', 'pas', 'tick', 'warn', 'turn', 'end', 'win'];
  var ctx = null, master = null, muted = false;
  var clips = {};

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    CUES.forEach(loadClip);
  }

  function loadClip(cue) {
    var sources = ['assets/sounds/original/' + cue + '.mp3', 'assets/sounds/' + cue + '.mp3'];
    (function attempt(n) {
      if (n >= sources.length) return;
      var a = new Audio();
      a.preload = 'auto';
      a.addEventListener('canplaythrough', function () { clips[cue] = a; }, { once: true });
      a.addEventListener('error', function () { attempt(n + 1); }, { once: true });
      a.src = sources[n];
    })(0);
  }

  function tone(freq, t, dur, type, vol, attack, endFreq) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    attack = attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  function noise(t, dur, vol, from, to) {
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  function buzz(t, dur) {
    var f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.setValueAtTime(0.22, t + dur - 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(master);
    [138, 146.8].forEach(function (fr) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  var SYNTH = {
    theme: function (t) {
      var notes = [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5];
      notes.forEach(function (n, i) { tone(n, t + i * 0.11, 0.18, 'sawtooth', 0.09); tone(n / 2, t + i * 0.11, 0.18, 'triangle', 0.12); });
      var c = t + notes.length * 0.11;
      [523.3, 659.3, 784, 1046.5].forEach(function (n) { tone(n, c, 1.1, 'sawtooth', 0.06, 0.02); });
      tone(130.8, c, 1.2, 'triangle', 0.25, 0.02);
      noise(c, 0.9, 0.12, 6000, 2500);
    },
    correct: function (t) {
      tone(1318.5, t, 0.28, 'triangle', 0.32);
      tone(1760, t + 0.09, 0.5, 'triangle', 0.32);
      tone(3520, t + 0.09, 0.35, 'sine', 0.06);
    },
    wrong: function (t) { buzz(t, 0.6); },
    pas: function (t) {
      tone(988, t, 0.2, 'triangle', 0.22, 0.005, 392);
      tone(740, t + 0.12, 0.22, 'triangle', 0.18, 0.005, 294);
      noise(t, 0.3, 0.1, 4000, 600);
    },
    tick: function (t) { tone(2400, t, 0.025, 'square', 0.05, 0.001); },
    warn: function (t) { tone(1046.5, t, 0.12, 'square', 0.12, 0.002); tone(2093, t, 0.08, 'sine', 0.05, 0.002); },
    turn: function (t) { tone(784, t, 0.15, 'triangle', 0.25); tone(1174.7, t + 0.13, 0.3, 'triangle', 0.25); },
    end: function (t) {
      [98, 196, 293.7, 415.3, 587.3].forEach(function (n, i) { tone(n, t, 2.6 - i * 0.35, 'sine', 0.22 / (i + 1) + 0.04, 0.005); });
      noise(t, 0.6, 0.15, 3000, 200);
    },
    win: function (t) {
      [[523.3, 0], [659.3, 0.15], [784, 0.3], [1046.5, 0.45], [784, 0.7], [1046.5, 0.85]].forEach(function (p) {
        tone(p[0], t + p[1], 0.3, 'square', 0.08); tone(p[0] * 2, t + p[1], 0.25, 'triangle', 0.08);
      });
      [523.3, 659.3, 784, 1046.5].forEach(function (n) { tone(n, t + 1.05, 1.2, 'sawtooth', 0.05, 0.02); });
    }
  };

  var played = [];

  function play(cue) {
    played.push(cue);
    if (muted || !ctx) return;
    var clip = clips[cue];
    if (clip) {
      try { clip.currentTime = 0; clip.play(); return; } catch (e) { /* fall back to synth */ }
    }
    if (SYNTH[cue]) SYNTH[cue](ctx.currentTime + 0.01);
  }

  function setMuted(m) { muted = !!m; }

  root.PP = Object.assign(root.PP || {}, {
    Sound: { init: init, play: play, setMuted: setMuted, isMuted: function () { return muted; }, played: played, CUES: CUES }
  });
})(this);
