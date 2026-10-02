// bridge.js — Puente entre el popup y la pagina (mundo AISLADO: tiene chrome.*).
// Comparte el localStorage del origen Vicidial con el motor (content.js, mundo MAIN).
// Toda la UI vive en el popup; este puente solo lee/escribe estado y notifica.
(function () {
  'use strict';
  // Puede inyectarse además a mano en una pestaña ya abierta de Vicidial
  // (para no recargarla): una sola copia por página.
  // Al actualizar la extensión, la copia anterior queda desconectada
  // (chrome.runtime deja de responder): en ese caso esta copia la reemplaza.
  if (window.__VCA_BRIDGE_VIVO__ && window.__VCA_BRIDGE_VIVO__()) return;
  window.__VCA_BRIDGE_VIVO__ = function () { try { return !!chrome.runtime.id; } catch (e) { return false; } };

  const K = {
    states:   'vca_states',    // [{id,label,steps}]
    armed:    'vca2_armed',     // {id,label,steps,__armedAt} | null
    settings: 'vca_settings',
    learning: 'vca2_learning',  // {label,steps:[]} durante la grabacion
    callend:  'vca_callend',
    lastfire: 'vca_lastfire',
    armping:  'vca_armping'
  };

  function get(k, d) {
    try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
    catch (e) { return d; }
  }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function stepsOf(x) {
    if (!x) return [];
    if (x.steps && x.steps.length) return x.steps;
    if (x.desc) return [x.desc];
    return [];
  }
  function genId() {
    return 'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function notifyPage() { // refresca el motor / cierra menus si hiciera falta
    try { document.dispatchEvent(new CustomEvent('vca:cmd', { detail: { type: 'refresh' } })); } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  //  SEMBRAR CONFIGURACION POR DEFECTO (para distribuir ya configurada).
  //  Si el equipo instala la extension y aun no hay atajos guardados, se cargan
  //  desde el archivo empaquetado default-config.json.
  // ---------------------------------------------------------------------------
  // Clave de sitio ESTABLE: el host completo cambia según el servidor asignado
  // (cdn.s-br01a..., s-br02a...), así que agrupamos por dominio conocido.
  function siteKey(host) {
    if (/vicidial\.recaall\.simtastic\.cl/i.test(host || '')) return 'vicidial';
    if (/go\.bciseguros\.cl/i.test(host || '')) return 'go.bciseguros.cl';
    return host || '';
  }

  // GO Bci: sin cola. El ▶ aplica la tipificación en el momento y no deja
  // nada pendiente. Vicidial sí conserva la cola (espera a que corte la llamada).
  const IS_CRM = /go\.bciseguros\.cl/i.test(location.hostname || '');

  (async function seedDefaults() {
    try {
      if (localStorage.getItem(K.states) != null) return; // ya hay config del usuario
      const url = chrome.runtime.getURL('default-config.json');
      const cfg = await fetch(url).then(r => r.json()).catch(() => null);
      if (!cfg || !Array.isArray(cfg.states)) return;
      // SOLO los atajos de ESTE sitio: si no, Vicidial recibiría los del CRM
      // (y no funcionarían, porque sus elementos no existen aquí).
      const me = siteKey(location.hostname);
      const mine = cfg.states
        .filter(s => !s.site || siteKey(s.site) === me)
        .map(s => ({ id: s.id, label: s.label, steps: s.steps, color: s.color || '' }));
      if (mine.length) set(K.states, mine);
      if (cfg.settings && typeof cfg.settings === 'object') {
        set(K.settings, Object.assign(get(K.settings, {}), cfg.settings));
      }
      notifyPage();
    } catch (e) {}
  })();

  // ---------------------------------------------------------------------------
  //  API para el popup
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    try {
      switch (msg && msg.type) {
        case 'ping':
          reply({ ok: true });
          break;

        case 'getData':
          reply({
            states: get(K.states, []),
            armed: get(K.armed, null),
            learning: get(K.learning, null),
            settings: get(K.settings, {}),
            ka: get('vca_ka', null),      // estado del keep-alive de audio
            log: get('vca_log', []).slice(-40),  // registro del motor (para diagnóstico)
            engine: get('vca_engine', null)     // versión del motor que corre en la página
          });
          break;

        // --- Armar / desarmar (un solo clic en el ▶ del atajo) -----------------
        case 'arm': {
          // Un clic en ▶ = "ejecútalo ya, o en cuanto el control esté disponible".
          const st = get(K.states, []).find(x => x.id === msg.id);
          if (st) {
            set(K.armed, {
              id: st.id, label: st.label, steps: stepsOf(st),
              __armedAt: 0,      // sin espera mínima
              immediate: true    // no exigir el ciclo deshabilitado->habilitado
            });
            set(K.lastfire, 0);  // anular el cooldown para que dispare ya
            // CRM: aplicar EN EL ACTO y no dejar nada en cola. En Vicidial se
            // queda armado y el motor lo dispara al cortar la llamada.
            if (IS_CRM) {
              try { document.dispatchEvent(new CustomEvent('vca:cmd', { detail: { type: 'applynow' } })); } catch (e) {}
            }
          }
          set(K.armping, Date.now());
          reply({ ok: !!st, armed: get(K.armed, null) });
          break;
        }
        case 'disarm':
          del(K.armed);
          set(K.armping, Date.now());
          reply({ ok: true, armed: null });
          break;

        // --- Aplicar ya (opcional, para pruebas) ------------------------------
        case 'applynow': {
          const st = get(K.states, []).find(x => x.id === msg.id);
          if (st) set(K.armed, { id: st.id, label: st.label, steps: stepsOf(st), __armedAt: 0 });
          set(K.lastfire, 0);
          try { document.dispatchEvent(new CustomEvent('vca:cmd', { detail: { type: 'applynow' } })); } catch (e) {}
          set(K.callend, Date.now() + '|popup');
          reply({ ok: !!st });
          break;
        }

        // --- Grabacion de secuencia (grabar primero, nombrar al final) --------
        case 'learnStart':               // empieza a grabar YA, sin pedir nombre
          set(K.learning, { recording: true, steps: [], ts: Date.now() });
          notifyPage();
          reply({ ok: true });
          break;
        case 'learnStop': {              // deja de capturar; queda pendiente de nombrar
          const l = get(K.learning, null);
          if (l) { l.recording = false; set(K.learning, l); }
          reply({ ok: true, steps: l ? (l.steps || []).length : 0 });
          break;
        }
        case 'learnSave': {              // nombra y guarda la secuencia grabada
          const learn = get(K.learning, null);
          let ok = false;
          if (learn && learn.steps && learn.steps.length) {
            const states = get(K.states, []);
            const label = (msg.label && msg.label.trim()) || ('Atajo ' + (states.length + 1));
            states.push({ id: genId(), label: label, steps: learn.steps });
            set(K.states, states);
            ok = true;
          }
          del(K.learning);
          notifyPage();
          reply({ ok: ok });
          break;
        }
        case 'learnCancel':
          del(K.learning);
          notifyPage();
          reply({ ok: true });
          break;

        // --- Editar alias / borrar --------------------------------------------
        case 'rename': {
          const states = get(K.states, []);
          const st = states.find(x => x.id === msg.id);
          if (st) {
            st.label = msg.label;               // solo el alias visible
            set(K.states, states);
            const a = get(K.armed, null);
            if (a && a.id === msg.id) { a.label = msg.label; set(K.armed, a); }
          }
          reply({ ok: !!st });
          break;
        }
        case 'setColor': {
          const states = get(K.states, []);
          const st = states.find(x => x.id === msg.id);
          if (st) { st.color = msg.color || ''; set(K.states, states); }
          reply({ ok: !!st });
          break;
        }
        case 'reorderStates': {
          // Reordena SOLO los atajos cuyos ids vienen en msg.order, en ese orden,
          // ocupando las MISMAS posiciones que ya tenían (deja el resto intacto).
          // Así respeta el sub-orden por color sin descolocar a los demás.
          const states = get(K.states, []);
          const order = Array.isArray(msg.order) ? msg.order : [];
          const inOrder = {}; order.forEach(id => { inOrder[id] = true; });
          const byId = {}; states.forEach(s => { if (inOrder[s.id]) byId[s.id] = s; });
          const slots = [];
          states.forEach((s, i) => { if (inOrder[s.id]) slots.push(i); });
          slots.forEach((slot, k) => { if (byId[order[k]]) states[slot] = byId[order[k]]; });
          set(K.states, states);
          reply({ ok: true });
          break;
        }
        case 'deleteState': {
          const states = get(K.states, []).filter(x => x.id !== msg.id);
          set(K.states, states);
          const a = get(K.armed, null);
          if (a && a.id === msg.id) del(K.armed);
          reply({ ok: true });
          break;
        }

        // --- Ajustes ----------------------------------------------------------
        case 'setSetting':
          set(K.settings, Object.assign(get(K.settings, {}), msg.patch || {}));
          reply({ ok: true, settings: get(K.settings, {}) });
          break;

        // --- Importar / (exportar lo arma el popup con getData) ----------------
        case 'importConfig': {
          if (Array.isArray(msg.states)) set(K.states, msg.states);
          if (msg.settings && typeof msg.settings === 'object') {
            set(K.settings, Object.assign(get(K.settings, {}), msg.settings));
          }
          del(K.armed);
          notifyPage();
          reply({ ok: true });
          break;
        }

        // --- Panel flotante: el ícono lo muestra/oculta ----------------------
        case 'toggleFloat':
          if (window.__vcaFloatToggle) window.__vcaFloatToggle();
          reply({ ok: true });
          break;

        default:
          reply({ ok: false, error: 'tipo desconocido' });
      }
    } catch (e) {
      reply({ ok: false, error: String(e) });
    }
    return true; // respuesta sincrona ya enviada
  });
})();

