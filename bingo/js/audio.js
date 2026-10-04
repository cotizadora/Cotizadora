/* Sonido sintetizado con Web Audio API: soplador de la tómbola, choques de bolas,
   subida por el tubo, caída en la bandeja y campanilla de presentación. */
(function (Bingo) {
  'use strict';

  function AudioEngine() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.activity = 0;
    this._lastClack = 0;
    this._clacksThisWindow = 0;
    this._windowStart = 0;
  }

  /* Debe llamarse dentro de un gesto del usuario (política de reproducción automática). */
  AudioEngine.prototype.unlock = function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = null; return; }
      this._build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
  };

  AudioEngine.prototype._build = function () {
    var ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    var len = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = this.noise.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Motor del soplador: zumbido mecánico grave y aire seco, sin oleaje.
    var air = ctx.createBufferSource();
    air.buffer = this.noise; air.loop = true;
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'lowpass'; this.airFilter.frequency.value = 260; this.airFilter.Q.value = 0.5;
    this.airGain = ctx.createGain(); this.airGain.gain.value = 0;
    air.connect(this.airFilter); this.airFilter.connect(this.airGain); this.airGain.connect(this.master);

    var hum1 = ctx.createOscillator(); hum1.type = 'sawtooth'; hum1.frequency.value = 98;
    var hum2 = ctx.createOscillator(); hum2.type = 'triangle'; hum2.frequency.value = 196.5;
    var humFilter = ctx.createBiquadFilter(); humFilter.type = 'bandpass'; humFilter.frequency.value = 160; humFilter.Q.value = 1.2;
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    hum1.connect(humFilter); hum2.connect(humFilter); humFilter.connect(this.humGain); this.humGain.connect(this.master);

    this.clicks = this._bank(ctx, 10, 'ball');
    this.knocks = this._bank(ctx, 6, 'wall');
    this.lands = this._bank(ctx, 3, 'land');

    air.start(); hum1.start(); hum2.start();
    this.setActivity(this.activity);
  };

  /* Choques precalculados con síntesis modal: transitorio seco + resonancias
     cortas, como bolas macizas de resina (billar) chocando entre sí o contra el acrílico. */
  AudioEngine.prototype._bank = function (ctx, count, kind) {
    var sr = ctx.sampleRate, out = [];
    for (var v = 0; v < count; v++) {
      var dur = kind === 'land' ? 0.16 : 0.07, len = Math.floor(sr * dur);
      var buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
      var r = function (a, b) { return a + Math.random() * (b - a); };
      var modes;
      if (kind === 'ball') modes = [[r(2900, 4300), 1, r(0.006, 0.011)], [0, 0.55, r(0.004, 0.007)], [r(1150, 1650), 0.35, r(0.004, 0.007)], [r(6200, 7600), 0.18, 0.002]];
      else if (kind === 'wall') modes = [[r(1050, 1500), 1, r(0.012, 0.02)], [r(2300, 2900), 0.45, r(0.006, 0.01)], [r(420, 560), 0.4, 0.02]];
      else modes = [[r(700, 850), 1, 0.03], [r(1700, 2100), 0.5, 0.012], [r(190, 240), 0.7, 0.05]];
      if (kind === 'ball') modes[1][0] = modes[0][0] * r(1.47, 1.62);
      var ph = modes.map(function () { return Math.random() * 6.28; }), peak = 0, i, m;
      for (i = 0; i < len; i++) {
        var t = i / sr, x = 0;
        for (m = 0; m < modes.length; m++) x += modes[m][1] * Math.exp(-t / modes[m][2]) * Math.sin(6.2832 * modes[m][0] * t + ph[m]);
        x += (Math.random() * 2 - 1) * Math.exp(-t / (kind === 'ball' ? 0.0006 : 0.0012)) * (kind === 'ball' ? 0.9 : 0.6);
        x *= Math.min(1, t / 0.0002);
        d[i] = x; if (Math.abs(x) > peak) peak = Math.abs(x);
      }
      for (i = 0; i < len; i++) d[i] /= peak;
      out.push(buf);
    }
    return out;
  };

  AudioEngine.prototype._play = function (bank, gain, pan, when, rate) {
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = bank[(Math.random() * bank.length) | 0];
    src.playbackRate.value = rate || (0.94 + Math.random() * 0.12);
    var g = ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this._panner(pan));
    src.start(when || ctx.currentTime);
  };

  AudioEngine.prototype.ready = function () {
    return !!(this.ctx && this.ctx.state === 'running' && this.enabled && this.volume > 0);
  };

  AudioEngine.prototype.setEnabled = function (on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  };

  AudioEngine.prototype.setVolume = function (v) {
    this.volume = v;
    if (this.master && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  };

  AudioEngine.prototype.suspend = function () {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(function () {});
  };
  AudioEngine.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
  };

  /* Nivel de actividad del soplador: 0 reposo, 1 mezcla intensa. */
  AudioEngine.prototype.setActivity = function (level) {
    this.activity = level;
    if (!this.ctx) return;
    var t = this.ctx.currentTime, on = level > 0.12 ? (level - 0.12) / 0.88 : 0;
    this.airGain.gain.setTargetAtTime(0.09 * on, t, 0.2);
    this.airFilter.frequency.setTargetAtTime(220 + 260 * on, t, 0.2);
    this.humGain.gain.setTargetAtTime(0.035 * on, t, 0.25);
  };

  AudioEngine.prototype._panner = function (pan) {
    if (this.ctx.createStereoPanner) {
      var p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.master);
      return p;
    }
    return this.master;
  };

  AudioEngine.prototype._tone = function (out, freq, start, decay, gain, type) {
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    o.connect(g); g.connect(out);
    o.start(start); o.stop(start + decay + 0.02);
  };

  /* Choque entre bolas (kind 'ball') o contra la esfera de acrílico (kind 'wall'). */
  AudioEngine.prototype.clack = function (intensity, pan, kind) {
    if (!this.ready()) return;
    var t = this.ctx.currentTime;
    if (t - this._windowStart > 0.07) { this._windowStart = t; this._clacksThisWindow = 0; }
    if (this._clacksThisWindow >= 3) return;
    this._clacksThisWindow++;
    var v = Math.min(1, intensity);
    var when = t + Math.random() * 0.008;
    if (kind === 'wall') this._play(this.knocks, 0.05 + 0.22 * v * v, pan, when);
    else this._play(this.clicks, 0.04 + 0.34 * v * v, pan, when, 0.9 + v * 0.18 + Math.random() * 0.06);
  };

  /* La bola sube por el tubo golpeteando las paredes. */
  AudioEngine.prototype.tube = function (duration) {
    if (!this.ready()) return;
    var t = this.ctx.currentTime, at = 0.03, step = 0.05;
    while (at < duration) {
      this._play(this.knocks, 0.07 + Math.random() * 0.08, 0.1 + at / duration * 0.4, t + at, 1.25 + Math.random() * 0.2);
      at += step + Math.random() * 0.04;
      step *= 1.08;
    }
  };

  /* La bola cae en la bandeja de bronce y rebota hasta quedar quieta. */
  AudioEngine.prototype.thunk = function () {
    if (!this.ready()) return;
    var t = this.ctx.currentTime, gap = 0.11, g = 0.55;
    for (var i = 0; i < 4; i++) {
      this._play(i === 0 ? this.lands : this.knocks, g, 0.5, t, i === 0 ? 1 : 1.1);
      t += gap; gap *= 0.62; g *= 0.45;
    }
  };

  /* Campanilla cálida de dos notas cuando el número queda a la vista. */
  AudioEngine.prototype.chime = function () {
    if (!this.ready()) return;
    var t = this.ctx.currentTime;
    var notes = [783.99, 1174.66];
    for (var i = 0; i < notes.length; i++) {
      var st = t + i * 0.11;
      this._tone(this.master, notes[i], st, 1.1, 0.16);
      this._tone(this.master, notes[i] * 2.0, st, 0.5, 0.045);
      this._tone(this.master, notes[i] * 3.93, st, 0.16, 0.03);
    }
  };

  /* Cierre de partida. */
  AudioEngine.prototype.finale = function () {
    if (!this.ready()) return;
    var t = this.ctx.currentTime;
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i++) {
      this._tone(this.master, notes[i], t + i * 0.14, 1.3, 0.13);
      this._tone(this.master, notes[i] * 2, t + i * 0.14, 0.5, 0.035);
    }
  };

  Bingo.AudioEngine = AudioEngine;
})(window.Bingo = window.Bingo || {});
