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
  // El Cotizador Dental (otra extensión) busca aquí a ShortCut para pedirle
  // que ejecute un flujo de GO.
  try { localStorage.setItem('vca_ext_id', chrome.runtime.id); } catch (e) {}

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
    if (k === K.learning) return sanear(getCrudo(k, d));
    return getCrudo(k, d);
  }
  function getCrudo(k, d) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) return JSON.parse(v);
    } catch (e) { return d; }
    // La web borró su localStorage: lo respaldado en la extensión sirve igual
    if (respaldo && k === 'vca_states' && Array.isArray(respaldo.states)) return respaldo.states;
    if (respaldo && k === 'vca2_learning' && respaldo.learning) return respaldo.learning;
    return d;
  }

  // MARCAS DE FIN DE GRABACIÓN. Una grabación se identifica por su `ts` (hora
  // de inicio). Al detenerla, guardarla o descartarla se anota aquí, en la
  // página (la ven al instante todas las pestañas de ese sitio) y en la
  // extensión (por si la web borra sus datos). Así, una copia vieja que quedó
  // en otra pestaña (Chrome duerme las pestañas de atrás), en la memoria del
  // motor o en el respaldo NUNCA puede revivir la grabación: antes reaparecía
  // "Grabando…" una y otra vez.
  const MK = 'vca_learn_marcas';
  let marcas = { stop: 0, fin: 0 };
  function leerMarcas(extra) {
    let l = null;
    try { l = JSON.parse(localStorage.getItem(MK) || 'null'); } catch (e) {}
    const n = { stop: Math.max(marcas.stop, (l && l.stop) || 0, (extra && extra.stop) || 0),
                fin: Math.max(marcas.fin, (l && l.fin) || 0, (extra && extra.fin) || 0) };
    marcas = n;
    if (!l || l.stop !== n.stop || l.fin !== n.fin) { try { localStorage.setItem(MK, JSON.stringify(n)); } catch (e) {} }
    return n;
  }
  function marcar(tipo, ts) {
    const m = leerMarcas();
    ts = ts || Date.now();
    if (ts > m[tipo]) m[tipo] = ts;
    if (m.fin > m.stop) m.stop = m.fin;
    try { localStorage.setItem(MK, JSON.stringify(m)); } catch (e) {}
    try { chrome.storage.local.set({ [SK + ':marcas']: m }); } catch (e) {}
  }
  // La grabación tal como vale hoy: null si ya terminó; detenida si se detuvo.
  function sanear(l) {
    if (!l) return l;
    const m = leerMarcas();
    const ts = l.ts || 0;
    if (m.fin && ts <= m.fin) return null;
    if (l.recording && m.stop && ts <= m.stop) return Object.assign({}, l, { recording: false });
    return l;
  }
  function set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    // Hora del último cambio de la lista de atajos: decide qué lista vale si el
    // panel la cambió en el respaldo mientras esta página estaba cerrada.
    if (k === 'vca_states') { try { localStorage.setItem('vca_states_t', String(Date.now())); } catch (e) {} }
    if (k === 'vca_states' || k === 'vca2_learning') respaldar();
  }
  let sembrado = false;   // hasta leer el respaldo no se escribe encima de él
  // RESPALDO en la extensión (chrome.storage), por sitio: los atajos y la
  // grabación en curso. Si la web borra su localStorage (GO puede hacerlo),
  // se reponen desde aquí: no se pierden ni los atajos ni los clics grabados.
  const SK = 'vcaSitio:' + (function (h) {
    if (/vicidial\.recaall\.simtastic\.cl/i.test(h || '')) return 'vicidial';
    if (/go\.bciseguros\.cl/i.test(h || '')) return 'go.bciseguros.cl';
    return h || '';
  })(location.hostname);
  let respaldo = null, repuestos = 0;
  // Lo que hay de verdad en la página (sin caer en el respaldo)
  function crudo(k) { try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function respaldar() {
    if (!sembrado) return;
    const st = crudo('vca_states');
    respaldo = {
      // si la web borró los atajos, se conserva el respaldo anterior
      states: st != null ? st : (respaldo ? respaldo.states : null),
      statesT: st != null ? (Number(crudo('vca_states_t')) || 0) : (respaldo ? respaldo.statesT || 0 : 0),
      // la grabación se toma tal cual: si se descartó o guardó, queda vacía
      learning: sanear(crudo('vca2_learning')),
      t: Date.now()
    };
    try { chrome.storage.local.set({ [SK]: respaldo }); } catch (e) {}
  }
  // El motor avisa cada paso grabado: el respaldo queda siempre al día
  document.addEventListener('vca:learn', (ev) => {
    try {
      const l = sanear(JSON.parse(ev.detail));
      if (!l) return;
      respaldo = Object.assign({}, respaldo || {}, { learning: l, t: Date.now() });
      if (respaldo.states == null) respaldo.states = get('vca_states', null);
      chrome.storage.local.set({ [SK]: respaldo });
    } catch (e) {}
  });
  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch[SK + ':marcas'] && ch[SK + ':marcas'].newValue) leerMarcas(ch[SK + ':marcas'].newValue);
    });
  } catch (e) {}
  function reponer() {
    if (!respaldo) return;
    let cambio = false;
    if (localStorage.getItem('vca_states') == null && Array.isArray(respaldo.states) && respaldo.states.length) {
      localStorage.setItem('vca_states', JSON.stringify(respaldo.states)); cambio = true;
    }
    // La grabación se repone en curso o detenida con pasos (pendiente de nombre).
    // Una grabación detenida SIN pasos no sirve: no se repone (se descarta).
    const rl0 = respaldo.learning, rl = sanear(rl0);
    if (rl !== rl0) { respaldo.learning = rl; try { chrome.storage.local.set({ [SK]: respaldo }); } catch (e) {} }
    if (rl && !rl.recording && !(rl.steps || []).length) { respaldo.learning = null; try { chrome.storage.local.set({ [SK]: respaldo }); } catch (e) {} }
    if (localStorage.getItem('vca2_learning') == null && respaldo.learning) {
      localStorage.setItem('vca2_learning', JSON.stringify(respaldo.learning)); cambio = true;
    }
    if (cambio) { repuestos++; notifyPage(); }
  }
  // Cada medio segundo: reponer lo borrado o, si la página sumó pasos, respaldarlos
  setInterval(() => {
    try {
      if (!chrome.runtime.id) return;
      // Una grabación ya terminada que alguien repuso en la página: fuera.
      const lc = crudo(K.learning), ls = sanear(lc);
      if (lc && !ls) del(K.learning);
      else if (lc && ls !== lc) localStorage.setItem(K.learning, JSON.stringify(ls));
      reponer();
      const l = localStorage.getItem('vca2_learning'), st = localStorage.getItem('vca_states');
      const firma = (l || '') + '|' + (st || '');
      if (firma !== reponer.firma) { reponer.firma = firma; if (l != null || st != null) respaldar(); }
    } catch (e) {}
  }, 500);
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
  const IS_CRM = /(^|\.)bciseguros\.cl$/i.test(location.hostname || '');

  (async function seedDefaults() {
    try {
      // Primero el respaldo de la extensión (por si la web borró sus datos)
      const todo = await new Promise(r => { try { chrome.storage.local.get([SK, SK + ':marcas'], x => r(x || {})); } catch (e) { r({}); } });
      leerMarcas(todo[SK + ':marcas']);
      const g = todo[SK];
      if (g) {
        respaldo = g;
        // El panel borró o cambió atajos mientras esta página estaba cerrada:
        // su lista (más nueva) reemplaza a la que quedó en la página.
        const tLocal = Number(crudo('vca_states_t')) || 0;
        if (Array.isArray(g.states) && (g.statesT || 0) > tLocal) {
          try { localStorage.setItem(K.states, JSON.stringify(g.states)); localStorage.setItem('vca_states_t', String(g.statesT)); } catch (e) {}
        }
        reponer();
      }
      sembrado = true;
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
    } catch (e) { sembrado = true; }
  })();

  // ---------------------------------------------------------------------------
  //  API para el popup
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  //  GRABACIÓN QUE CRUZA PÁGINAS. El panel anota en la extensión que se está
  //  grabando ({ts, on}). Una página que se abre después (otra pestaña, el
  //  multicotizador, la página siguiente a "Ingresar") se suma sola.
  // ---------------------------------------------------------------------------
  function sumarseAGrabacion(g) {
    try {
      if (!g || !g.ts || Date.now() - g.ts > 45 * 60 * 1000) return;
      const l = crudo(K.learning);
      if (g.on) {
        if (leerMarcas().fin >= g.ts) return;                  // ya se guardó o descartó
        if (l && l.ts === g.ts) return;                        // ya está grabando
        set(K.learning, { recording: true, steps: [], ts: g.ts });
        try { document.dispatchEvent(new CustomEvent('vca:learn-estado', { detail: localStorage.getItem(K.learning) })); } catch (e) {}
        notifyPage();
      } else if (l && l.recording && l.ts === g.ts) {          // se detuvo desde el panel
        marcar('stop', l.ts); l.recording = false; set(K.learning, l);
        try { document.dispatchEvent(new CustomEvent('vca:learn-estado', { detail: JSON.stringify(l) })); } catch (e) {}
      }
    } catch (e) {}
  }
  try {
    chrome.storage.local.get('vcaGrab', (r) => sumarseAGrabacion(r && r.vcaGrab));
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.vcaGrab) sumarseAGrabacion(ch.vcaGrab.newValue); });
  } catch (e) {}

  // El motor avisa "voy en el paso N" antes de cada clic: queda en la extensión.
  document.addEventListener('vca:pendiente', (ev) => {
    try { const d = JSON.parse(ev.detail); chrome.runtime.sendMessage({ type: 'pendiente', op: d.op, data: d.data }); } catch (e) {}
  });
  // Ventana nueva que Chrome bloqueó durante un atajo: la abre la extensión.
  document.addEventListener('vca:abrir', (ev) => {
    try { chrome.runtime.sendMessage({ type: 'abrirUrl', url: String(ev.detail || '') }); } catch (e) {}
  });
  // Al cargar la página: ¿quedó un atajo a medias que sigue aquí?
  function preguntarPendiente() {
    try {
      chrome.runtime.sendMessage({ type: 'pendienteTomar', sitio: siteKey(location.hostname) }, (r) => {
        if (chrome.runtime.lastError || !r || !r.data) return;
        try { document.dispatchEvent(new CustomEvent('vca:cmd', { detail: { type: 'continuar', data: r.data } })); } catch (e) {}
      });
    } catch (e) {}
  }
  if (document.readyState === 'complete') setTimeout(preguntarPendiente, 300);
  else window.addEventListener('load', () => setTimeout(preguntarPendiente, 300), { once: true });

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    try {
      switch (msg && msg.type) {
        case 'ping':
          reply({ ok: true });
          break;

        case 'getData': {
          // Grabación detenida sin ningún paso: se descarta sola (no deja el
          // cuadro "No se capturó ningún clic" pegado ni bloquea Grabar).
          const lv = get(K.learning, null);
          if (lv && !lv.recording && !(lv.steps || []).length) { del(K.learning); respaldar(); }
          reply({
            states: get(K.states, []),
            armed: get(K.armed, null),
            learning: get(K.learning, null),
            settings: get(K.settings, {}),
            ka: get('vca_ka', null),      // estado del keep-alive de audio
            log: get('vca_log', []).slice(-40),  // registro del motor (para diagnóstico)
            repuestos: repuestos,               // veces que se repuso lo que borró la web
            engine: get('vca_motor', null),     // versión del motor que corre en la página
            fallo: get('vca_fallo', null)       // GO: último atajo que no se pudo completar
          });
          break;
        }

        // --- Armar / desarmar (un solo clic en el ▶ del atajo) -----------------
        case 'arm': {
          // Un clic en ▶ = "ejecútalo ya, o en cuanto el control esté disponible".
          const st = get(K.states, []).find(x => x.id === msg.id);
          del('vca_fallo');
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
          // Todas las páginas graban con la MISMA marca de inicio (la da el panel),
          // para juntar después los pasos de GO, del multicotizador, etc.
          set(K.learning, { recording: true, steps: [], ts: Math.max(msg.ts || Date.now(), leerMarcas().fin + 1) });
          try { document.dispatchEvent(new CustomEvent('vca:learn-estado', { detail: localStorage.getItem(K.learning) })); } catch (e) {}
          notifyPage();
          reply({ ok: true });
          break;
        case 'learnStop': {              // deja de capturar; queda pendiente de nombrar
          const l = get(K.learning, null);
          if (l) { marcar('stop', l.ts); l.recording = false; set(K.learning, l); }
          try { document.dispatchEvent(new CustomEvent('vca:learn-estado', { detail: l ? JSON.stringify(l) : '' })); } catch (e) {}
          reply({ ok: true, steps: l ? (l.steps || []).length : 0 });
          break;
        }
        case 'learnSave': {              // nombra y guarda la secuencia grabada
          try { document.dispatchEvent(new CustomEvent('vca:cmd', { detail: { type: 'learnReset' } })); } catch (e) {}
          const learn = get(K.learning, null);
          marcar('fin', Math.max((learn && learn.ts) || 0, msg.ts || 0));
          // El panel manda los pasos de TODAS las páginas ya juntos y en orden.
          const pasos = Array.isArray(msg.steps) && msg.steps.length ? msg.steps : (learn && learn.steps) || [];
          let ok = false;
          if (pasos.length) {
            const states = get(K.states, []);
            const label = (msg.label && msg.label.trim()) || ('Atajo ' + (states.length + 1));
            // Mismo nombre que uno existente: lo REEMPLAZA (conserva su id, color
            // y lugar; el cotizador lo sigue reconociendo como el mismo atajo).
            const norma = (t) => String(t || '').trim().toLowerCase();
            const previo = states.find(x => norma(x.label) === norma(label));
            if (previo) { previo.steps = pasos; previo.label = label; }
            else states.push({ id: genId(), label: label, steps: pasos });
            set(K.states, states);
            ok = previo ? 'reemplazado' : true;
          }
          del(K.learning);
          respaldar();
          notifyPage();
          reply({ ok: ok });
          break;
        }
        case 'learnCancel': {
          try { document.dispatchEvent(new CustomEvent('vca:cmd', { detail: { type: 'learnReset' } })); } catch (e) {}
          const lx = getCrudo(K.learning, null);
          marcar('fin', Math.max((lx && lx.ts) || 0, Date.now()));
          del(K.learning);
          respaldar();
          notifyPage();
          reply({ ok: true });
          break;
        }

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

// ===========================================================================
//  RUT DEL CLIENTE: de Vicidial a GO
//  En Vicidial se lee el cliente en pantalla (también la pestaña FORM, que es
//  un marco del mismo sitio) y se deja en chrome.storage. En GO se copia a su
//  localStorage, donde el motor lo usa para los pasos "RUT del cliente".
// ===========================================================================
(function rutDelCliente() {
  'use strict';
  // Una copia viva por página: si la anterior quedó desconectada al
  // actualizar la extensión, ésta la reemplaza (y vuelve a leer el RUT).
  if (window.__VCA_RUT_VIVO__ && window.__VCA_RUT_VIVO__()) return;
  const host = location.hostname || '';
  const vivo = () => { try { return !!chrome.runtime.id; } catch (e) { return false; } };
  window.__VCA_RUT_VIVO__ = vivo;

  function dvDe(num) {
    let s = 0, m = 2;
    for (let i = num.length - 1; i >= 0; i--) { s += Number(num[i]) * m; m = m === 7 ? 2 : m + 1; }
    const r = 11 - (s % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }
  function puntos(num) { return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  if (/vicidial\.recaall\.simtastic\.cl/i.test(host)) {
    function campos() {
      const c = {};
      const leer = (doc) => {
        if (!doc) return;
        doc.querySelectorAll('input, select, textarea').forEach((e) => {
          const k = String(e.name || e.id || '').toLowerCase();
          const v = String(e.value || '').trim();
          // Un "0" vacío se ignora, salvo en el DV: el dígito verificador 0 es válido.
          if (k && v && (v !== '0' || /^dv\d*$/.test(k)) && !c[k]) c[k] = v;
        });
        doc.querySelectorAll('iframe, frame').forEach((f) => { try { leer(f.contentDocument); } catch (e) {} });
      };
      leer(document);
      return c;
    }
    let ultimo = '';
    function publicar() {
      if (!vivo()) return;
      const c = campos();
      let num = '', dv = '';
      // Misma regla que el Cotizador Dental: si viene el DV aparte (aunque sea
      // 0) se usa tal cual. Si no, 9 caracteres ya traen el DV al final
      // (107038973 = 10.703.897-3); con 8 sólo se separa si ese último dígito
      // cuadra con el módulo 11, si no los 8 son el número (12780633-0).
      const crudo = c.rut || c.vendor_lead_code || '';
      const limpio = String(crudo).toUpperCase().replace(/[^0-9K]/g, '');
      dv = c.rut ? String(c.dv || '').toUpperCase().replace(/[^0-9K]/g, '') : '';
      num = limpio;
      if (!dv && (limpio.length > 8 || /K$/.test(limpio) ||
          (limpio.length === 8 && dvDe(limpio.slice(0, -1)) === limpio.slice(-1)))) {
        num = limpio.slice(0, -1); dv = limpio.slice(-1);
      }
      num = num.replace(/K/g, '');
      if (num.length < 6 || num.length > 8) return;
      if (!dv) dv = dvDe(num);
      const nombre = [c.nombres || c.first_name || '', c.apellido_pat || c.last_name || ''].join(' ').replace(/\s+/g, ' ').trim();
      const dato = { num: num, dv: dv, rut: puntos(num) + '-' + dv, nombre: nombre, lead: c.lead_id || '', t: Date.now() };
      const firma = dato.rut + '|' + dato.lead;
      if (firma === ultimo) return;
      ultimo = firma;
      try { chrome.storage.local.set({ vcaCliente: dato }); } catch (e) {}
    }
    setInterval(publicar, 1500);
    publicar();
  } else if (/(^|\.)bciseguros\.cl$/i.test(host)) {
    // GO borra sus datos al iniciar sesión: el RUT del cliente se repone cada 2 s.
    let ultimo = null;
    const copiar = (d) => {
      if (d) ultimo = d;
      try { if (ultimo && localStorage.getItem('vca_cliente') !== JSON.stringify(ultimo)) localStorage.setItem('vca_cliente', JSON.stringify(ultimo)); } catch (e) {}
    };
    try {
      chrome.storage.local.get('vcaCliente', (r) => copiar(r && r.vcaCliente));
      chrome.storage.onChanged.addListener((ch) => { if (ch.vcaCliente) copiar(ch.vcaCliente.newValue); });
      setInterval(() => { if (vivo()) copiar(null); }, 2000);
    } catch (e) {}
  }
})();