// ===========================================================================
//  PANEL FLOTANTE dentro de la página (CAPA SUPERIOR).
//  Incrusta control.html en un iframe que flota por encima de TODO —incluida
//  cualquier otra extensión que dibuje sobre la página—, movible y minimizable.
//  Así el panel nunca queda tapado. Reusa el panel completo (con sus funciones).
// ===========================================================================
(function floatingPanel() {
  'use strict';
  // DESACTIVADO: volvimos al popup anclado al icono (default_popup), que se abre
  // pegado al icono y se adapta solo al contenido. El código queda por si más
  // adelante hace falta el panel incrustado a prueba de "otra extensión encima".
  const FLOAT_ENABLED = false;
  if (!FLOAT_ENABLED) return;

  const HOST_ID = 'vca-float-host';
  const POS_KEY = 'vca_float_pos2';      // {left, top} (v2: reinicia posición mal guardada)
  const STATE_KEY = 'vca_float_state';   // 'open' | 'min' | 'hidden'
  const W = 300, HEAD = 26;
  const HAS_POP = (typeof HTMLElement !== 'undefined') &&
                  (typeof HTMLElement.prototype.showPopover === 'function');

  let host, pill, frame;

  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const getState = () => { try { return localStorage.getItem(STATE_KEY) || 'open'; } catch (e) { return 'open'; } };
  const setState = (s) => { try { localStorage.setItem(STATE_KEY, s); } catch (e) {} };

  function css(el, s) { el.style.cssText = s; }

  function mkHeadBtn(txt, title) {
    const b = document.createElement('button');
    b.textContent = txt; b.title = title;
    css(b, 'all:unset;cursor:pointer;color:#fff;font-size:13px;line-height:1;padding:2px 6px;border-radius:5px');
    b.addEventListener('mouseenter', () => b.style.background = 'rgba(255,255,255,.22)');
    b.addEventListener('mouseleave', () => b.style.background = 'transparent');
    return b;
  }

  function showPop(el, show) {
    if (HAS_POP) { try { if (show) el.showPopover(); else el.hidePopover(); return; } catch (e) {} }
    el.style.display = show ? '' : 'none';
  }

  function applyPos() {
    const p = lsGet(POS_KEY, null);
    let left = p ? p.left : Math.max(8, window.innerWidth - W - 24);
    let top = p ? p.top : 84;
    left = Math.min(Math.max(0, left), Math.max(0, window.innerWidth - 60));
    top = Math.min(Math.max(0, top), Math.max(0, window.innerHeight - 40));
    // OJO: 'inset' es atajo de top/right/bottom/left; si se pone DESPUÉS de
    // left/top los borra (dejaba el panel pegado arriba-izquierda). Va PRIMERO.
    for (const el of [host, pill]) { el.style.inset = 'auto'; el.style.left = left + 'px'; el.style.top = top + 'px'; }
  }

  function setMode(mode) {
    setState(mode);
    if (mode === 'open') { showPop(pill, false); showPop(host, true); }
    else if (mode === 'min') { showPop(host, false); showPop(pill, true); }
    else { showPop(host, false); showPop(pill, false); }
  }

  function toggle() { setMode(getState() === 'open' ? 'hidden' : 'open'); }
  window.__vcaFloatToggle = toggle;

  function dragify(handle, moving) {
    let sx, sy, sl, st, on = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      on = true; sx = e.clientX; sy = e.clientY;
      const r = host.getBoundingClientRect(); sl = r.left; st = r.top;
      try { handle.setPointerCapture(e.pointerId); } catch (e2) {}
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!on) return;
      let l = Math.min(Math.max(0, sl + (e.clientX - sx)), window.innerWidth - 60);
      let t = Math.min(Math.max(0, st + (e.clientY - sy)), window.innerHeight - 30);
      for (const el of moving) { el.style.inset = 'auto'; el.style.left = l + 'px'; el.style.top = t + 'px'; }
    });
    const end = () => { if (!on) return; on = false; const r = host.getBoundingClientRect(); lsSet(POS_KEY, { left: r.left, top: r.top }); };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function build() {
    if (document.getElementById(HOST_ID)) return;

    host = document.createElement('div');
    host.id = HOST_ID;
    if (HAS_POP) host.setAttribute('popover', 'manual');   // capa superior real
    css(host, 'position:fixed;margin:0;padding:0;border:0;width:' + W + 'px;z-index:2147483647;' +
             'background:transparent;box-sizing:border-box;' +
             'filter:drop-shadow(0 10px 26px rgba(0,0,0,.38))');

    const head = document.createElement('div');
    css(head, 'display:flex;align-items:center;gap:6px;height:' + HEAD + 'px;padding:0 4px 0 8px;' +
             'background:#0d3b66;color:#fff;cursor:move;border-radius:10px 10px 0 0;' +
             'user-select:none;font:600 12px system-ui,"Segoe UI",Arial,sans-serif;box-sizing:border-box');
    const title = document.createElement('span');
    title.textContent = '⚡ ShortCut-Vicidial-GO v' + chrome.runtime.getManifest().version;
    css(title, 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    const bMin = mkHeadBtn('—', 'Minimizar');
    const bClose = mkHeadBtn('✕', 'Ocultar (reábrelo con el ícono de la extensión)');
    head.append(title, bMin, bClose);

    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('control.html') + '?embed=1';
    // Altura inicial modesta; se AJUSTA al contenido real (sin scroll) cuando
    // control.js (dentro del iframe) nos avisa su alto por postMessage.
    css(frame, 'display:block;width:' + W + 'px;height:340px;border:0;' +
              'border-radius:0 0 10px 10px;background:#fff;box-shadow:none');

    host.append(head, frame);
    document.documentElement.appendChild(host);

    pill = document.createElement('div');
    pill.id = 'vca-float-pill';
    if (HAS_POP) pill.setAttribute('popover', 'manual');
    css(pill, 'position:fixed;margin:0;z-index:2147483647;cursor:pointer;' +
             'background:#0d3b66;color:#fff;padding:6px 12px;border-radius:20px;' +
             'font:600 12px system-ui,"Segoe UI",Arial,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35);user-select:none');
    pill.textContent = '⚡ Atajos';
    document.documentElement.appendChild(pill);

    bMin.addEventListener('click', () => setMode('min'));
    bClose.addEventListener('click', () => setMode('hidden'));
    pill.addEventListener('click', () => setMode('open'));
    dragify(head, [host, pill]);

    applyPos();
    setMode(getState());
    window.addEventListener('resize', applyPos);

    // El iframe (control.js) nos avisa su alto real -> ajustamos para NO tener
    // scroll y que el panel quede compacto (tope 90% del alto de la ventana).
    window.addEventListener('message', (e) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const h = e.data && e.data.__vcaHeight;
      if (typeof h === 'number' && h > 0) {
        frame.style.height = Math.max(120, Math.min(Math.ceil(h), Math.round(window.innerHeight * 0.9))) + 'px';
      }
    });

    // Reafirmar la capa superior cada 2 s: si otra extensión también usa la capa
    // superior, al re-mostrar quedamos NOSOTROS encima.
    setInterval(() => {
      if (!HAS_POP) return;
      if (document.activeElement === frame) return;   // no interrumpir si estás usando el panel
      const s = getState();
      try {
        if (s === 'open') { host.hidePopover(); host.showPopover(); }
        else if (s === 'min') { pill.hidePopover(); pill.showPopover(); }
      } catch (e) {}
    }, 2500);
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
