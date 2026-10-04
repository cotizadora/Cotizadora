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

  /* Frases del bingo chileno. Solo se incluyen las que aparecen documentadas en fuentes
     chilenas; los demás números se cantan sin frase.
     - "Solito" para los números de una cifra: Club Manquehue, "¡Solito el 1! Vuelve el bingo
       a nuestra tradicional fiesta" (clubmanquehue.cl, 2024); The Clinic, "Fiebre de bingo por
       la noche" (theclinic.cl, 2025): "¡Solito, solito el 6!".
     - 22, "Par de patos": Típico Chileno, "Los bingos solidarios" (tipicochileno.cl);
       Diccionario de chilenismos de Apocatastasis ("Par de patos: veintidós"). */
  function callFor(n) {
    if (n >= 1 && n <= 9) {
      var s = 'Solito, el ' + UNITS[n];
      return { text: s, say: s };
    }
    if (n === 22) return { text: 'Par de patos', say: 'Veintidós. ¡Par de patos!' };
    // Frases indicadas por Sofía Valentina y Eduardo.
    if (n === 11) return { text: '…mmm, entonces', say: 'Once… mmm… ¡entonces!' };
    if (n === 13) return { text: '¿Qué te parece?', say: 'Trece, ¿qué te parece?' };
    if (n === 14) return { text: 'Caga torcido', say: 'Catorce, ¡caga torcido!' };
    if (n === 33) return { text: 'La edad de Cristo', say: 'La edad de Cristo… ¡treinta y tres!' };
    if (n === 69) return { text: 'El año en que no nos vimos las caras', say: 'El año en que no nos vimos las caras… … ¡sesenta y nueve!' };
    return null;
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
  Bingo.callFor = callFor;
  Bingo.capitalize = capitalize;
  Bingo.letterFor = letterFor;
  Bingo.columnFor = columnFor;
  Bingo.secureRandomInt = secureRandomInt;
  Bingo.Game = Game;
})(window.Bingo = window.Bingo || {});
