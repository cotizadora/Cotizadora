/* Instalación como aplicación (PWA): aviso de instalación que desaparece al detectar
   que la tómbola ya está instalada o abierta como aplicación. */
(function (Bingo) {
  'use strict';

  var FLAG = 'tombola-instalada';
  var DISMISS = 'tombola-aviso-cerrado';
  var $ = function (id) { return document.getElementById(id); };

  function store(kind, key, value) {
    try {
      var s = kind === 'session' ? sessionStorage : localStorage;
      if (value === undefined) return s.getItem(key);
      if (value === null) s.removeItem(key); else s.setItem(key, value);
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
  var isMobile = isIOS || /android|mobile/i.test(ua);

  var TEXT = {
    prompt: 'Instala la tómbola como app: pantalla completa y sin conexión.',
    ios: 'Instálala: en Safari toca Compartir y luego “Agregar a inicio”.',
    manual: 'Instálala: abre el menú ⋮ del navegador y elige “Instalar aplicación”.'
  };

  var mode = 'none';          // installed | prompt | ios | manual | none
  var deferred = null;

  function render() {
    var dismissed = store('session', DISMISS) === '1';
    var showBanner = (mode === 'prompt' || mode === 'ios' || mode === 'manual') && !dismissed;
    $('installBanner').hidden = !showBanner;
    $('installText').textContent = TEXT[mode] || '';
    $('btnInstall').hidden = mode !== 'prompt';

    var btn = $('btnInstallSettings'), note = $('installNote');
    btn.hidden = mode !== 'prompt';
    if (mode === 'installed') note.textContent = 'La tómbola ya está instalada en este dispositivo.';
    else if (mode === 'prompt') note.textContent = 'Agrégala a tu pantalla de inicio para abrirla como una app.';
    else if (mode === 'ios' || mode === 'manual') note.textContent = TEXT[mode];
    else if (!window.isSecureContext) note.textContent = 'La instalación está disponible cuando la tómbola se abre desde su dirección web (https).';
    else note.textContent = 'Este navegador no ofrece instalación de aplicaciones web. Prueba con Chrome, Edge o Safari.';
  }

  function setMode(m) { mode = m; render(); }

  function markInstalled() {
    store('local', FLAG, '1');
    deferred = null;
    setMode('installed');
  }

  function install() {
    if (!deferred) return;
    var ev = deferred;
    deferred = null;
    ev.prompt();
    ev.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') markInstalled();
      else setMode(isMobile ? 'manual' : 'none');
    }, function () { setMode(isMobile ? 'manual' : 'none'); });
  }

  Bingo.initInstall = function () {
    $('btnInstall').addEventListener('click', install);
    $('btnInstallSettings').addEventListener('click', install);
    $('btnInstallClose').addEventListener('click', function () {
      store('session', DISMISS, '1');
      render();
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      // Si el navegador ofrece instalar, la app no está instalada (pudo desinstalarse).
      store('local', FLAG, null);
      deferred = e;
      if (!isStandalone()) setMode('prompt');
    });
    window.addEventListener('appinstalled', markInstalled);
    if (window.matchMedia) {
      var mq = window.matchMedia('(display-mode: standalone)');
      var onChange = function () { if (mq.matches) markInstalled(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }

    if (isStandalone() || store('local', FLAG) === '1') { setMode('installed'); }
    else if (isIOS) { setMode('ios'); }
    else {
      render();
      // Sin evento de instalación: comprobar si ya está instalada antes de dar instrucciones.
      setTimeout(function () {
        if (mode !== 'none') return;
        var check = navigator.getInstalledRelatedApps ? navigator.getInstalledRelatedApps() : Promise.resolve([]);
        check.then(function (apps) {
          if (mode !== 'none') return;
          if (apps && apps.length) markInstalled();
          else if (isMobile && window.isSecureContext) setMode('manual');
        }, function () { if (mode === 'none' && isMobile && window.isSecureContext) setMode('manual'); });
      }, 3500);
    }

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo sin conexión */ });
      });
    }
  };
})(window.Bingo = window.Bingo || {});
