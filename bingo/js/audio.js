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

    // Soplador: aire filtrado + zumbido grave del motor.
    var air = ctx.createBufferSource();
    air.buffer = this.noise; air.loop = true;
    this.airFilter = ctx.createBiquadFilter();
    this.airFilter.type = 'bandpass'; this.airFilter.frequency.value = 420; this.airFilter.Q.value = 0.6;
    this.airGain = ctx.createGain(); this.airGain.gain.value = 0;
    air.connect(this.airFilter); this.airFilter.connect(this.airGain); this.airGain.connect(this.master);
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.55;
    var lfoGain = ctx.createGain(); lfoGain.gain.value = 90;
    lfo.connect(lfoGain); lfoGain.connect(this.airFilter.frequency);

    var hum1 = ctx.createOscillator(); hum1.type = 'sawtooth'; hum1.frequency.value = 49;
    var hum2 = ctx.createOscillator(); hum2.type = 'triangle'; hum2.frequency.value = 98.6;
    var humFilter = ctx.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 180;
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    hum1.connect(humFilter); hum2.connect(humFilter); humFilter.connect(this.humGain); this.humGain.connect(this.master);

    air.start(); lfo.start(); hum1.start(); hum2.start();
    this.setActivity(this.activity);
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
    var t = this.ctx.currentTime;
    this.airGain.gain.setTargetAtTime(0.012 + 0.16 * level, t, 0.25);
    this.airFilter.frequency.setTargetAtTime(380 + 800 * level, t, 0.3);
    this.humGain.gain.setTargetAtTime(0.018 + 0.05 * level, t, 0.3);
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

  AudioEngine.prototype._noiseBurst = function (out, start, dur, gain, type, freq, q) {
    var ctx = this.ctx;
    var s = ctx.createBufferSource();
    s.buffer = this.noise;
    var f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(start, Math.random() * 1.5); s.stop(start + dur + 0.02);
  };

  /* Choque de bolas de plástico (kind 'ball') o contra la esfera (kind 'wall'). */
  AudioEngine.prototype.clack = function (intensity, pan, kind) {
    if (!this.ready()) return;
    var t = this.ctx.currentTime;
    if (t - this._windowStart > 0.1) { this._windowStart = t; this._clacksThisWindow = 0; }
    if (this._clacksThisWindow >= 4) return;
    this._clacksThisWindow++;
    var out = this._panner(pan);
    var v = Math.min(1, intensity);
    var start = t + Math.random() * 0.012;
    if (kind === 'wall') {
      var fw = 1500 + Math.random() * 700;
      this._tone(out, fw, start, 0.07 + v * 0.05, 0.05 * v + 0.01);
      this._tone(out, fw * 2.32, start, 0.04, 0.02 * v + 0.004);
      this._noiseBurst(out, start, 0.012, 0.06 * v, 'highpass', 2500);
    } else {
      var f = 2300 + Math.random() * 1500;
      this._tone(out, f, start, 0.025 + v * 0.025, 0.09 * v + 0.012);
      this._tone(out, f * 1.53, start, 0.018, 0.05 * v + 0.006);
      this._noiseBurst(out, start, 0.008, 0.12 * v + 0.02, 'bandpass', 4200, 1.2);
    }
  };

  /* Ascenso de la bola por el tubo: soplido que sube de tono y roces contra el tubo. */
  AudioEngine.prototype.tube = function (duration) {
    if (!this.ready()) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var s = ctx.createBufferSource(); s.buffer = this.noise;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + duration);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + duration * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.1);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + duration + 0.15);
    var out = this._panner(0.2);
    for (var i = 0; i < 4; i++) {
      var at = t + duration * (0.15 + i * 0.22) + Math.random() * 0.03;
      this._tone(out, 1700 + Math.random() * 500, at, 0.05, 0.035);
    }
  };

  /* La bola cae en la bandeja de salida. */
  AudioEngine.prototype.thunk = function () {
    if (!this.ready()) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.2);
    this._noiseBurst(this.master, t, 0.03, 0.18, 'lowpass', 1800);
    this._tone(this.master, 2900, t + 0.09, 0.03, 0.04);
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
