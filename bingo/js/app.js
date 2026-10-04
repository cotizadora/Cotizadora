/* Controlador de la aplicación: modos manual/automático, interfaz, historial y ajustes. */
(function (Bingo) {
  'use strict';

  var STORE_KEY = 'tombola-bingo75';
  var $ = function (id) { return document.getElementById(id); };

  var STATUS = {
    ready: 'Lista',
    mixing: 'Mezclando',
    extracting: 'Extrayendo',
    announcing: 'Anunciando',
    paused: 'En pausa',
    over: 'Partida terminada'
  };

  /* ---------- Persistencia ---------- */

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ drawn: game.drawn, settings: settings }));
    } catch (e) { /* almacenamiento no disponible: la partida sigue en memoria */ }
  }

  var saved = load();
  var settings = Object.assign({
    sound: true, soundVol: 0.7,
    voice: true, voiceVol: 1, voiceRate: 0.95, voiceURI: '', phrases: true,
    interval: 5
  }, saved.settings || {});

  var game = new Bingo.Game(saved);
  var audio = new Bingo.AudioEngine();
  var voice = new Bingo.Voice();
  var reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(reducedQuery && reducedQuery.matches);

  audio.setEnabled(settings.sound);
  audio.setVolume(settings.soundVol);
  voice.enabled = settings.voice;
  voice.volume = settings.voiceVol;
  voice.rate = settings.voiceRate;
  voice.voiceURI = settings.voiceURI;

  var mode = 'manual';            // siempre manual al abrir
  var autoState = 'stopped';      // stopped | running | paused
  var busy = false;               // hay una extracción en curso
  var session = 0;                // invalida extracciones al reiniciar
  var countdown = { remaining: 0, deadline: 0, timer: 0, total: 0 };
  // Los choques solo suenan mientras la tómbola trabaja; en reposo hay silencio.
  var clatterUntil = 0;
  function clatter(seconds) { clatterUntil = Math.max(clatterUntil, performance.now() + seconds * 1000); }

  var tombola = new Bingo.Tombola($('tombola'), {
    reducedMotion: reduced,
    onSound: function (kind, a, b) {
      if (kind === 'air') audio.setActivity(a);
      else if (kind === 'tube') audio.tube(a);
      else if (kind === 'land') audio.thunk();
      else if (performance.now() < clatterUntil) audio.clack(a, b, kind);
    }
  });

  /* ---------- Tablero ---------- */

  var cells = [null];
  (function buildBoard() {
    var board = $('board');
    for (var c = 0; c < 5; c++) {
      var row = document.createElement('div');
      row.className = 'board-row';
      row.setAttribute('data-col', c);
      var head = document.createElement('span');
      head.className = 'board-letter';
      head.textContent = Bingo.LETTERS[c];
      head.setAttribute('aria-hidden', 'true');
      row.appendChild(head);
      for (var i = 1; i <= 15; i++) {
        var n = c * 15 + i;
        var cell = document.createElement('span');
        cell.className = 'cell';
        cell.textContent = n;
        cell.setAttribute('role', 'img');
        row.appendChild(cell);
        cells.push(cell);
      }
      board.appendChild(row);
    }
  })();

  function cellLabel(n, drawn) {
    return Bingo.letterFor(n) + ' ' + n + (drawn ? ', ya salió' : ', pendiente');
  }

  /* ---------- Render de la interfaz ---------- */

  function setStatus(key, extra) {
    var el = $('status');
    el.setAttribute('data-state', key);
    $('statusText').textContent = extra || STATUS[key];
  }

  function chip(n) {
    var s = document.createElement('span');
    s.className = 'chip';
    s.setAttribute('data-col', Bingo.columnFor(n));
    s.textContent = n;
    return s;
  }

  function showCurrent(n, kicker) {
    var cur = $('current');
    if (!n) {
      cur.setAttribute('data-col', '');
      $('curLetter').textContent = '·';
      $('curNum').textContent = '—';
      $('curKicker').textContent = 'Último número';
      $('curWord').textContent = 'Aún no ha salido ninguno';
      $('curPhrase').hidden = true;
      return;
    }
    cur.setAttribute('data-col', Bingo.columnFor(n));
    $('curLetter').textContent = Bingo.letterFor(n);
    $('curNum').textContent = n;
    $('curKicker').textContent = kicker;
    $('curWord').textContent = Bingo.capitalize(Bingo.numberToWords(n));
    var call = settings.phrases ? Bingo.callFor(n) : null;
    $('curPhrase').hidden = !call;
    $('curPhrase').textContent = call ? '«' + call.text + '»' : '';
    cur.classList.remove('pop');
    void cur.offsetWidth;
    cur.classList.add('pop');
  }

  /* Historial y contadores reflejan solo los números ya presentados en pantalla. */
  function renderHistory(upTo) {
    var list = game.drawn.slice(0, upTo);
    var last = list[list.length - 1];
    for (var n = 1; n <= Bingo.TOTAL; n++) {
      var drawn = list.indexOf(n) !== -1;
      cells[n].classList.toggle('on', drawn);
      cells[n].classList.toggle('last', n === last);
      cells[n].setAttribute('aria-label', cellLabel(n, drawn));
    }
    var recent = $('recent');
    recent.textContent = '';
    for (var i = list.length - 2; i >= Math.max(0, list.length - 6); i--) {
      var li = document.createElement('li');
      li.appendChild(chip(list[i]));
      li.setAttribute('aria-label', Bingo.letterFor(list[i]) + ' ' + list[i]);
      recent.appendChild(li);
    }
    var ol = $('orderList');
    ol.textContent = '';
    for (var k = 0; k < list.length; k++) {
      var item = document.createElement('li');
      if (k === list.length - 1) item.className = 'is-last';
      var pos = document.createElement('span');
      pos.className = 'order-pos';
      pos.textContent = (k + 1) + 'º';
      item.appendChild(pos);
      item.appendChild(chip(list[k]));
      item.setAttribute('aria-label', 'Bola ' + (k + 1) + ': ' + Bingo.letterFor(list[k]) + ' ' + list[k]);
      ol.appendChild(item);
    }
    $('orderEmpty').hidden = list.length > 0;
    $('cntDrawn').textContent = list.length;
    $('cntLeft').textContent = Bingo.TOTAL - list.length;
    $('progressBar').style.width = (list.length / Bingo.TOTAL * 100) + '%';
    $('tombola').setAttribute('aria-label', 'Tómbola transparente con ' + game.remaining() + ' bolas');
  }

  function updateControls() {
    var over = game.isOver();
    var draw = $('btnDraw');
    draw.disabled = busy || over;
    draw.setAttribute('aria-busy', busy ? 'true' : 'false');
    draw.textContent = over ? 'Partida terminada' : busy ? 'Sorteando…' : 'Sacar número';

    var start = $('btnAutoStart'), pause = $('btnAutoPause'), stop = $('btnAutoStop');
    start.hidden = autoState === 'running';
    pause.hidden = autoState !== 'running';
    start.textContent = autoState === 'paused' ? 'Reanudar' : 'Iniciar';
    start.disabled = over;
    stop.disabled = autoState === 'stopped';
    $('autoControls').setAttribute('data-state', autoState);
    renderCountdown();
  }

  function renderCountdown() {
    var txt = $('countdownText'), bar = $('countdownBar');
    var frac = 0;
    if (game.isOver()) txt.textContent = 'Se sortearon los 75 números';
    else if (autoState === 'stopped') txt.textContent = 'Detenido';
    else if (autoState === 'paused') {
      txt.textContent = busy ? 'Se pausará al terminar esta bola' : 'En pausa';
      frac = countdown.total ? 1 - countdown.remaining / countdown.total : 0;
    } else if (busy) txt.textContent = 'Sorteando…';
    else if (countdown.timer) {
      var left = Math.max(0, countdown.deadline - performance.now());
      txt.textContent = 'Siguiente número en ' + Math.ceil(left / 1000) + ' s';
      frac = countdown.total ? 1 - left / countdown.total : 0;
    } else txt.textContent = 'Preparando…';
    bar.style.width = (frac * 100) + '%';
  }

  /* ---------- Extracción (misma lógica para ambos modos) ---------- */

  function performDraw() {
    if (busy || game.isOver()) return;
    audio.unlock();
    busy = true;
    var token = session;
    voice.cancel();
    var n = game.drawNext();       // número decidido y retirado de los disponibles
    persist();
    setStatus('mixing');
    updateControls();
    clatter(30);
    var alive = function (ok) { return ok !== false && token === session; };

    tombola.mix(reduced ? 0.7 : 1.5).then(function (ok) {
      if (!alive(ok)) return false;
      setStatus('extracting');
      return tombola.extract(n);
    }).then(function (ok) {
      clatterUntil = 0;
      if (!alive(ok)) return false;
      return tombola.presentBall(n);
    }).then(function (ok) {
      if (!alive(ok)) return false;
      audio.chime();
      showCurrent(n, 'Bola ' + game.count() + ' de ' + Bingo.TOTAL);
      renderHistory(game.count());
      $('announcer').textContent = Bingo.letterFor(n) + ' ' + n;
      setStatus('announcing');
      var spoken = tombola.wait(0.35).then(function (w) {
        if (w === false || token !== session) return false;
        var call = settings.phrases ? Bingo.callFor(n) : null;
        return voice.say(call ? call.say : Bingo.numberToWords(n));
      });
      return Promise.all([spoken, tombola.wait(1.4)]).then(function (r) { return r[1]; });
    }).then(function (ok) {
      if (!alive(ok)) return false;
      return tombola.dismiss();
    }).then(function (ok) {
      if (!alive(ok)) return;
      busy = false;
      if (game.isOver()) { finishGame(); return; }
      if (mode === 'auto' && autoState === 'running') { setStatus('ready'); scheduleNext(); }
      else if (mode === 'auto' && autoState === 'paused') { setStatus('paused'); }
      else setStatus('ready');
      updateControls();
    });
  }

  function finishGame() {
    clearCountdown();
    autoState = 'stopped';
    setStatus('over');
    updateControls();
    audio.finale();
    voice.say('Fin de la partida. Salieron los setenta y cinco números.');
  }

  /* ---------- Modo automático ---------- */

  function clearCountdown() {
    if (countdown.timer) clearInterval(countdown.timer);
    countdown.timer = 0;
  }

  function runCountdown(ms) {
    clearCountdown();
    countdown.deadline = performance.now() + ms;
    countdown.timer = setInterval(function () {
      if (performance.now() >= countdown.deadline) {
        clearCountdown();
        countdown.remaining = 0;
        performDraw();
      }
      renderCountdown();
    }, 100);
    renderCountdown();
  }

  function scheduleNext() {
    countdown.total = settings.interval * 1000;
    countdown.remaining = countdown.total;
    runCountdown(countdown.remaining);
  }

  function autoStart() {
    if (game.isOver()) return;
    audio.unlock();
    var resuming = autoState === 'paused';
    autoState = 'running';
    if (!busy) {
      setStatus('ready');
      if (resuming && countdown.remaining > 0) runCountdown(countdown.remaining);
      else performDraw();
    }
    updateControls();
  }

  function autoPause() {
    if (autoState !== 'running') return;
    autoState = 'paused';
    if (countdown.timer) {
      countdown.remaining = Math.max(0, countdown.deadline - performance.now());
      clearCountdown();
    }
    if (!busy) setStatus('paused');
    updateControls();
  }

  function autoStop() {
    clearCountdown();
    countdown.remaining = 0;
    autoState = 'stopped';
    if (!busy && !game.isOver()) setStatus('ready');
    updateControls();
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    if (m === 'manual') autoStop();
    $('manualControls').hidden = m !== 'manual';
    $('autoControls').hidden = m !== 'auto';
    document.querySelector('input[name="mode"][value="' + m + '"]').checked = true;
    updateControls();
  }

  /* ---------- Nueva partida ---------- */

  function newGame() {
    session++;
    voice.cancel();
    clearCountdown();
    countdown.remaining = 0;
    autoState = 'stopped';
    busy = false;
    game.reset();
    persist();
    tombola.load(game.available.slice(), null, true);
    clatter(2.5);
    showCurrent(null);
    $('announcer').textContent = 'Nueva partida';
    renderHistory(0);
    setStatus('ready');
    updateControls();
  }

  function requestNewGame() {
    audio.unlock();
    var dlg = $('confirmNew');
    if (game.count() === 0 && !busy) { newGame(); return; }
    if (game.isOver() || typeof dlg.showModal !== 'function') {
      if (game.isOver() || window.confirm('¿Empezar una nueva partida? Se borrarán los números que ya salieron.')) newGame();
      return;
    }
    $('confirmText').textContent = 'Ya salieron ' + game.count() + ' números. Se borrará el historial y las 75 bolas volverán a la tómbola.';
    dlg.returnValue = '';
    dlg.showModal();
  }

  $('confirmNew').addEventListener('close', function () {
    if (this.returnValue === 'ok') newGame();
  });

  /* ---------- Ajustes ---------- */

  function syncToggles() {
    var bs = $('btnSound'), bv = $('btnVoice');
    bs.setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
    bs.setAttribute('aria-label', settings.sound ? 'Sonido activado' : 'Sonido desactivado');
    bv.setAttribute('aria-pressed', voice.supported && settings.voice ? 'true' : 'false');
    bv.setAttribute('aria-label', !voice.supported ? 'Voz no disponible en este navegador' : settings.voice ? 'Voz activada' : 'Voz desactivada');
    bv.disabled = !voice.supported;
    $('optSound').checked = settings.sound;
    $('optSoundVol').value = Math.round(settings.soundVol * 100);
    $('optVoice').checked = settings.voice;
    $('optVoice').disabled = !voice.supported;
    $('optVoiceVol').value = Math.round(settings.voiceVol * 100);
    $('optVoiceRate').value = Math.round(settings.voiceRate * 100);
  }

  function setSound(on) {
    settings.sound = on; audio.unlock(); audio.setEnabled(on); syncToggles(); persist();
  }
  function setVoice(on) {
    settings.voice = on; voice.enabled = on;
    if (!on) voice.cancel();
    syncToggles(); persist();
  }

  function fillVoices(list) {
    var sel = $('optVoiceName'), note = $('voiceNote');
    sel.textContent = '';
    var auto = document.createElement('option');
    auto.value = ''; auto.textContent = 'Automática (mejor voz en español)';
    sel.appendChild(auto);
    list.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.voiceURI; o.textContent = v.name + ' (' + v.lang + ')';
      sel.appendChild(o);
    });
    sel.value = list.some(function (v) { return v.voiceURI === settings.voiceURI; }) ? settings.voiceURI : '';
    if (!voice.supported) note.textContent = 'Este navegador no permite la lectura en voz alta. El sorteo funciona igual, solo en pantalla.';
    else if (!list.length) note.textContent = 'No se encontró una voz en español en este dispositivo; se usará la voz predeterminada.';
    else note.textContent = '';
  }

  voice.onVoices(fillVoices);
  fillVoices(voice.voices);

  $('btnSound').addEventListener('click', function () { setSound(!settings.sound); });
  $('btnVoice').addEventListener('click', function () { setVoice(!settings.voice); });
  $('btnSettings').addEventListener('click', function () {
    audio.unlock();
    var dlg = $('settings');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  });
  $('optSound').addEventListener('change', function () { setSound(this.checked); });
  $('optSoundVol').addEventListener('input', function () {
    settings.soundVol = this.value / 100; audio.setVolume(settings.soundVol); persist();
  });
  $('optVoice').addEventListener('change', function () { setVoice(this.checked); });
  $('optPhrases').checked = settings.phrases;
  $('optPhrases').addEventListener('change', function () {
    settings.phrases = this.checked; persist();
    if (game.last()) showCurrent(game.last(), $('curKicker').textContent);
  });
  $('optVoiceVol').addEventListener('input', function () { settings.voiceVol = this.value / 100; voice.volume = settings.voiceVol; persist(); });
  $('optVoiceRate').addEventListener('input', function () { settings.voiceRate = this.value / 100; voice.rate = settings.voiceRate; persist(); });
  $('optVoiceName').addEventListener('change', function () { settings.voiceURI = this.value; voice.voiceURI = this.value; persist(); });
  $('btnTestVoice').addEventListener('click', function () {
    if (busy) return;
    var wasOn = voice.enabled;
    voice.enabled = true;
    voice.say('Cuarenta y dos');
    voice.enabled = wasOn;
  });

  /* ---------- Controles ---------- */

  $('btnDraw').addEventListener('click', function () { if (mode === 'manual') performDraw(); });
  $('btnAutoStart').addEventListener('click', autoStart);
  $('btnAutoPause').addEventListener('click', autoPause);
  $('btnAutoStop').addEventListener('click', autoStop);
  $('btnNew').addEventListener('click', requestNewGame);
  $('btnNewTop').addEventListener('click', requestNewGame);

  /* En pantallas compactas el historial es un panel que se despliega desde abajo. */
  function setHistoryOpen(open) {
    document.body.classList.toggle('history-open', open);
    $('btnHistory').setAttribute('aria-expanded', open ? 'true' : 'false');
    $('historyBackdrop').hidden = !open;
    if (open) $('btnHistoryClose').focus();
    else if (document.activeElement && $('history').contains(document.activeElement)) $('btnHistory').focus();
  }
  $('btnHistory').addEventListener('click', function () { setHistoryOpen(true); });
  $('btnHistoryClose').addEventListener('click', function () { setHistoryOpen(false); });
  $('historyBackdrop').addEventListener('click', function () { setHistoryOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('history-open')) setHistoryOpen(false);
  });

  Array.prototype.forEach.call(document.querySelectorAll('input[name="mode"]'), function (r) {
    r.addEventListener('change', function () { if (this.checked) setMode(this.value); });
  });

  var interval = $('interval');
  interval.value = settings.interval;
  $('intervalOut').textContent = settings.interval + ' s';
  interval.addEventListener('input', function () {
    settings.interval = +this.value;
    $('intervalOut').textContent = settings.interval + ' s';
    persist();
  });

  function selectTab(which) {
    var board = which === 'board';
    $('tabBoard').setAttribute('aria-selected', board ? 'true' : 'false');
    $('tabOrder').setAttribute('aria-selected', board ? 'false' : 'true');
    $('tabBoard').tabIndex = board ? 0 : -1;
    $('tabOrder').tabIndex = board ? -1 : 0;
    $('board').hidden = !board;
    $('order').hidden = board;
  }
  $('tabBoard').addEventListener('click', function () { selectTab('board'); });
  $('tabOrder').addEventListener('click', function () { selectTab('order'); });
  $('tabBoard').parentNode.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var toOrder = $('tabBoard').getAttribute('aria-selected') === 'true';
    selectTab(toOrder ? 'order' : 'board');
    $(toOrder ? 'tabOrder' : 'tabBoard').focus();
    e.preventDefault();
  });

  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    var t = e.target;
    if (t && t !== document.body && /^(BUTTON|INPUT|SELECT|TEXTAREA|A|LABEL)$/.test(t.tagName)) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (mode === 'manual') performDraw();
    else if (autoState === 'running') autoPause();
    else autoStart();
  });

  // El primer gesto habilita audio y voz (restricciones de reproducción automática).
  ['pointerdown', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { audio.unlock(); }, { once: true, capture: true });
  });

  /* ---------- Ciclo de vida ---------- */

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      tombola.stop();
      audio.suspend();
      if (countdown.timer) {
        countdown.remaining = Math.max(0, countdown.deadline - performance.now());
        clearCountdown();
        countdown.frozen = true;
      }
    } else {
      if (!document.getElementById('intro')) tombola.start();
      audio.resume();
      if (countdown.frozen) {
        countdown.frozen = false;
        if (autoState === 'running' && !busy) runCountdown(countdown.remaining);
      }
    }
  });

  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { tombola.resize(); }, 60);
  }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe($('tombola').parentNode);
  else window.addEventListener('resize', onResize);

  if (reducedQuery) {
    var onReduced = function () {
      reduced = reducedQuery.matches;
      tombola.setReducedMotion(reduced);
    };
    if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onReduced);
    else if (reducedQuery.addListener) reducedQuery.addListener(onReduced);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { tombola.refreshSprites(); });
  }

  /* ---------- Arranque ---------- */

  tombola.load(game.available.slice(), game.last(), false);
  renderHistory(game.count());
  if (game.last()) showCurrent(game.last(), 'Bola ' + game.count() + ' de ' + Bingo.TOTAL);
  setStatus(game.isOver() ? 'over' : 'ready');
  syncToggles();
  updateControls();
  Bingo.initInstall();
  (Bingo.introDone || Promise.resolve()).then(function () { tombola.start(); });
})(window.Bingo);
