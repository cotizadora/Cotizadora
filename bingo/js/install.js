/* Instalación como aplicación (PWA).
   - Registra el service worker y captura el evento de instalación lo antes posible.
   - El botón Instalar usa el diálogo nativo del navegador, que crea una app real
     (WebAPK en Android), no un acceso directo.
   - El aviso desaparece al detectar la app instalada: al abrirse como app (modo
     standalone o desde su start_url), al instalarse (appinstalled) o porque el
     navegador informa que ya existe (getInstalledRelatedApps). La marca se guarda
     en el almacenamiento del sitio, que en Android comparten la app y el navegador. */
(function (Bingo) {
  'use strict';

  var FLAG = 'tombola-instalada';
  var DISMISS = 'tombola-aviso-cerrado-hasta';
  var DISMISS_DAYS = 30;
  var $ = function (id) { return document.getElementById(id); };

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) { return null; }
    return null;
  }

  function isStandalone() {
    var mm = window.matchMedia;
    return !!(navigator.standalone === true || (mm && (mm('(display-mode: standalone)').matches ||
      mm('(display-mode: fullscreen)').matches || mm('(display-mode: minimal-ui)').matches)));
  }

  var ua = navigator.userAgent;
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var isMobile = isIOS || isAndroid || /mobile/i.test(ua);
  // Navegadores de Android que solo crean accesos directos, no aplicaciones.
  var shortcutOnly = isAndroid && /firefox|fxios|miuibrowser|huaweibrowser|heytapbrowser|ucbrowser|vivobrowser/i.test(ua);
  var launchedAsApp = /[?&]app=1(&|$)/.test(location.search);

  var TEXT = {
    prompt: 'Instala la tómbola como aplicación: pantalla completa y sin conexión.',
    ios: 'Instálala: en Safari toca Compartir y luego “Agregar a inicio”.',
    manual: 'Instálala: menú ⋮ de Chrome → “Instalar aplicación”.',
    browser: 'Para instalarla como aplicación, abre esta página en Chrome.'
  };
  var NOTE = {
    installed: 'La tómbola ya está instalada en este dispositivo.',
    prompt: 'Se instalará como una aplicación de verdad: con su propio ícono, a pantalla completa y sin conexión.',
    ios: 'En Safari toca el botón Compartir y elige “Agregar a inicio”. Se abrirá a pantalla completa, como una app.',
    manual: 'En Chrome abre el menú ⋮ y elige “Instalar aplicación”. Si aparece “Agregar a pantalla principal”, elige “Instalar” y no “Crear acceso directo”, que solo abre el navegador.',
    browser: 'Este navegador solo crea accesos directos. Abre la página en Chrome para instalarla como aplicación.'
  };

  var mode = 'none';          // installed | prompt | ios | manual | browser | none
  var deferred = null;
  var ready = false;

  function dismissed() {
    var until = +store(DISMISS) || 0;
    return until > Date.now();
  }

  function render() {
    if (!ready) return;
    var showBanner = mode !== 'installed' && mode !== 'none' && !dismissed();
    $('installBanner').hidden = !showBanner;
    $('installText').textContent = TEXT[mode] || '';
    $('btnInstall').hidden = mode !== 'prompt';
    $('btnInstall').textContent = 'Instalar';

    $('btnInstallSettings').hidden = mode !== 'prompt';
    $('btnCopyLink').hidden = mode !== 'browser';
    var note = $('installNote');
    if (NOTE[mode]) note.textContent = NOTE[mode];
    else if (!window.isSecureContext) note.textContent = 'La instalación está disponible cuando la tómbola se abre desde su dirección web (https).';
    else note.textContent = 'Este navegador no ofrece instalación de aplicaciones web. Prueba con Chrome, Edge o Safari.';
  }

  function setMode(m) { mode = m; render(); }

  function markInstalled() {
    store(FLAG, '1');
    deferred = null;
    setMode('installed');
  }

  function fallbackMode() {
    if (isIOS) return 'ios';
    if (shortcutOnly) return 'browser';
    if (isMobile && window.isSecureContext) return 'manual';
    return 'none';
  }

  function install() {
    if (!deferred) return;
    var ev = deferred;
    deferred = null;
    ev.prompt();
    ev.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') markInstalled();
      else setMode(fallbackMode());
    }, function () { setMode(fallbackMode()); });
  }

  /* ---------- Lo que debe ocurrir de inmediato, antes de que cargue el resto ---------- */

  // El navegador avisa que se puede instalar: por lo tanto la app NO está instalada.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    store(FLAG, null);
    deferred = e;
    if (!isStandalone()) setMode('prompt');
  });
  window.addEventListener('appinstalled', markInstalled);

  if (isStandalone() || launchedAsApp) {
    store(FLAG, '1');
    mode = 'installed';
    if (launchedAsApp && history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo sin conexión */ });
  }

  /* ---------- Interfaz ---------- */

  Bingo.initInstall = function () {
    ready = true;
    $('btnInstall').addEventListener('click', install);
    $('btnInstallSettings').addEventListener('click', install);
    $('btnInstallClose').addEventListener('click', function () {
      store(DISMISS, String(Date.now() + DISMISS_DAYS * 864e5));
      render();
    });
    $('btnCopyLink').addEventListener('click', function () {
      var btn = this, url = location.origin + location.pathname;
      var done = function () { btn.textContent = 'Enlace copiado'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copia este enlace:', url); });
      else window.prompt('Copia este enlace:', url);
    });

    if (window.matchMedia) {
      var mq = window.matchMedia('(display-mode: standalone)');
      var onChange = function () { if (mq.matches) markInstalled(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }

    if (mode === 'installed' || mode === 'prompt') { render(); return; }
    if (store(FLAG) === '1') { setMode('installed'); return; }

    // ¿Ya está instalada? (Chrome lo informa aunque se abra desde el navegador.)
    var check = navigator.getInstalledRelatedApps ? navigator.getInstalledRelatedApps() : Promise.resolve([]);
    check.then(function (apps) {
      if (apps && apps.length) { markInstalled(); return; }
      if (mode === 'none') setMode(fallbackMode()); else render();
    }, function () { if (mode === 'none') setMode(fallbackMode()); });
  };
})(window.Bingo = window.Bingo || {});
