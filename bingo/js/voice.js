/* Locución de números con SpeechSynthesis, prefiriendo voces en español. */
(function (Bingo) {
  'use strict';

  var LANG_RANK = ['es-es', 'es-mx', 'es-us', 'es-419', 'es-ar', 'es-cl', 'es-co'];

  function Voice() {
    this.synth = window.speechSynthesis || null;
    this.supported = !!(this.synth && window.SpeechSynthesisUtterance);
    this.enabled = true;
    this.volume = 1;
    this.rate = 0.95;
    this.voices = [];
    this.voiceURI = '';
    this._current = null;
    this._onVoices = null;
    if (this.supported) {
      var self = this;
      this._load();
      if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', function () { self._load(); });
      else this.synth.onvoiceschanged = function () { self._load(); };
    }
  }

  Voice.prototype._load = function () {
    var all = [];
    try { all = this.synth.getVoices() || []; } catch (e) { all = []; }
    var es = all.filter(function (v) { return /^es([-_]|$)/i.test(v.lang); });
    function score(v) {
      var lang = v.lang.toLowerCase().replace('_', '-');
      var i = LANG_RANK.indexOf(lang);
      var s = i === -1 ? 20 : i;
      if (v.localService) s -= 0.5;
      if (/google|natural|neural|premium|enhanced/i.test(v.name)) s -= 3;
      return s;
    }
    es.sort(function (a, b) { return score(a) - score(b); });
    this.voices = es;
    this.fallbackVoices = all;
    if (this._onVoices) this._onVoices(this.voices);
  };

  Voice.prototype.onVoices = function (fn) { this._onVoices = fn; if (this.voices.length) fn(this.voices); };

  Voice.prototype._pick = function () {
    var list = this.voices, i;
    if (this.voiceURI) {
      for (i = 0; i < list.length; i++) if (list[i].voiceURI === this.voiceURI) return list[i];
    }
    if (list.length) return list[0];
    var fb = this.fallbackVoices || [];
    for (i = 0; i < fb.length; i++) if (fb[i]['default']) return fb[i];
    return fb[0] || null;
  };

  Voice.prototype.cancel = function () {
    if (!this.supported) return;
    if (this._current) { this._current.done(); this._current = null; }
    try { this.synth.cancel(); } catch (e) { /* motor de voz no disponible */ }
  };

  /* Devuelve una promesa que se resuelve al terminar la locución (o si falla).
     Nunca rechaza, para que el sorteo continúe aunque la voz no esté disponible. */
  Voice.prototype.say = function (text) {
    var self = this;
    if (!this.supported || !this.enabled || this.volume <= 0) return Promise.resolve(false);
    this.cancel();
    return new Promise(function (resolve) {
      var finished = false, timer = 0;
      var u = new window.SpeechSynthesisUtterance(text);
      var token = {
        done: function () {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (self._current === token) self._current = null;
          resolve(true);
        }
      };
      self._current = token;
      var v = self._pick();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'es-ES'; }
      u.volume = self.volume;
      u.rate = self.rate;
      u.pitch = 1;
      u.onend = token.done;
      u.onerror = token.done;
      // Algunos motores (Android/Chrome) no siempre emiten onend: límite de seguridad.
      timer = setTimeout(token.done, 1800 + text.length * 120 / self.rate);
      try {
        if (self.synth.paused) self.synth.resume();
        self.synth.speak(u);
      } catch (e) { token.done(); }
    });
  };

  Bingo.Voice = Voice;
})(window.Bingo = window.Bingo || {});
