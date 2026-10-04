/* Lógica del sorteo: números, aleatoriedad criptográfica y estado de la partida. */
(function (Bingo) {
  'use strict';

  var TOTAL = 75;
  var LETTERS = ['B', 'I', 'N', 'G', 'O'];

  var UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
    'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
    'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  var TENS = { 3: 'treinta', 4: 'cuarenta', 5: 'cincuenta', 6: 'sesenta', 7: 'setenta' };

  function numberToWords(n) {
    if (n < 30) return UNITS[n];
    var t = Math.floor(n / 10), u = n % 10;
    return u === 0 ? TENS[t] : TENS[t] + ' y ' + UNITS[u];
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function letterFor(n) { return LETTERS[Math.floor((n - 1) / 15)]; }
  function columnFor(n) { return Math.floor((n - 1) / 15); }

  /* Entero uniforme en [0, max) sin sesgo de módulo (muestreo por rechazo). */
  function secureRandomInt(max) {
    var c = window.crypto || window.msCrypto;
    if (!c || !c.getRandomValues) throw new Error('crypto.getRandomValues no está disponible');
    var buf = new Uint32Array(1);
    var limit = Math.floor(0x100000000 / max) * max;
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  }

  function Game(saved) {
    this.reset();
    if (saved && Array.isArray(saved.drawn)) this._restore(saved.drawn);
  }

  Game.prototype.reset = function () {
    this.available = [];
    for (var i = 1; i <= TOTAL; i++) this.available.push(i);
    this.drawn = [];
  };

  Game.prototype._restore = function (list) {
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (n !== (n | 0) || n < 1 || n > TOTAL || seen[n]) continue;
      seen[n] = true;
      this.drawn.push(n);
    }
    this.available = this.available.filter(function (n) { return !seen[n]; });
  };

  /* Selecciona y confirma un número: se elimina de los disponibles en el mismo paso. */
  Game.prototype.drawNext = function () {
    if (this.available.length === 0) return null;
    var idx = secureRandomInt(this.available.length);
    var n = this.available[idx];
    this.available.splice(idx, 1);
    this.drawn.push(n);
    return n;
  };

  Game.prototype.isDrawn = function (n) { return this.drawn.indexOf(n) !== -1; };
  Game.prototype.count = function () { return this.drawn.length; };
  Game.prototype.remaining = function () { return this.available.length; };
  Game.prototype.isOver = function () { return this.available.length === 0; };
  Game.prototype.last = function () { return this.drawn.length ? this.drawn[this.drawn.length - 1] : null; };

  Bingo.TOTAL = TOTAL;
  Bingo.LETTERS = LETTERS;
  Bingo.numberToWords = numberToWords;
  Bingo.capitalize = capitalize;
  Bingo.letterFor = letterFor;
  Bingo.columnFor = columnFor;
  Bingo.secureRandomInt = secureRandomInt;
  Bingo.Game = Game;
})(window.Bingo = window.Bingo || {});
