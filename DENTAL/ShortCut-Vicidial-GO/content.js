// ==UserScript==
// @name         ShortCut-Vicidial-GO
// @namespace    shortcut-vicidial-go
// @version      1.1.4
// @description  Pre-selecciona un estado de agente y lo aplica automaticamente al cortar la llamada (replay del clic real). Autoconfigurable + modo debug.
// @author       Pausa Vocal
// @match        *://vicidial.recaall.simtastic.cl/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * ============================================================================
 *  ShortCut-Vicidial-GO — atajos de estado (Vicidial) y tipificación (GO Bci)
 * ----------------------------------------------------------------------------
 *  IDEA CENTRAL (confiabilidad > elegancia):
 *   - No dependemos de funciones internas de Vicidial (SetAgentState, etc.).
 *   - "Aprendemos" tu clic REAL sobre un estado del menu y lo GUARDAMOS.
 *   - Cuando detectamos fin de llamada, RE-EJECUTAMOS ese clic real,
 *     disparando los mismos handlers (jQuery/Bootstrap) que usas tu.
 *
 *  DETECCION DE FIN DE LLAMADA (por capas, la que dispare primero):
 *   1. Cronometro de llamada que se detiene / desaparece  (generico, dia 1)
 *   2. Trama WebSocket (AgentLink) que coincide con un patron configurado
 *      -> el modo debug registra las tramas para que aprendas el patron
 *   3. JsSIP: evento 'ended'/'failed' si la UA es accesible desde window
 *
 *  MULTI-FRAME: el sitio usa framesets. El script corre en TODOS los frames;
 *  el panel se dibuja solo en el frame superior y el estado se comparte por
 *  localStorage (mismo origen). El frame que contiene el elemento aprendido
 *  es el que ejecuta el replay.
 * ============================================================================
 */

(function () {
  'use strict';

  // Versión del motor: debe coincidir con manifest.json. La pantalla de control
  // la compara con la de la extensión para avisar si la página sigue con un
  // motor viejo (pasa al actualizar sin recargar Vicidial).
  const VCA_VERSION = '1.2.4';

  // Vicidial y las páginas de Bci Seguros (GO, multicotizador…)
  const SITIO_RE = /vicidial\.recaall\.simtastic\.cl|(^|[.\/])bciseguros\.cl(?=$|[\/:])/i;
  const IS_TOP = (function () { try { return window.self === window.top; } catch (e) { return false; } })();

  // MARCO EXTERNO: un marco de OTRO sitio dentro de Vicidial/GO (ej. el
  // "Formulario de Tipificación" del script BCISALUR). No comparte localStorage
  // con la página, así que aquí sólo se capturan sus clics/menús y se ejecutan
  // sus pasos; todo se conversa con la página principal por postMessage.
  // En cualquier otra web el script no hace nada.
  const MISMO_ORIGEN_QUE_TOP = (function () {
    try { return window.top.location.origin === location.origin; } catch (e) { return false; }
  })();
  const DENTRO_DE_SITIO = (function () {
    try {
      const anc = location.ancestorOrigins;
      if (anc && anc.length) return Array.from(anc).some(o => SITIO_RE.test(o));
    } catch (e) {}
    try { return SITIO_RE.test(document.referrer || ''); } catch (e) { return false; }
  })();
  const ES_SITIO = SITIO_RE.test(location.hostname || '');
  if (!(ES_SITIO && (IS_TOP || MISMO_ORIGEN_QUE_TOP)) && !(!IS_TOP && DENTRO_DE_SITIO)) return;
  const EXT = !IS_TOP && !MISMO_ORIGEN_QUE_TOP;

  // Una sola copia de ESTA versión por documento. Si ya corre una versión
  // ANTERIOR (se actualizó la extensión sin recargar Vicidial), esta toma el
  // relevo: la anterior queda inactiva porque la cola y la grabación usan
  // claves nuevas que ella no conoce, y las copias desde la 1.0.3 además se
  // apagan solas al ver que ya no son la vigente (vigente()).
  if (window.__VCA_LOADED__ === VCA_VERSION) return;
  const RELEVO = !!window.__VCA_LOADED__;
  window.__VCA_LOADED__ = VCA_VERSION;
  function vigente() { return window.__VCA_LOADED__ === VCA_VERSION; }

  // El GO Bci NO usa cola: cada tipificación se aplica EN EL MOMENTO y no
  // queda nada pendiente. Si quedara algo armado y luego cae OTRO cliente (o se
  // recarga la página), se tipificaría al cliente equivocado. La cola solo tiene
  // sentido en Vicidial, donde el cambio de estado espera a que corte la llamada.
  const IS_CRM = !EXT && /(^|\.)bciseguros\.cl$/i.test(location.hostname || '');
  // Sitio de esta página (mismo nombre que usa el panel): cada paso grabado lo lleva,
  // para que un atajo pueda seguir en otra página (GO → multicotizador).
  function sitioDe(h) {
    h = String(h || '').toLowerCase();
    if (/vicidial\.recaall\.simtastic\.cl/.test(h)) return 'vicidial';
    return h;
  }
  const MI_SITIO = sitioDe(location.hostname);

  // ---------------------------------------------------------------------------
  // Vicidial: estado de la llamada leído de las variables de la pantalla del
  // agente (están en la página principal; los marcos las leen de window.top).
  //   VD_live_customer_call = 1  -> hay un cliente en línea
  //   AgentDispoing = 1          -> está abierta la pantalla de disposición
  //   VDRP_stage = 'PAUSED'      -> el agente está en pausa
  // ---------------------------------------------------------------------------
  const IS_VICI = !EXT && /vicidial\.recaall\.simtastic\.cl/i.test(location.hostname || '');
  function viciWin() { try { return window.top || window; } catch (e) { return window; } }
  function viciEnLlamada() {
    try { return Number(viciWin().VD_live_customer_call) === 1; } catch (e) { return false; }
  }
  function viciDispoBox() { try { return viciWin().document.getElementById('DispoSelectBox'); } catch (e) { return null; } }
  function viciEnDispo() {
    try {
      const w = viciWin();
      if (Number(w.AgentDispoing) === 1) return true;
      const b = viciDispoBox();
      return !!(b && w.getComputedStyle(b).visibility === 'visible' && b.getClientRects().length);
    } catch (e) { return false; }
  }
  // ¿Hay que esperar antes de ejecutar este atajo en Vicidial?
  //  - Con el cliente en línea, espera (la pausa no se puede hasta cortar). Salvo
  //    que lo hayas pedido con ▶ y su primer control ya esté disponible (ej. un
  //    atajo de "Colgar" o "Transferir"): ese se ejecuta al tiro.
  //  - En la pantalla de disposición, sólo pasan los atajos que empiezan DENTRO
  //    de esa pantalla (tipificar la llamada); los demás (pausas) esperan a que
  //    termines la disposición.
  function viciDebeEsperar(armed, steps) {
    if (!IS_VICI) return false;
    // Primer paso dentro del formulario externo: no se puede mirar desde aquí.
    // Pedido con ▶ se ejecuta al tiro (el propio formulario corta y tipifica).
    if (steps && steps[0] && steps[0].xf) return !(armed && armed.immediate) && (viciEnLlamada() || viciEnDispo());
    const first = steps && steps.length ? Locator.resolve(document, steps[0]) : null;
    if (viciEnLlamada()) return !(armed && armed.immediate && first && isClickable(first));
    if (viciEnDispo()) {
      const box = viciDispoBox();
      return !(first && box && box.contains(first));
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Almacenamiento (compartido entre frames del mismo origen via localStorage)
  // ---------------------------------------------------------------------------
  const K = {
    states:   'vca_states',    // [{name, desc}]
    settings: 'vca_settings',  // {debug, wsPattern, wrapupSelector, ...}
    armed:    'vca2_armed',    // desc | null  (clave nueva desde 1.0.3: ver RELEVO)
    learning: 'vca2_learning', // grabación en curso
    callend:  'vca_callend',   // timestamp (broadcast entre frames)
    needrep:  'vca_needrep',   // timestamp (pedir replay a otros frames)
    lastfire: 'vca_lastfire',  // timestamp (cooldown anti-doble-disparo)
    log:      'vca_log'        // [] lineas de debug (para verlas en el panel)
  };

  const Store = {
    get(k, def) {
      try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); }
      catch (e) { return def; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  const DEFAULT_SETTINGS = {
    debug: false,
    wsPattern: '',          // subcadena/regex para detectar fin de llamada en WS
    wrapupSelector: '',     // selector CSS cuya aparicion = fin de llamada (opcional)
    hangupSelector: '',     // selector cuya DESAPARICION = fin de llamada (opcional)
    useTimer: true,         // detector generico por cronometro
    cooldownMs: 4000,       // ventana anti-doble-disparo
    minArmedMs: 1500,       // no disparar si se armo hace < X ms (evita colas de llamada previa)
    autoWatch: true,        // aplicar EN CUANTO el control de estado se habilite
    requireDisableFirst: true, // exigir haber visto el control deshabilitado antes de disparar
                               // (asi no se dispara en mitad de la llamada, solo tras habilitarse)
    stepTimeoutMs: 8000,    // espera max. por cada paso (que aparezca / se habilite)
    totalTimeoutMs: 30000,  // tiempo total del replay (reintenta si el menu no estaba listo)
    retryGapMs: 1000,       // espera entre reintentos del ciclo completo
    stepGapMs: 400,         // pausa entre pasos para que se abra el menu
    keepAlive: true         // mantener la pestaña activa en segundo plano (audio inaudible)
  };

  function settings() { return Object.assign({}, DEFAULT_SETTINGS, Store.get(K.settings, {})); }
  function setSetting(patch) { Store.set(K.settings, Object.assign(settings(), patch)); }

  // ---------------------------------------------------------------------------
  // Log en memoria + espejo a localStorage para el panel + consola en debug
  // ---------------------------------------------------------------------------
  function log() {
    if (EXT) { aTop({ t: 'log', msg: '(marco ' + location.hostname + ') ' + Array.from(arguments).join(' ') }); return; }
    const s = settings();
    const msg = '[VCA' + (IS_TOP ? '/top' : '/frame') + '] ' + Array.from(arguments).join(' ');
    if (s.debug) { try { console.log(msg); } catch (e) {} }
    const arr = Store.get(K.log, []);
    arr.push(new Date().toLocaleTimeString() + '  ' + Array.from(arguments).join(' '));
    while (arr.length > 200) arr.shift();
    Store.set(K.log, arr);
  }

  // ===========================================================================
  //  LOCATOR: capturar un elemento -> descriptor; y resolver descriptor -> elemento
  // ===========================================================================
  // Clases e ids que la web cambia sola. Angular/PrimeNG (GO) numeran sus
  // clases por cada vez que se abre un menú (ng-tns-c124-3, luego -35…) y
  // marcan el estado (ng-touched, ng-dirty, p-inputwrapper-filled): si se
  // graban, el paso deja de calzar la próxima vez.
  const CLASE_VOLATIL = /^(ng-|p-inputwrapper|p-focus|p-filled|p-highlight|p-disabled|p-overlay|p-dropdown-open|p-multiselect-open|p-ripple|cdk-)|active|show|open|hover|selected|focus|highlight/i;
  const ID_VOLATIL = /^(pr_id_|ng-|mat-|cdk-|ui-id-)/i;

  const Locator = {
    norm(t) { return (t || '').replace(/\s+/g, ' ').trim(); },

    // Quita de una ruta grabada las clases volátiles (atajos grabados antes).
    limpiarRuta(path) {
      return String(path || '').replace(/\.((?:\\.|[\w-])+)/g, (m, c) => CLASE_VOLATIL.test(c.replace(/\\/g, '')) ? '' : m);
    },
    // Entre varios candidatos, el primero que se ve en pantalla.
    visible(list) {
      const arr = Array.from(list || []);
      return arr.find(e => { try { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (x) { return false; } }) || arr[0] || null;
    },

    cssPath(el) {
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 6) {
        let part = cur.tagName.toLowerCase();
        if (cur.id && !ID_VOLATIL.test(cur.id)) { parts.unshift(part + '#' + CSS.escape(cur.id)); break; }
        const cls = Array.from(cur.classList)
          .filter(c => !CLASE_VOLATIL.test(c))
          .slice(0, 3);
        if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
        const parent = cur.parentElement;
        if (parent) {
          const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
          if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
        }
        parts.unshift(part);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    },

    capture(el) {
      const data = {};
      for (const a of el.attributes || []) {
        if (/^(data-|onclick|href|value|title|aria-label)/i.test(a.name)) data[a.name] = a.value;
      }
      // Botones sólo con ícono (☰ de GO): el ícono los identifica.
      let icono = '';
      try {
        const i = el.matches('i,span,svg') && /\b(pi|fa|fas|far|material-icons)\b/.test(el.getAttribute('class') || '') ? el
          : el.querySelector('i[class*="pi-"],i[class*="fa-"],span[class*="pi-"],.material-icons');
        if (i) icono = ((i.getAttribute('class') || '').match(/\b(?:pi|fa)-[\w-]+/) || [''])[0] || this.norm(i.textContent).slice(0, 30);
      } catch (e) {}
      return {
        text: this.norm(el.textContent).slice(0, 60),
        tag: el.tagName.toLowerCase(),
        icono: icono,
        id: (el.id && !ID_VOLATIL.test(el.id)) ? el.id : '',
        classes: Array.from(el.classList),
        path: this.cssPath(el),
        attrs: data
      };
    },

    // Devuelve el elemento en un documento dado, o null. Varias estrategias.
    resolve(doc, d) {
      if (!d) return null;
      // 1) por id
      if (d.id && !ID_VOLATIL.test(d.id)) { const e = doc.getElementById(d.id); if (e) return e; }
      // 1b) por su onclick exacto. Los botones de Vicidial son imágenes sin
      //     texto (<a onclick="dialedcall_send_hangup(...)"><img></a>): la
      //     acción que ejecutan es lo que mejor los identifica.
      const oc = d.attrs && d.attrs.onclick;
      if (oc) {
        try {
          const e = Array.from(doc.querySelectorAll((d.tag || '*') + '[onclick]'))
            .find(x => x.getAttribute('onclick') === oc);
          if (e) return e;
        } catch (e) {}
      }
      // 2–4: se prefiere SIEMPRE un control que se vea. Uno oculto (ej. el
      // "Siguiente" de otra pantalla del asistente) sólo se usa si no hay otro.
      let oculto = null;
      const elegir = (lista) => {
        const arr = Array.from(lista || []);
        const vis = arr.find(e => { try { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (x) { return false; } });
        if (!vis && arr[0] && !oculto) oculto = arr[0];
        return vis || null;
      };
      // 2) por path CSS + verificacion de texto (también la ruta sin las
      //    clases que la web renumera)
      const limpia = this.limpiarRuta(d.path);
      const rutas = limpia && limpia !== d.path ? [d.path, limpia] : [d.path];
      const conTexto = (e) => !d.text || this.norm(e.textContent).slice(0, 60) === d.text;
      for (const r of rutas) try {
        const e = elegir(Array.from(doc.querySelectorAll(r)).filter(conTexto));
        if (e) return e;
      } catch (e) {}
      // 2b) botón sólo con ícono (ej. ☰): mismo ícono, mismo tipo de control
      if (!d.text && d.icono) try {
        const cand = /^(?:pi|fa)-/.test(d.icono)
          ? Array.from(doc.querySelectorAll('.' + CSS.escape(d.icono)))
          : Array.from(doc.querySelectorAll('.material-icons')).filter(i => this.norm(i.textContent) === d.icono);
        const e = elegir(cand.map(i => (d.tag && i.closest(d.tag)) || i));
        if (e) return e;
      } catch (e) {}
      // 2c) por su título o aria-label
      const et = d.attrs && (d.attrs['aria-label'] || d.attrs.title);
      if (et) try {
        const e = elegir(Array.from(doc.querySelectorAll((d.tag || '*') + '[aria-label],' + (d.tag || '*') + '[title]'))
          .filter(x => (x.getAttribute('aria-label') || x.getAttribute('title')) === et));
        if (e) return e;
      } catch (e) {}
      // 3) por tag + primera clase + texto exacto. Sólo con texto: sin él
      //    calzaría con CUALQUIER enlace-imagen de la pantalla.
      const firstCls = (d.classes || []).find(c => !CLASE_VOLATIL.test(c));
      if (d.text) try {
        const sel = d.tag + (firstCls ? '.' + CSS.escape(firstCls) : '');
        const hit = elegir(Array.from(doc.querySelectorAll(sel)).filter(e => this.norm(e.textContent).slice(0, 60) === d.text));
        if (hit) return hit;
      } catch (e) {}
      // 4) cualquier control con ese texto exacto y pocos hijos
      if (d.text) {
        const all = Array.from(doc.querySelectorAll('a,button,li,span,div,td'));
        const hit = elegir(all.filter(e =>
          this.norm(e.textContent).slice(0, 60) === d.text && e.children.length <= 2));
        if (hit) return hit;
      }
      if (oculto) return oculto;
      // 5) ultimo recurso: el path aunque el texto haya cambiado. Necesario para
      //    controles cuyo texto refleja el estado actual (ej. el toggle "En espera"
      //    que luego dice otra cosa) o menus que varian su etiqueta.
      for (const r of rutas) try { const e = this.visible(doc.querySelectorAll(r)); if (e) return e; } catch (e) {}
      return null;
    },

    // Re-ejecuta un clic realista. NO llama a el.click() para evitar doble disparo:
    // un evento 'click' despachado ya invoca handlers jQuery/onclick y navegacion <a>.
    fireClick(el) {
      try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
      try { el.focus && el.focus(); } catch (e) {}
      const view = el.ownerDocument.defaultView || window;
      const opts = { bubbles: true, cancelable: true, view: view, button: 0 };
      ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
        try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (e) {}
      });
    }
  };

  // ===========================================================================
  //  ARMADO (estado pre-seleccionado) — compartido entre frames
  // ===========================================================================
  function getArmed() { return Store.get(K.armed, null); }
  function setArmed(desc) {
    if (desc) Store.set(K.armed, desc); else Store.del(K.armed);
    if (window.__vcaPanel) window.__vcaPanel.refresh();
    // Notificar a otros frames para refrescar UI si tuvieran alguna
    Store.set('vca_armping', Date.now());
  }

  // ===========================================================================
  //  MOTOR DE REPLAY MULTI-PASO (Pausa -> menu -> estado), con esperas
  // ===========================================================================
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ¿El elemento esta visible y NO deshabilitado? (el boton "Pausa" se habilita
  // solo despues de la llamada; hay que esperar a que este clicable).
  function isClickable(el) {
    if (!el) return false;
    if (el.disabled) return false;
    const cls = (el.getAttribute && el.getAttribute('class')) || '';
    if (/(^|\s)(disabled|is-disabled|inactive)(\s|$)/i.test(cls)) return false;
    if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') return false;
    try { if (el.getClientRects().length === 0) return false; } catch (e) {}
    // Oculto con visibility (Vicidial deja cargadas pero ocultas la pantalla de
    // disposición y la de códigos de pausa): no cuenta como disponible.
    try {
      const vista = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      if (vista.getComputedStyle(el).visibility !== 'visible') return false;
    } catch (e) {}
    return true;
  }

  // Documentos donde buscar un paso: esta página y TODOS sus marcos internos
  // del mismo sitio. Una secuencia puede empezar en la pantalla principal
  // (ej. abrir el script) y seguir dentro de un marco (ej. el formulario de
  // tipificación de Vicidial con sus menús): hay que encontrarla en ambos.
  function docsParaBuscar() {
    const out = [document];
    (function bajar(doc, prof) {
      if (prof > 4) return;
      let marcos = [];
      try { marcos = Array.from(doc.querySelectorAll('iframe, frame')); } catch (e) {}
      for (const f of marcos) {
        let d = null;
        try { d = f.contentDocument; } catch (e) {}   // de otro sitio: no se puede
        if (d && d.documentElement) { out.push(d); bajar(d, prof + 1); }
      }
    })(document, 0);
    return out;
  }
  function resolverEnTodos(desc, aceptar) {
    for (const d of docsParaBuscar()) {
      const el = Locator.resolve(d, desc);
      if (el && (!aceptar || aceptar(el))) return el;
    }
    return null;
  }

  // Clave grabada: se guarda oculta (no en texto plano) para que no se lea
  // de un vistazo en el atajo ni en los respaldos.
  const LLAVE = 'ShortCut-Vicidial-GO·Eduardo';
  function xorTexto(t) {
    let o = '';
    for (let k = 0; k < t.length; k++) o += String.fromCharCode(t.charCodeAt(k) ^ LLAVE.charCodeAt(k % LLAVE.length));
    return o;
  }
  function ocultarClave(t) { try { return 'v1:' + btoa(unescape(encodeURIComponent(xorTexto(String(t))))); } catch (e) { return ''; } }
  function revelarClave(t) {
    try { return String(t || '').startsWith('v1:') ? xorTexto(decodeURIComponent(escape(atob(String(t).slice(3))))) : ''; } catch (e) { return ''; }
  }

  // RUT del cliente que está en Vicidial (lo deja aquí el puente de la extensión)
  function clienteActual() { const c = Store.get('vca_cliente', null); return c && c.num ? c : null; }
  function rutConFormato(c, fmt) {
    const f = fmt || { puntos: true, guion: true };
    const num = f.puntos ? String(c.num).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(c.num);
    return num + (f.guion ? '-' : '') + c.dv;
  }

  // Espera hasta que el paso se pueda resolver Y este clicable, o venza el timeout.
  async function waitFor(desc, timeout, extra) {
    const t0 = Date.now();
    const ok = extra ? (e) => isClickable(e) && extra(e) : isClickable;
    while (Date.now() - t0 < timeout) {
      const el = resolverEnTodos(desc, ok);
      if (el) return el;
      await sleep(150);
    }
    return resolverEnTodos(desc); // ultimo intento aunque no parezca clicable
  }
  // Último botón apretado: si el paso siguiente es otro "Siguiente" y la
  // pantalla todavía no cambia, se espera (hasta 2,5 s) en vez de apretar dos
  // veces el mismo botón y saltarse una pantalla.
  let ultimoClic = { el: null, t: 0 };
  const noRecienApretado = (e) => !(e === ultimoClic.el && e.isConnected && Date.now() - ultimoClic.t < 2500);

  // --- Controles de formulario (<select>, texto, casillas) -------------------
  // Asignar .value directamente no basta si la web usa React/Vue: hay que usar
  // el setter NATIVO del prototipo para que el framework detecte el cambio.
  function setNativeValue(el, value) {
    try {
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      if (d && d.set) { d.set.call(el, value); return; }
    } catch (e) {}
    try { el.value = value; } catch (e) {}
  }
  function fireInputChange(el) {
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
  }
  function optionMatch(el, step) {
    if (!el || !el.options) return null;
    for (const o of el.options) {
      if (step.value !== undefined && step.value !== '' && o.value === step.value) return o.value;
    }
    for (const o of el.options) {                    // respaldo: casar por texto
      if (step.optText && Locator.norm(o.textContent) === step.optText) return o.value;
    }
    return null;
  }
  // Espera a que el <select> exista Y ya tenga la opcion: los menus encadenados
  // (Estado -> Resultado -> Motivo) se rellenan tras elegir el anterior.
  async function waitForOption(step, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      for (const d of docsParaBuscar()) {
        const el = Locator.resolve(d, step);
        if (el) { const v = optionMatch(el, step); if (v !== null) return { el: el, value: v }; }
      }
      await sleep(150);
    }
    return null;
  }

  // Ejecuta UN paso en este documento (y sus marcos del mismo sitio).
  async function ejecutarPaso(st, s, tag) {
    const kind = st.kind || 'click';
    if (kind === 'select') {
      const hit = await waitForOption(st, s.stepTimeoutMs);
      if (!hit) { log(tag + ' menu sin la opcion "' + (st.optText || st.value) + '"'); return false; }
      setNativeValue(hit.el, hit.value);
      fireInputChange(hit.el);
      log(tag + ' -> menu "' + (st.optText || hit.value) + '"');

    } else if (kind === 'input') {
      const el = await waitFor(st, s.stepTimeoutMs);
      if (!el) { log(tag + ' campo de texto no encontrado'); return false; }
      let valor = st.value;
      if (st.dyn === 'rut') {
        const cli = clienteActual();
        if (!cli || !cli.num) { log(tag + ' no hay RUT del cliente: abre Vicidial con el cliente en pantalla'); return false; }
        valor = rutConFormato(cli, st.fmt);
      }
      if (st.secreto) valor = revelarClave(valor);
      try { el.focus(); } catch (e) {}
      setNativeValue(el, valor);
      fireInputChange(el);
      // Formularios con máscara (Angular, PrimeNG): también teclado y salida del campo
      try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' })); } catch (e) {}
      try { el.dispatchEvent(new Event('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); } catch (e) {}
      log(tag + ' -> ' + (st.secreto ? 'clave (oculta)' : 'texto "' + String(valor).slice(0, 30) + '"') + (st.dyn === 'rut' ? ' (RUT del cliente)' : ''));

    } else if (kind === 'check') {
      const el = await waitFor(st, s.stepTimeoutMs);
      if (!el) { log(tag + ' casilla no encontrada'); return false; }
      if (!!el.checked !== !!st.checked) Locator.fireClick(el);
      log(tag + ' -> casilla ' + st.checked);

    } else {
      const el = await waitFor(st, s.stepTimeoutMs, noRecienApretado);
      if (!el || !isClickable(el)) {
        log(tag + ' no listo (' + st.tag + ' "' + st.text + '")');
        return false;
      }
      ultimoClic = { el: el, t: Date.now() };
      Locator.fireClick(el);
      log(tag + ' -> ' + st.tag + ' "' + st.text + '"');
    }
    return true;
  }

  // Último paso que no se pudo hacer (para avisar en el panel).
  let pasoFallido = null;
  function describirPaso(st) {
    const k = st.kind || 'click';
    if (k === 'select') return 'menú "' + (st.optText || st.value || '') + '"';
    if (k === 'input') return st.dyn === 'rut' ? 'escribir el RUT del cliente' : 'escribir en un campo';
    if (k === 'check') return 'casilla';
    return st.text ? '"' + String(st.text).slice(0, 40) + '"' : (st.icono ? 'botón con ícono (' + st.icono + ')' : 'botón ' + (st.tag || ''));
  }

  // Un intento de la secuencia, desde el paso `desde`. Devuelve el índice del
  // paso que falló, o -1 si se completó.
  // ---- Atajos que cruzan páginas -------------------------------------------
  // Antes de cada clic se anota "voy en el paso N" fuera de la página (en la
  // extensión). Si el clic abre otra página (o pestaña, o sitio), ésa lo lee al
  // cargar y sigue desde ahí. -3 = el resto sigue en otra página.
  const OTRA_PAGINA = -3;
  let corrida = null;   // {label, steps} de la ejecución en curso
  function pendiente(op, data) {
    try { document.dispatchEvent(new CustomEvent('vca:pendiente', { detail: JSON.stringify({ op: op, data: data || null }) })); } catch (e) {}
  }
  function anotarAvance(steps, desde) {
    if (!corrida || desde >= steps.length || corrida.anotado === desde) return;
    corrida.anotado = desde;      // una vez por paso: no pisar a la página que ya siguió
    pendiente('set', { label: corrida.label, steps: steps, desde: desde, sitio: MI_SITIO, t: Date.now() });
  }
  // Espera entre pasos: la que usaste al grabar (un poco menos), para que una
  // página alcance a cambiar antes del siguiente "Siguiente".
  function esperaEntre(a, b, s) {
    if (!IS_CRM || !a || !b || !a.t || !b.t) return s.stepGapMs;
    return Math.max(s.stepGapMs, Math.min(2500, Math.round((b.t - a.t) * 0.4)));
  }

  // ¿En qué paso conviene empezar según la pantalla en que está la página?
  // Si GO ya tiene la sesión abierta, los pasos del login se saltan; si la
  // página quedó en una pantalla más adelante, se parte desde ésa.
  function inicioSegunPantalla(steps, desde) {
    const st = steps[desde];
    if (!IS_CRM || !st || !st.ruta || st.ruta === location.pathname) return desde;
    for (let j = desde; j < steps.length; j++) {
      if (steps[j].sitio && steps[j].sitio !== MI_SITIO) break;
      if (steps[j].ruta === location.pathname) {
        log('Esta página ya está en ' + location.pathname + ': empiezo en el paso ' + (j + 1) + ' (me salto ' + (j - desde) + ')');
        return j;
      }
    }
    // Sesión ya abierta: saltar los pasos del inicio de sesión
    let j = desde;
    while (j < steps.length && /login|ingres|sesion/i.test(steps[j].ruta || '') && (!steps[j].sitio || steps[j].sitio === MI_SITIO)) j++;
    if (j > desde && !hayClaveVisible()) { log('La sesión ya está abierta: me salto ' + (j - desde) + ' paso(s) del login'); return j; }
    return desde;
  }
  function visibleEl(e) { try { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (x) { return false; } }
  function hayClaveVisible() { return Array.from(document.querySelectorAll('input[type="password"]')).some(visibleEl); }
  // Chrome no entrega a ninguna extensión la clave que guardó hasta que la
  // persona toca la página. Si hay que iniciar sesión, el atajo espera: la
  // persona entra y, al cargar la página siguiente, el atajo sigue solo.
  function claveVacia() { return Array.from(document.querySelectorAll('input[type="password"]')).some(e => visibleEl(e) && !e.value); }
  // Botón para entrar en una pantalla de inicio de sesión.
  function botonIngresar() {
    const cand = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]')).filter(visibleEl);
    return cand.find(e => /ingresar|entrar|iniciar\s*sesi|acceder|log\s*in/i.test(Locator.norm(e.textContent || e.value || ''))) ||
           cand.find(e => (e.type || '').toLowerCase() === 'submit') || null;
  }
  function avisoLogin(nombre) {
    try {
      if (document.getElementById('vca-aviso-login')) return;
      const d = document.createElement('div');
      d.id = 'vca-aviso-login';
      d.setAttribute('style', 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(92vw,520px);' +
        'background:#0B2C8A;color:#fff;font:600 15px/1.4 system-ui,Segoe UI,sans-serif;padding:14px 18px;border-radius:14px;' +
        'box-shadow:0 12px 30px rgba(0,20,60,.35);text-align:center;pointer-events:none;opacity:.97');
      d.textContent = '👆 Haz un clic en cualquier parte de esta página para entrar a GO con tu clave guardada ' +
        '(o escríbela). El atajo «' + (nombre || '') + '» aprieta «Ingresar» y sigue solo.';
      // Cualquier clic en la página es "tocarla": Chrome entrega la clave guardada
      // y el atajo aprieta «Ingresar». El aviso no recibe clics: nunca tapa un botón.
      document.addEventListener('pointerdown', function cambio(ev) {
        if (!ev.isTrusted) return;
        document.removeEventListener('pointerdown', cambio, true);
        d.textContent = '⏳ Entrando a GO… el atajo «' + (nombre || '') + '» sigue solo.';
      }, true);
      (document.body || document.documentElement).appendChild(d);
      setTimeout(() => { try { d.remove(); } catch (e) {} }, 180000);
    } catch (e) {}
  }

  async function runStepsOnce(steps, s, desde) {
    for (let i = desde || 0; i < steps.length; i++) {
      const st = steps[i];
      // Paso de otra página: se deja anotado y lo hace esa página al abrirse.
      if (st.sitio && !st.xf && st.sitio !== MI_SITIO) {
        anotarAvance(steps, i);
        log('  paso ' + (i + 1) + '/' + steps.length + ': sigue en ' + st.sitio + ' (esperando que se abra)');
        return OTRA_PAGINA;
      }
      // La página saltó a otra pantalla por su cuenta (ej. GO ya tenía la sesión
      // abierta y pasó del login al panel): se sigue desde el paso de esa pantalla.
      const LOGIN = /login|ingres|sesion/i;
      if (IS_CRM && LOGIN.test(st.ruta || '') && !LOGIN.test(location.pathname)) {
        const j = inicioSegunPantalla(steps, i);
        if (j > i) { i = j - 1; continue; }
      }
      const tag = '  paso ' + (i + 1) + '/' + steps.length;
      // Botón de entrar con la clave vacía: espera a que la persona inicie sesión.
      if (IS_CRM && (st.kind || 'click') === 'click' && claveVacia()) {
        // ¿Este paso ES el botón "Ingresar" de esta pantalla? (si se entró con
        // Enter al grabar, el paso siguiente ya es del panel y no se consume)
        const esIngresar = st.ruta === location.pathname;
        const sigue = esIngresar ? i + 1 : i;
        if (corrida) {
          corrida.anotado = null;
          pendiente('set', { label: corrida.label, steps: steps, desde: sigue, sitio: MI_SITIO, t: Date.now(), vence: Date.now() + 3 * 60 * 1000 });
        }
        avisoLogin(corrida && corrida.label);
        log(tag + ': esperando un clic en la página para que Chrome entregue la clave; después entra y sigue solo');
        // Chrome entrega la clave guardada en cuanto la persona toca la página
        // (un clic en el aviso basta). Entonces se aprieta "Ingresar" aquí.
        // Si "Ingresar" recarga la página, la página nueva sigue (queda anotado);
        // si GO cambia de pantalla sin recargar, se sigue aquí mismo.
        const t0 = Date.now(), ruta0 = location.pathname;
        let apretado = 0;
        while (Date.now() - t0 < 3 * 60 * 1000) {
          await sleep(300);
          if (location.pathname !== ruta0 || !hayClaveVisible()) break;
          if (!claveVacia() && Date.now() - apretado > 6000) {
            apretado = Date.now();
            document.querySelectorAll('input[type="password"]').forEach((e) => { if (visibleEl(e)) fireInputChange(e); });
            const btn = (esIngresar && resolverEnTodos(st, isClickable)) || botonIngresar();
            if (btn) { await sleep(250); log(tag + ': la clave ya está: aprieto «' + Locator.norm(btn.textContent || btn.value || 'Ingresar') + '»'); Locator.fireClick(btn); }
          }
        }
        try { const a = document.getElementById('vca-aviso-login'); if (a) a.remove(); } catch (e) {}
        if (location.pathname === ruta0 && hayClaveVisible()) {
          pasoFallido = { n: i + 1, de: steps.length, que: 'el inicio de sesión (no se ingresó en 3 minutos)' };
          return i;
        }
        log(tag + ': sesión iniciada, sigo');
        // GO tarda en armar su panel después de entrar: se espera (hasta 30 s)
        // a que aparezca el próximo botón, y el plazo del atajo parte de nuevo.
        const prox = steps[esIngresar ? i + 1 : i];
        const t1 = Date.now();
        await sleep(1200);
        while (prox && !prox.xf && (!prox.sitio || prox.sitio === MI_SITIO) && Date.now() - t1 < 30000 && !resolverEnTodos(prox, isClickable)) await sleep(400);
        if (corrida) corrida.hasta = Date.now() + 30000;
        if (!esIngresar) i--;      // el paso de esta vuelta es del panel: se hace ahora
        continue;
      }
      if ((st.kind || 'click') === 'click') anotarAvance(steps, i + 1);
      const ok = st.xf ? await pasoEnMarco(st, s, tag) : await ejecutarPaso(st, s, tag);
      if (!ok) { pasoFallido = { n: i + 1, de: steps.length, que: describirPaso(st) }; return i; }
      await sleep(esperaEntre(st, steps[i + 1], s));
    }
    return -1;
  }

  // ¿El primer control de la secuencia vuelve a estar disponible? Entonces un
  // reintento parte de cero (ej. reabrir el menú de pausas). Si no (ej. ya se
  // cortó la llamada y "Colgar" quedó deshabilitado), sigue desde el paso que
  // falló, sin repetir lo que ya se hizo.
  function primeroDisponible(steps) {
    const f = steps[0];
    if (!f || f.xf) return false;
    return !!resolverEnTodos(f, isClickable);
  }

  // Ejecuta la secuencia reintentando hasta lograrlo o vencer el tiempo total
  // (el menu de pausa no siempre esta disponible al instante).
  async function runSteps(steps, inicio, label) {
    const s = settings();
    // GO / multicotizador: 30 s por tramo (las páginas de Bci tardan en cargar);
    // el plazo se renueva cuando hubo que esperar el inicio de sesión.
    corrida = { label: label || '', steps: steps, hasta: Date.now() + (IS_CRM ? 30000 : s.totalTimeoutMs) };
    const yo = corrida;
    let attempt = 0, desde = inicio || 0;
    while (Date.now() < yo.hasta) {
      attempt++;
      if (attempt > 1) log('Replay reintento ' + attempt + (desde ? ' (desde el paso ' + (desde + 1) + ')' : '') + '...');
      const fallo = await runStepsOnce(steps, s, desde);
      if (fallo === OTRA_PAGINA) { corrida = null; return true; }   // sigue en la otra página
      if (fallo < 0) { pendiente('clear'); corrida = null; log('Replay COMPLETADO (intento ' + attempt + ').'); return true; }
      if (IS_CRM) {
        // GO: sin Escape (cerraría la ventana "Nueva Oportunidad" ya abierta)
        // y sin volver al ☰ (lo cerraría): se sigue esperando el paso que faltó.
        await sleep(s.retryGapMs);
        desde = fallo;
        continue;
      }
      // cerrar cualquier menu abierto antes de reintentar
      try {
        (document.activeElement || document.body).dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      } catch (e) {}
      await sleep(s.retryGapMs);
      desde = primeroDisponible(steps) ? 0 : fallo;
    }
    log('Replay AGOTADO tras ' + attempt + ' intento(s): no se pudo aplicar el estado.');
    if (IS_CRM) avisoEnPagina('⚠️ El atajo «' + (yo.label || '') + '» se detuvo' +
      (pasoFallido ? ' en el paso ' + pasoFallido.n + ' de ' + pasoFallido.de + ': no apareció ' + pasoFallido.que : '') +
      '. Sigue tú desde aquí o vuelve a apretar el botón.', '#8f1d2b');
    pendiente('clear'); corrida = null;
    return false;
  }
  // Aviso corto arriba de la página (no bloquea clics; se va solo).
  function avisoEnPagina(texto, fondo) {
    try {
      const v = document.getElementById('vca-aviso-pagina'); if (v) v.remove();
      const d = document.createElement('div');
      d.id = 'vca-aviso-pagina';
      d.setAttribute('style', 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(92vw,560px);' +
        'background:' + (fondo || '#0B2C8A') + ';color:#fff;font:600 14px/1.4 system-ui,Segoe UI,sans-serif;padding:12px 16px;border-radius:14px;' +
        'box-shadow:0 12px 30px rgba(0,20,60,.35);text-align:center;pointer-events:none');
      d.textContent = texto;
      (document.body || document.documentElement).appendChild(d);
      setTimeout(() => { try { d.remove(); } catch (e) {} }, 25000);
    } catch (e) {}
  }

  // ===========================================================================
  //  MARCOS DE OTRO SITIO (ej. el formulario de tipificación del script)
  //  La página no puede tocar su contenido; el content script que corre DENTRO
  //  del marco graba y ejecuta esos pasos. Se conversan por postMessage:
  //    marco -> página : {t:'step'}  paso grabado (sólo cuenta si se está grabando)
  //                      {t:'log'}   línea para el registro
  //                      {t:'hola'}  el marco se cargó (diagnóstico)
  //    página -> marcos: {t:'run'}   ejecuta este paso
  //    marco -> página : {t:'ack'} lo tomé, {t:'done', ok} terminé
  // ===========================================================================
  // Etiqueta de los mensajes con los marcos. Distinta de la de la 1.0.2/1.0.3
  // (que no saben apagarse solas), para que una copia vieja que siga viva en
  // la página no conteste ni ejecute pasos.
  const MSG = '__vca_m2';
  function aTop(o) { try { o[MSG] = 1; window.top.postMessage(o, '*'); } catch (e) {} }
  function urlMarco() { return location.origin + location.pathname; }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // Todas las ventanas de marcos bajo `w` (las de otro sitio también: aunque no
  // se pueda leer su contenido, sí se les puede enviar mensajes).
  function todasLasVentanas(w, out, prof) {
    out = out || []; prof = prof || 0;
    if (prof > 5) return out;
    let n = 0;
    try { n = w.frames.length; } catch (e) {}
    for (let i = 0; i < n; i++) {
      let f = null;
      try { f = w.frames[i]; } catch (e) {}
      if (!f) continue;
      out.push(f);
      todasLasVentanas(f, out, prof + 1);
    }
    return out;
  }

  // Página principal: pide a los marcos que ejecuten un paso grabado en uno de
  // ellos. Reenvía la petición hasta que algún marco la tome (el formulario
  // puede estar recién cargándose); si el dueño exacto no aparece, a los 2,5 s
  // acepta cualquier marco que tenga ese control.
  function pasoEnMarco(st, s, tag) {
    return new Promise((resolve) => {
      const id = rid(), t0 = Date.now();
      let tomado = false, listo = false;
      function fin(ok) {
        if (listo) return; listo = true;
        clearInterval(iv); clearTimeout(to);
        window.removeEventListener('message', oir);
        if (!ok) log(tag + (tomado ? ' falló dentro del formulario' : ' el formulario no respondió') +
                     ' (' + (st.xfHost || 'marco externo') + ')');
        resolve(ok);
      }
      function oir(e) {
        const d = e.data;
        if (!d || d[MSG] !== 1 || d.id !== id) return;
        if (d.t === 'ack') tomado = true;
        else if (d.t === 'done') fin(!!d.ok);
      }
      function enviar() {
        const msg = { t: 'run', id: id, step: st, timeout: s.stepTimeoutMs, loose: Date.now() - t0 > 2500 };
        msg[MSG] = 1;
        for (const w of todasLasVentanas(window)) { try { w.postMessage(msg, '*'); } catch (e) {} }
      }
      window.addEventListener('message', oir);
      enviar();
      const iv = setInterval(() => { if (!tomado) enviar(); }, 400);
      const to = setTimeout(() => fin(false), s.stepTimeoutMs + 3000);
    });
  }

  if (EXT) {
    // Dentro del marco externo: ejecutar los pasos que pida la página.
    const tomados = {};
    window.addEventListener('message', async (e) => {
      const d = e.data;
      if (!vigente() || !d || d[MSG] !== 1 || d.t !== 'run' || !d.step) return;
      const responder = (o) => { try { o[MSG] = 1; o.id = d.id; e.source.postMessage(o, '*'); } catch (err) {} };
      if (tomados[d.id]) { responder({ t: 'ack' }); return; }
      const mio = d.step.xfUrl === urlMarco();
      // Plan B (la dirección del formulario cambió): mismo servidor y el control existe.
      if (!mio && !(d.loose && d.step.xfHost === location.hostname && Locator.resolve(document, d.step))) return;
      tomados[d.id] = true;
      responder({ t: 'ack' });
      const s = Object.assign({}, DEFAULT_SETTINGS, { stepTimeoutMs: d.timeout || DEFAULT_SETTINGS.stepTimeoutMs });
      let ok = false;
      try { ok = await ejecutarPaso(d.step, s, '  formulario'); } catch (err) { ok = false; }
      responder({ t: 'done', ok: ok });
    });
  } else if (IS_TOP) {
    // Página principal: recibir lo que mandan los marcos externos.
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!vigente() || !d || d[MSG] !== 1 || e.source === window) return;
      // "Cortar y Tipificar" pulsado en el formulario: se detiene la cuenta regresiva
      if (d.t === 'step' && d.step && (d.step.kind || 'click') === 'click' && /tipific/i.test(d.step.text || '')) RelojTipif.tipificado();
      if (d.t === 'step' && d.step) pushStep(d.step, d.human || 'paso en formulario');
      else if (d.t === 'log' && d.msg) log(String(d.msg).slice(0, 300));
      else if (d.t === 'hola') log('Marco externo listo: ' + String(d.url || '').slice(0, 120));
    });
  }

  // Normaliza a un array de pasos (compat con formato antiguo de 1 clic).
  function stepsOf(x) {
    if (!x) return [];
    if (x.steps && x.steps.length) return x.steps;
    if (x.desc) return [x.desc];
    if (x.path || x.text) return [x]; // era un descriptor suelto
    return [];
  }

  // ===========================================================================
  //  MANEJO DE FIN DE LLAMADA -> replay
  //  Actua el frame que CONTIENE el primer control de la secuencia. Si no esta
  //  en este frame, delega a otros frames via `needrep`.
  // ===========================================================================
  let replaying = false;

  // ¿Este frame es el que debe ejecutar la secuencia? El que tiene el primer
  // control; si el primer paso está en un marco externo, la página principal.
  function primeroAqui(steps) {
    if (steps[0] && steps[0].xf) return IS_TOP && !EXT;
    return !!Locator.resolve(document, steps[0]);
  }

  function handleCallEnd(sourceTag) {
    if (EXT || !vigente()) return;
    const s = settings();
    // CRM: solo se aplica por el ▶ del usuario (sourceTag 'popup'). Nunca por un
    // detector automático, para no tipificar sobre un cliente que no corresponde.
    if (IS_CRM && sourceTag !== 'popup') return;
    const armed = getArmed();
    if (!armed) return; // nada pre-seleccionado -> no hacemos nada

    const now = Date.now();
    const last = Store.get(K.lastfire, 0);
    if (now - last < s.cooldownMs) return;              // cooldown global
    if (armed.__armedAt && now - armed.__armedAt < s.minArmedMs) return; // recien armado
    if (replaying) return;

    const steps = stepsOf(armed);
    if (!steps.length) return;
    if (viciDebeEsperar(armed, steps)) return;   // Vicidial: aún en llamada o en disposición
    // GO: lo ejecuta la página principal de la pestaña que recibió el ▶, aunque
    // el primer botón todavía no aparezca (se espera y, si no, se avisa).
    if (IS_CRM && !IS_TOP) return;
    // Si el primer control no vive en este frame, que lo intenten los demas.
    if (!IS_CRM && !primeroAqui(steps)) { Store.set(K.needrep, now + '|' + Math.random()); return; }

    Store.set(K.lastfire, now);
    replaying = true;
    pasoFallido = null;
    Store.del('vca_fallo');
    const nombre = armed.label || armed.name || armed.text;
    log((IS_CRM ? 'Ejecutando' : 'Fin de llamada (' + sourceTag + ') -> aplicando') + ' "' +
        nombre + '" (' + steps.length + ' paso/s)');
    runSteps(steps, inicioSegunPantalla(steps, 0), nombre).then((ok) => {
      replaying = false;
      if (ok) { setArmed(null); }
      else if (IS_CRM) {
        // GO: nada queda "en cola" para siempre; el panel dice qué paso falló.
        Store.set('vca_fallo', { label: nombre, paso: pasoFallido, t: Date.now() });
        setArmed(null);
      }
      else { Store.set(K.needrep, Date.now() + '|' + Math.random()); } // que prueben otros frames
    });
  }

  // Un atajo que empezó en otra página (o antes de un cambio de página) sigue aquí.
  function continuarAtajo(p) {
    if (replaying || !vigente() || !p || !Array.isArray(p.steps)) return;
    replaying = true; pasoFallido = null; Store.del('vca_fallo');
    log('Continuando "' + (p.label || 'atajo') + '" desde el paso ' + (p.desde + 1) + '/' + p.steps.length + ' (viene de otra página)');
    runSteps(p.steps, inicioSegunPantalla(p.steps, p.desde), p.label).then((ok) => {
      replaying = false;
      if (!ok) Store.set('vca_fallo', { label: p.label, paso: pasoFallido, t: Date.now() });
    });
  }

  // Otro frame (no lider) intenta el replay si los controles viven aqui.
  function tryReplayFromBus() {
    if (EXT || replaying || !vigente()) return;
    const armed = getArmed();
    if (!armed) return;
    const steps = stepsOf(armed);
    if (!steps.length) return;
    if (viciDebeEsperar(armed, steps)) return;
    if (!primeroAqui(steps)) return; // el primer control no esta aqui
    Store.set(K.lastfire, Date.now());
    replaying = true;
    log('Replay (bus) en este frame: "' + (armed.label || armed.name || armed.text) + '"');
    runSteps(steps).then((ok) => { replaying = false; if (ok) setArmed(null); });
  }

  // ===========================================================================
  //  AUTO-VIGILANCIA: dispara EN CUANTO el control de estado se habilita.
  //  No depende de detectar el fin de llamada: armas "Correo" durante la
  //  llamada (el control esta deshabilitado) y en cuanto se habilita -tras la
  //  llamada y la pantalla intermedia- se ejecuta la secuencia sola.
  //  Corre en cada frame; solo actua el frame que contiene el 1er control.
  // ===========================================================================
  const armWatch = { sawDisabled: false };

  // Estado final de un atajo (la última selección). Sirve para emparejar dos
  // atajos que llevan al MISMO estado desde puntos de partida distintos.
  function finalStateKey(sc) {
    const st = stepsOf(sc);
    const l = st[st.length - 1] || {};
    return String(l.optText || l.value || l.text || '').trim().toUpperCase();
  }
  // data-status del PRIMER paso ('available' = disponible/En espera; 'red' = En línea).
  function firstStepStatus(sc) {
    const st = stepsOf(sc);
    const f = st[0] || {};
    return String((f.attrs && f.attrs['data-status']) || '').toLowerCase();
  }

  // RED DE SEGURIDAD. Un atajo "en llamada" (su 1er paso apunta al estado En línea)
  // que quedó ARMADO cuando el agente YA está DISPONIBLE no puede ejecutarse: su
  // control ya no existe y queda "pegado". En ese caso buscamos el "gemelo
  // disponible" (otro atajo con el MISMO estado final, cuyo 1er paso es el estado
  // disponible) y lo ejecutamos. Ej.: PROGRAMAR ENVIAR CORREO (pegado) -> CORREO.
  // Así el ejecutivo no queda Disponible creyendo que dejó programado el envío.
  function stuckFallbackCheck(armed) {
    if (replaying) return false;
    const fs = firstStepStatus(armed);
    if (!fs || fs === 'available') return false;      // no es un atajo "en llamada"
    // ¿El agente ya está DISPONIBLE? (existe el botón de estado disponible)
    if (!document.querySelector('button.dropdown-toggle[data-status="available"]')) return false;
    const target = finalStateKey(armed);
    if (!target) return false;
    const twin = Store.get(K.states, []).find(sc =>
      firstStepStatus(sc) === 'available' && finalStateKey(sc) === target);
    if (!twin) return false;
    const tSteps = stepsOf(twin);
    if (!tSteps.length || !Locator.resolve(document, tSteps[0])) return false;
    const now = Date.now();
    if (now - Store.get(K.lastfire, 0) < settings().cooldownMs) return false;
    Store.set(K.lastfire, now);
    replaying = true;
    log('Atajo en-llamada pegado y agente DISPONIBLE -> ejecuto gemelo disponible: "' + (twin.label || '') + '"');
    runSteps(tSteps).then((ok) => { replaying = false; if (ok) setArmed(null); });
    return true;
  }

  function autoWatchTick() {
    if (EXT || !vigente()) return;
    const s = settings();
    if (!s.autoWatch || replaying) return;
    // CRM: sin cola ni vigilancia. La tipificación se aplica solo en el momento
    // en que el usuario pulsa ▶ (vía applynow), nunca "en cuanto se pueda".
    if (IS_CRM) return;
    const armed = getArmed();
    if (!armed) { armWatch.sawDisabled = false; return; }
    // Red de seguridad: atajo "en llamada" pegado + agente disponible -> gemelo.
    if (stuckFallbackCheck(armed)) return;
    const steps = stepsOf(armed);
    if (!steps.length) return;
    // Vicidial: mientras dure la llamada (o la disposición, para las pausas) el
    // atajo queda en cola; cuenta como "control deshabilitado" para dispararlo
    // en cuanto se pueda.
    if (viciDebeEsperar(armed, steps)) { armWatch.sawDisabled = true; return; }

    if (!primeroAqui(steps)) return; // los controles no viven en este frame
    const first = steps[0].xf ? null : Locator.resolve(document, steps[0]);

    const now = Date.now();
    if (now - Store.get(K.lastfire, 0) < s.cooldownMs) return;
    if (armed.__armedAt && now - armed.__armedAt < s.minArmedMs) return;

    if (first && !isClickable(first)) { armWatch.sawDisabled = true; return; } // aun deshabilitado
    // `immediate` = lo pidió el usuario con ▶: ejecutar en cuanto se pueda, sin
    // exigir haber visto antes el control deshabilitado.
    if (s.requireDisableFirst && !armed.immediate && !armWatch.sawDisabled) return;

    Store.set(K.lastfire, now);
    replaying = true;
    log('Auto: control habilitado -> aplicando "' + (armed.label || armed.name || armed.text) + '"');
    runSteps(steps).then((ok) => {
      replaying = false;
      if (ok) { armWatch.sawDisabled = false; setArmed(null); }
    });
  }

  // Broadcast de fin de llamada a todos los frames (por si el detector vive en otro)
  function broadcastCallEnd(sourceTag) {
    handleCallEnd(sourceTag);                 // local
    Store.set(K.callend, Date.now() + '|' + sourceTag); // otros frames
  }

  // Reaccionar a eventos de storage de otros frames/pestanas
  window.addEventListener('storage', (e) => {
    if (e.key === K.callend && e.newValue) {
      const tag = String(e.newValue).split('|')[1] || 'otro-frame';
      handleCallEnd(tag);
    } else if (e.key === K.needrep) {
      tryReplayFromBus();
    } else if (e.key === 'vca_armping' && window.__vcaPanel) {
      window.__vcaPanel.refresh();
    }
  });

  // Comandos desde el popup de la extension (via bridge en mundo aislado).
  // Los CustomEvent sobre `document` cruzan entre el mundo MAIN y el aislado.
  document.addEventListener('vca:cmd', (ev) => {
    const d = (ev && ev.detail) || {};
    if (d.type === 'applynow') { Store.set(K.lastfire, 0); handleCallEnd('popup'); }
    else if (d.type === 'callend') { handleCallEnd(d.tag || 'popup'); }
    else if (d.type === 'refresh' && window.__vcaPanel) { window.__vcaPanel.rebuild(); window.__vcaPanel.refresh(); }
    else if (d.type === 'learnReset') { memLearn = null; }   // grabación guardada o cancelada
    else if (d.type === 'continuar' && d.data && IS_TOP && !EXT) continuarAtajo(d.data);
  });

  // ===========================================================================
  //  DETECTORES DE FIN DE LLAMADA
  // ===========================================================================

  // --- 1) WebSocket sniffer (AgentLink). Registra tramas en debug; casa patron.
  (function patchWebSocket() {
    if (EXT) return;
    const NativeWS = window.WebSocket;
    if (!NativeWS || NativeWS.__vcaPatched) return;
    function VcaWS(url, protocols) {
      const ws = protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols);
      try {
        ws.addEventListener('message', (ev) => {
          const s = settings();
          let data = ev.data;
          if (typeof data !== 'string') return; // ignoramos binario
          if (s.debug) {
            // guardar ultimas tramas para inspeccion en el panel
            const frames = Store.get('vca_wsframes', []);
            frames.push(new Date().toLocaleTimeString() + '  ' + data.slice(0, 300));
            while (frames.length > 60) frames.shift();
            Store.set('vca_wsframes', frames);
          }
          if (s.wsPattern) {
            let match = false;
            try { match = new RegExp(s.wsPattern, 'i').test(data); }
            catch (e) { match = data.toLowerCase().indexOf(s.wsPattern.toLowerCase()) >= 0; }
            if (match) broadcastCallEnd('websocket');
          }
        });
      } catch (e) {}
      return ws;
    }
    VcaWS.prototype = NativeWS.prototype;
    VcaWS.CONNECTING = NativeWS.CONNECTING; VcaWS.OPEN = NativeWS.OPEN;
    VcaWS.CLOSING = NativeWS.CLOSING; VcaWS.CLOSED = NativeWS.CLOSED;
    VcaWS.__vcaPatched = true;
    try { window.WebSocket = VcaWS; } catch (e) {}
  })();

  // --- 2) Cronometro de llamada (generico). Un elemento cuyo texto es un reloj
  //         (mm:ss) y cambia cada segundo; cuando se detiene/desaparece = fin.
  const TimerDetector = (function () {
    let tracked = null;      // {el, last, lastChange}
    let interval = null;
    const CLOCK = /^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/;

    function findClocks() {
      const out = [];
      const nodes = document.querySelectorAll('span,div,td,b,strong,label,p');
      for (const n of nodes) {
        if (n.children.length === 0 && CLOCK.test(n.textContent)) out.push(n);
      }
      return out;
    }

    function tick() {
      const s = settings();
      if (!s.useTimer) return;
      const now = Date.now();

      if (tracked && document.contains(tracked.el)) {
        const txt = tracked.el.textContent.trim();
        if (txt !== tracked.last) {
          tracked.last = txt; tracked.lastChange = now;
        } else if (now - tracked.lastChange > 2500) {
          // el reloj dejo de avanzar por >2.5s -> fin de llamada
          const wasRunning = tracked.wasRunning;
          if (wasRunning) {
            log('Cronometro detenido en', txt, '-> fin de llamada');
            broadcastCallEnd('cronometro');
          }
          tracked = null;
        }
        // marcar que llego a correr (cambio al menos una vez)
        if (tracked && tracked.last !== tracked.initial) tracked.wasRunning = true;
      } else if (tracked && !document.contains(tracked.el)) {
        if (tracked.wasRunning) {
          log('Cronometro desaparecio -> fin de llamada');
          broadcastCallEnd('cronometro-removido');
        }
        tracked = null;
      }

      if (!tracked) {
        const clocks = findClocks();
        // preferimos un reloj distinto de 00:00
        const cand = clocks.find(c => !/^0?0:00(:00)?$/.test(c.textContent.trim())) || clocks[0];
        if (cand) {
          tracked = { el: cand, last: cand.textContent.trim(), initial: cand.textContent.trim(),
                      lastChange: now, wasRunning: false };
        }
      }
    }

    return {
      start() { if (!interval) interval = setInterval(tick, 1000); }
    };
  })();

  // --- 3) Observadores DOM configurables (wrap-up aparece / hangup desaparece)
  const DomDetector = (function () {
    let hangupSeen = false;
    function check() {
      const s = settings();
      if (s.wrapupSelector) {
        try { if (document.querySelector(s.wrapupSelector)) broadcastCallEnd('wrapup-selector'); }
        catch (e) {}
      }
      if (s.hangupSelector) {
        try {
          const present = !!document.querySelector(s.hangupSelector);
          if (present) hangupSeen = true;
          else if (hangupSeen) { hangupSeen = false; broadcastCallEnd('hangup-desaparecio'); }
        } catch (e) {}
      }
    }
    return {
      start() {
        try {
          const mo = new MutationObserver(() => check());
          mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        } catch (e) {}
        setInterval(check, 1000);
      }
    };
  })();

  // --- 4) JsSIP (best-effort): buscar una UA con .sessions y enganchar 'ended'
  const JsSipDetector = (function () {
    const hooked = new WeakSet();
    function scan() {
      try {
        for (const key of Object.keys(window)) {
          const v = window[key];
          if (v && typeof v === 'object' && v._sessions) {
            const sessions = v._sessions;
            for (const id in sessions) {
              const sess = sessions[id];
              if (sess && !hooked.has(sess) && typeof sess.on === 'function') {
                hooked.add(sess);
                sess.on('ended', () => broadcastCallEnd('jssip-ended'));
                sess.on('failed', () => broadcastCallEnd('jssip-failed'));
                log('JsSIP: sesion enganchada');
              }
            }
          }
        }
      } catch (e) {}
    }
    return { start() { setInterval(scan, 2000); } };
  })();

  // ===========================================================================
  //  MODO "APRENDER" MULTI-PASO: graba la SECUENCIA de clics del usuario
  //  (ej. "Pausa" -> "Envio de correo"). Los clics SI se dejan pasar para que
  //  el menu real se abra y puedas continuar hasta el estado final.
  // ===========================================================================
  function startLearning(name) {
    Store.set(K.learning, { name, ts: Date.now(), steps: [] });
    log('APRENDER "' + name + '": haz los clics reales (ej. Pausa -> estado). Pulsa “Terminar” al acabar.');
    if (window.__vcaPanel) window.__vcaPanel.refresh();
  }
  function finishLearning() {
    const learn = Store.get(K.learning, null);
    Store.del(K.learning);
    if (learn && learn.steps && learn.steps.length) {
      const states = Store.get(K.states, []);
      const idx = states.findIndex(x => x.name === learn.name);
      const entry = { name: learn.name, steps: learn.steps };
      if (idx >= 0) states[idx] = entry; else states.push(entry);
      Store.set(K.states, states);
      log('APRENDIDO "' + learn.name + '" con ' + learn.steps.length + ' paso(s).');
    } else {
      log('Aprendizaje cancelado (0 pasos).');
    }
    if (window.__vcaPanel) { window.__vcaPanel.rebuild(); window.__vcaPanel.refresh(); }
  }
  function cancelLearning() {
    Store.del(K.learning);
    log('Aprendizaje cancelado.');
    if (window.__vcaPanel) window.__vcaPanel.refresh();
  }

  // Captura cada clic MIENTRAS se graba, sin bloquearlo (el menu debe abrirse).
  // El estado de grabacion (recording + steps) vive en localStorage de la pagina,
  // escrito por ESTE content script. No depende de que el popup/ventana siga
  // abierto: la ventana de control solo lee/muestra este estado.
  //   vca_learning = { recording:boolean, steps:[descriptor...], ts }
  // La grabación vive en el localStorage de la página. Algunas webs (GO) lo
  // pueden borrar: se guarda también en memoria y, si desaparece en plena
  // grabación, se repone desde ahí sin perder los pasos.
  let memLearn = null;
  // Marcas que deja el puente al detener / guardar / descartar una grabación
  // (por su `ts`): una copia vieja en memoria nunca la revive.
  function sanearLearn(l) {
    if (!l) return l;
    const m = Store.get('vca_learn_marcas', null) || {};
    const ts = l.ts || 0;
    if (m.fin && ts <= m.fin) return null;
    if (l.recording && m.stop && ts <= m.stop) return Object.assign({}, l, { recording: false });
    return l;
  }
  function leerLearning() {
    memLearn = sanearLearn(memLearn);
    const l0 = Store.get(K.learning, null), l = sanearLearn(l0);
    if (l0 && !l) { Store.del(K.learning); return null; }   // ya terminada: fuera
    // Si lo que hay es una copia más vieja de esta misma grabación (repuesta
    // desde un respaldo atrasado), manda la de memoria, que tiene todos los pasos.
    if (l && memLearn && l.ts === memLearn.ts && (l.steps || []).length < (memLearn.steps || []).length && l.recording === memLearn.recording) {
      Store.set(K.learning, memLearn);
      return memLearn;
    }
    if (l) { memLearn = l; return l; }
    // Sólo la página principal repone desde su memoria (un marco interno de
    // GO no se entera de que se detuvo la grabación).
    if (IS_TOP && memLearn && memLearn.recording) {
      Store.set(K.learning, memLearn);
      log('La página borró la grabación en curso: repuesta (' + (memLearn.steps || []).length + ' pasos).');
      return memLearn;
    }
    return null;
  }
  // La memoria se mantiene al día aunque no haya clics, para que un borrado de
  // la página justo antes de un clic no lo pierda.
  if (!EXT) setInterval(() => { try { if (vigente()) leerLearning(); } catch (e) {} }, 250);
  document.addEventListener('vca:learn-estado', (ev) => { try { memLearn = ev.detail ? JSON.parse(ev.detail) : null; } catch (e) {} });
  function grabando() {
    if (!vigente()) return false;
    if (EXT) return true;   // el marco no sabe si se graba: manda y la página decide
    const learn = leerLearning();
    return !!(learn && learn.recording);
  }
  function pushStep(step, human) {
    if (EXT) {
      step.xf = 1;                       // paso de un marco de otro sitio
      step.xfUrl = urlMarco();
      step.xfHost = location.hostname;
      aTop({ t: 'step', step: step, human: human + ' [formulario ' + location.hostname + ']' });
      return;
    }
    const learn = leerLearning();
    if (!learn || !learn.recording) return;
    learn.steps = learn.steps || [];
    step.sitio = MI_SITIO;            // en qué página va este paso
    step.t = Date.now();              // cuándo (para ordenar y respetar las esperas)
    step.ruta = location.pathname;    // en qué pantalla (ej. /login o /dashboard/go)
    step.url = location.origin + location.pathname;   // para abrir la página si no está
    learn.steps.push(step);
    Store.set(K.learning, learn);
    memLearn = learn;
    // Aviso al puente de la extensión, que guarda un respaldo fuera de la página
    try { document.dispatchEvent(new CustomEvent('vca:learn', { detail: JSON.stringify(learn) })); } catch (e) {}
    log('  grabado paso ' + learn.steps.length + ': ' + human);
  }

  // Clics normales (botones, enlaces, celdas...). Los controles de formulario NO
  // se graban por clic: un <select> nativo despliega su lista a nivel del sistema
  // operativo y un clic sintetico sobre una <option> no selecciona nada. Esos se
  // graban con el evento 'change' (abajo).
  // Sólo se graba lo que hace la PERSONA (isTrusted). Los clics y cambios que
  // dispara un programa (otra extensión, un script de la página o nuestra
  // propia repetición) no cuentan: antes se sumaban solos, ej. "VICIDIAL (90)"
  // sin haber tocado Vicidial.
  // Un menú puede avisar su cambio "por programa" justo después de que la
  // persona lo tocó (librerías de menús): esos sí valen, si hubo un clic o una
  // tecla de verdad en el último segundo y medio.
  let ultimoGesto = 0;
  ['pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach(t =>
    document.addEventListener(t, (ev) => { if (ev.isTrusted) ultimoGesto = Date.now(); }, true));
  function deLaPersona(ev) { return ev.isTrusted || Date.now() - ultimoGesto < 1500; }

  document.addEventListener('click', function (ev) {
    if (!ev.isTrusted || !grabando()) return;
    const t = ev.target;
    if (t && /^(select|option|input|textarea)$/i.test(t.tagName || '')) return;
    const act = (t.closest && t.closest('a,button,li,[role="button"],[onclick]')) || t;
    const desc = Locator.capture(act);
    desc.kind = 'click';
    pushStep(desc, desc.tag + ' "' + desc.text + '"');
  }, true);

  // Menus desplegables nativos (<select>), campos de texto y casillas.
  document.addEventListener('change', function (ev) {
    if (!deLaPersona(ev) || !grabando()) return;
    const el = ev.target;
    if (!el || !el.tagName) return;
    const tag = el.tagName.toLowerCase();

    if (tag === 'select') {
      const opt = el.options[el.selectedIndex];
      const desc = Locator.capture(el);
      desc.kind = 'select';
      desc.value = el.value;
      desc.optText = opt ? Locator.norm(opt.textContent) : '';
      desc.text = '';   // el textContent de un <select> son TODAS las opciones: inservible
      pushStep(desc, 'menu -> "' + desc.optText + '"');
    } else if (tag === 'input' || tag === 'textarea') {
      const desc = Locator.capture(el);
      if (/^(checkbox|radio)$/i.test(el.type || '')) {
        desc.kind = 'check'; desc.checked = !!el.checked;
        pushStep(desc, el.type + ' = ' + desc.checked);
      } else if (/^password$/i.test(el.type || '')) {
        // La clave se graba OCULTA (no queda a la vista en el atajo, el
        // registro ni lo que se exporta) y sólo en este computador, para que
        // el flujo entre solo a GO.
        if (!el.value) return;
        desc.kind = 'input'; desc.text = ''; desc.secreto = true; desc.value = ocultarClave(el.value);
        pushStep(desc, 'clave (guardada oculta)');
      } else {
        desc.kind = 'input'; desc.value = el.value; desc.text = '';
        // ¿Es el RUT del cliente que está en Vicidial (o escribiste "RUT")?
        // Entonces el paso no guarda ese número: al repetirlo usará el RUT del
        // cliente de ese momento, con el mismo formato (puntos y guion).
        const v = String(el.value || '').trim();
        const cli = clienteActual();
        const soloRut = v.toUpperCase().replace(/[^0-9K]/g, '');
        const palabra = /^\{?rut\}?$/i.test(v);
        // Un campo de RUT (por su id, nombre o texto de ayuda) con algo que parece RUT:
        // vale aunque GO haya borrado el dato del cliente o el RUT venga pegado.
        const pista = [el.id, el.name, el.getAttribute('formcontrolname'), el.placeholder, el.getAttribute('aria-label')].join(' ');
        const campoRut = /rut/i.test(pista) && /^\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]$/.test(v);
        if (palabra || campoRut || (cli && soloRut && soloRut === (cli.num + cli.dv).toUpperCase())) {
          desc.dyn = 'rut';
          desc.fmt = palabra ? { puntos: true, guion: true } : { puntos: /\./.test(v), guion: /-/.test(v) };
          pushStep(desc, 'texto = RUT del cliente (se toma de Vicidial al repetir)');
        } else {
          pushStep(desc, 'texto = "' + String(el.value).slice(0, 30) + '"');
        }
      }
    }
  }, true);

  // ===========================================================================
  //  [DESACTIVADO EN v2] PANEL FLOTANTE INYECTADO EN LA PAGINA
  //  Toda la UI vive ahora en el popup de la extension. Estas funciones
  //  (buildPanel / electPanelFrame / removePanel) YA NO SE LLAMAN; se conservan
  //  como referencia. `window.__vcaPanel` nunca se define, por lo que los
  //  `if (window.__vcaPanel)` repartidos por el archivo son no-ops inofensivos.
  // ===========================================================================
  function buildPanel() {
    if (document.getElementById('vca-panel')) return;

    const wrap = document.createElement('div');
    wrap.id = 'vca-panel';
    wrap.innerHTML = `
      <style>
        #vca-panel{position:fixed;top:12px;right:12px;z-index:2147483647;width:250px;
          font:12px/1.4 system-ui,Segoe UI,Arial,sans-serif;color:#111;background:#fff;
          border:1px solid #cfd6e4;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.22);
          overflow:hidden;user-select:none}
        #vca-panel *{box-sizing:border-box}
        #vca-head{background:#0d3b66;color:#fff;padding:8px 10px;display:flex;
          align-items:center;justify-content:space-between;cursor:move}
        #vca-head b{font-size:12px;letter-spacing:.2px}
        #vca-body{padding:10px;max-height:70vh;overflow:auto}
        .vca-btn{display:block;width:100%;text-align:left;margin:4px 0;padding:7px 9px;
          border:1px solid #cfd6e4;border-radius:7px;background:#f6f8fc;cursor:pointer;
          font-size:12px;position:relative}
        .vca-btn:hover{background:#eef2fa}
        .vca-btn.armed{background:#12a150;border-color:#0e8a44;color:#fff;font-weight:600}
        .vca-btn .x{position:absolute;right:6px;top:6px;opacity:.5}
        .vca-btn .x:hover{opacity:1}
        .vca-row{display:flex;gap:6px;margin-top:8px}
        .vca-row button{flex:1;padding:6px;border:1px solid #cfd6e4;border-radius:7px;
          background:#fff;cursor:pointer;font-size:11px}
        .vca-row button:hover{background:#f0f3f9}
        #vca-hint{margin-top:8px;padding:7px;background:#fff7e0;border:1px solid #f0d38a;
          border-radius:7px;font-size:11px;display:none}
        #vca-status{margin-top:8px;font-size:11px;color:#555}
        #vca-dbg{margin-top:8px;display:none}
        #vca-dbg textarea{width:100%;height:120px;font:10px/1.3 monospace;
          border:1px solid #cfd6e4;border-radius:6px;padding:6px;resize:vertical}
        #vca-dbg input{width:100%;padding:5px;margin:3px 0;border:1px solid #cfd6e4;border-radius:6px}
        #vca-dbg label{font-size:10px;color:#555;display:block;margin-top:6px}
        .vca-mini{font-size:10px;color:#777;margin-top:4px}
        #vca-panel.min{width:auto}
        #vca-panel.min #vca-body{display:none}
      </style>
      <div id="vca-head"><b>⚡ ShortCut-Vicidial-GO</b><span id="vca-min" style="cursor:pointer">▾</span></div>
      <div id="vca-body">
        <div id="vca-states"></div>
        <input id="vca-name" placeholder="Nombre del estado (ej: Correo)"
          style="width:100%;padding:6px;border:1px solid #cfd6e4;border-radius:7px;font-size:12px;margin-top:8px">
        <div class="vca-row">
          <button id="vca-learn">▶ Iniciar grabación</button>
          <button id="vca-disarm">✖ Desarmar</button>
        </div>
        <div id="vca-hint"></div>
        <div id="vca-rec" style="display:none;margin-top:8px;padding:7px;background:#e8f5ff;border:1px solid #9ecbe8;border-radius:7px">
          <div id="vca-rec-info" style="font-size:11px;margin-bottom:6px"></div>
          <div class="vca-row" style="margin-top:0">
            <button id="vca-rec-done">■ Detener grabación</button>
            <button id="vca-rec-cancel">✖ Cancelar</button>
          </div>
        </div>
        <div id="vca-status"></div>
        <div class="vca-row">
          <button id="vca-dbgtoggle">🐞 Debug</button>
        </div>
        <div id="vca-dbg">
          <label>Patron WebSocket (regex) que indica fin de llamada</label>
          <input id="vca-ws" placeholder="ej: hangup|callEnd|endcall">
          <label>Selector CSS que APARECE al terminar (opcional)</label>
          <input id="vca-wrap" placeholder="ej: #wrapupPanel">
          <label>Selector del boton de colgar (su desaparicion = fin)</label>
          <input id="vca-hang" placeholder="ej: #btnHangup">
          <div class="vca-mini">
            <label style="display:inline"><input type="checkbox" id="vca-timer" style="width:auto"> Detector por cronometro</label>
          </div>
          <div class="vca-mini">
            <label style="display:inline"><input type="checkbox" id="vca-autowatch" style="width:auto"> Auto-aplicar al habilitarse el control</label>
          </div>
          <div class="vca-mini">
            <label style="display:inline"><input type="checkbox" id="vca-reqdis" style="width:auto"> Exigir ver el control deshabilitado primero</label>
          </div>
          <div class="vca-mini">
            <label style="display:inline"><input type="checkbox" id="vca-keepalive" style="width:auto"> Mantener activo en 2° plano (audio inaudible)</label>
          </div>
          <div class="vca-row">
            <button id="vca-testend">▶ Simular fin de llamada</button>
            <button id="vca-clearlog">Limpiar</button>
          </div>
          <label>Registro / tramas WebSocket</label>
          <textarea id="vca-logbox" readonly></textarea>
        </div>
      </div>`;
    document.documentElement.appendChild(wrap);
    wrap.classList.add('min'); // minimizado por defecto: menos cosas flotando

    const $ = (id) => wrap.querySelector(id);

    // --- Arrastrar
    (function drag() {
      const head = $('#vca-head'); let sx, sy, ox, oy, on = false;
      head.addEventListener('mousedown', (e) => {
        if (e.target.id === 'vca-min') return;
        on = true; sx = e.clientX; sy = e.clientY;
        const r = wrap.getBoundingClientRect(); ox = r.left; oy = r.top;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!on) return;
        wrap.style.left = (ox + e.clientX - sx) + 'px';
        wrap.style.top = (oy + e.clientY - sy) + 'px';
        wrap.style.right = 'auto';
      });
      window.addEventListener('mouseup', () => on = false);
    })();

    $('#vca-min').addEventListener('click', () => wrap.classList.toggle('min'));

    $('#vca-learn').addEventListener('click', () => {
      const inp = $('#vca-name');
      const name = (inp.value || '').trim();
      if (!name) { inp.focus(); return; }
      startLearning(name);
      inp.value = '';
    });
    $('#vca-disarm').addEventListener('click', () => { setArmed(null); });
    $('#vca-rec-done').addEventListener('click', () => finishLearning());
    $('#vca-rec-cancel').addEventListener('click', () => cancelLearning());

    $('#vca-dbgtoggle').addEventListener('click', () => {
      const dbg = $('#vca-dbg');
      const show = dbg.style.display !== 'block';
      dbg.style.display = show ? 'block' : 'none';
      setSetting({ debug: show });
      if (show) syncDbgInputs();
    });

    $('#vca-ws').addEventListener('change', (e) => setSetting({ wsPattern: e.target.value.trim() }));
    $('#vca-wrap').addEventListener('change', (e) => setSetting({ wrapupSelector: e.target.value.trim() }));
    $('#vca-hang').addEventListener('change', (e) => setSetting({ hangupSelector: e.target.value.trim() }));
    $('#vca-timer').addEventListener('change', (e) => setSetting({ useTimer: e.target.checked }));
    $('#vca-autowatch').addEventListener('change', (e) => setSetting({ autoWatch: e.target.checked }));
    $('#vca-reqdis').addEventListener('change', (e) => setSetting({ requireDisableFirst: e.target.checked }));
    $('#vca-keepalive').addEventListener('change', (e) => {
      setSetting({ keepAlive: e.target.checked });
      if (e.target.checked) startKeepAlive();
    });
    $('#vca-testend').addEventListener('click', () => broadcastCallEnd('SIMULADO'));
    $('#vca-clearlog').addEventListener('click', () => { Store.set(K.log, []); Store.set('vca_wsframes', []); });

    function syncDbgInputs() {
      const s = settings();
      $('#vca-ws').value = s.wsPattern;
      $('#vca-wrap').value = s.wrapupSelector;
      $('#vca-hang').value = s.hangupSelector;
      $('#vca-timer').checked = s.useTimer;
      $('#vca-autowatch').checked = s.autoWatch;
      $('#vca-reqdis').checked = s.requireDisableFirst;
      $('#vca-keepalive').checked = s.keepAlive;
    }

    const panel = {
      rebuild() {
        const host = $('#vca-states');
        host.innerHTML = '';
        const states = Store.get(K.states, []);
        if (!states.length) {
          host.innerHTML = '<div class="vca-mini">Aun no hay estados. Pulsa “Aprender estado”, escribe un nombre y haz la secuencia real: “Pausa” y luego el estado.</div>';
        }
        const armed = getArmed();
        states.forEach((st) => {
          const steps = stepsOf(st);
          const last = steps.length ? steps[steps.length - 1] : {};
          const b = document.createElement('button');
          b.className = 'vca-btn' + (armed && armed.name === st.name ? ' armed' : '');
          b.innerHTML = (armed && armed.name === st.name ? '🟢 ' : '⚪ ') +
            st.name + '<span class="x" title="Borrar">🗑</span>' +
            '<div class="vca-mini">' + steps.length + ' paso(s) · “' + (last.text || '') + '”</div>';
          b.addEventListener('click', (e) => {
            if (e.target.classList.contains('x')) {
              const all = Store.get(K.states, []).filter(x => x.name !== st.name);
              Store.set(K.states, all); panel.rebuild(); return;
            }
            const cur = getArmed();
            if (cur && cur.name === st.name) { setArmed(null); }   // toggle off
            else { setArmed({ name: st.name, steps: stepsOf(st), __armedAt: Date.now() }); }
            panel.refresh();
          });
          host.appendChild(b);
        });
      },
      refresh() {
        const armed = getArmed();
        Array.from($('#vca-states').querySelectorAll('.vca-btn')).forEach((b, i) => {
          const states = Store.get(K.states, []);
          const st = states[i]; if (!st) return;
          const on = armed && armed.name === st.name;
          b.classList.toggle('armed', on);
        });
        // Barra de grabacion (modo aprender)
        const learn = Store.get(K.learning, null);
        const rec = $('#vca-rec');
        if (learn) {
          wrap.classList.remove('min'); // expandir para ver la grabacion
          rec.style.display = 'block';
          const n = (learn.steps || []).length;
          $('#vca-rec-info').innerHTML =
            '● Grabando <b>“' + learn.name + '”</b> — ' + n + ' clic(s).<br>' +
            'Haz los clics reales (Pausa → estado); al terminar pulsa <b>■ Detener grabación</b>.';
          $('#vca-status').textContent = 'Grabando secuencia...';
        } else {
          rec.style.display = 'none';
          $('#vca-status').textContent = armed
            ? 'ARMADO: “' + (armed.name || armed.text) + '” se aplicara al colgar.'
            : 'En espera. Selecciona un estado para armar.';
        }
      },
      setHint(t) {
        const h = $('#vca-hint');
        h.textContent = t; h.style.display = t ? 'block' : 'none';
      }
    };

    window.__vcaPanel = panel;
    panel.rebuild();
    panel.refresh();

    // refresco periodico del log/estado
    window.__vcaPanelInterval = setInterval(() => {
      if ($('#vca-dbg').style.display === 'block') {
        const logArr = Store.get(K.log, []);
        const ws = Store.get('vca_wsframes', []);
        $('#vca-logbox').value =
          '== REGISTRO ==\n' + logArr.slice(-40).join('\n') +
          (ws.length ? '\n\n== TRAMAS WS (ultimas) ==\n' + ws.slice(-20).join('\n') : '');
      }
      panel.refresh();
    }, 1200);
  }

  // ===========================================================================
  //  ELECCION DE FRAME PARA EL PANEL
  //  El panel se dibuja en el frame VISIBLE mas grande (donde mira el agente),
  //  aunque la UI del agente este dentro de un iframe. Excluye framesets y
  //  frames sin cuerpo. Se re-evalua cada ~1.5s y sobrevive a re-render de la SPA.
  // ===========================================================================
  const MY_ID = Math.random().toString(36).slice(2);
  const AREAS = 'vca_areas';

  function myArea() {
    // Un <frameset> no renderiza contenido fijo: lo excluimos devolviendo 0.
    if (!document.body || document.body.tagName === 'FRAMESET') return 0;
    return (window.innerWidth || 0) * (window.innerHeight || 0);
  }

  function removePanel() {
    const p = document.getElementById('vca-panel');
    if (p) p.remove();
    if (window.__vcaPanelInterval) { clearInterval(window.__vcaPanelInterval); window.__vcaPanelInterval = null; }
    window.__vcaPanel = null;
  }

  function electPanelFrame() {
    const now = Date.now();
    const areas = Store.get(AREAS, {});
    areas[MY_ID] = { area: myArea(), ts: now };
    for (const k in areas) { if (now - (areas[k].ts || 0) > 4000) delete areas[k]; }
    Store.set(AREAS, areas);

    let best = null;
    for (const k in areas) {
      if (!areas[k] || areas[k].area <= 0) continue;
      if (!best || areas[k].area > areas[best].area ||
         (areas[k].area === areas[best].area && k > best)) best = k;
    }
    if (best === MY_ID) buildPanel();      // soy el frame elegido -> dibujo (idempotente)
    else if (best) removePanel();          // gana otro frame -> quito el mio si lo tuviera
  }

  // ===========================================================================
  //  KEEP-ALIVE: mantiene la pestaña "activa" en segundo plano reproduciendo un
  //  tono INAUDIBLE (10 Hz, volumen mínimo). Los navegadores no congelan/ralentizan
  //  las pestañas que estan emitiendo audio, asi el auto-aplicado sigue funcionando
  //  aunque estes en otra pestaña. Solo en el frame lider (uno basta por pestaña).
  // ===========================================================================
  function startKeepAlive() {
    if (window.__vcaKeepAlive) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.03;     // el navegador detecta "audio activo"...
      osc.frequency.value = 10;   // ...pero a 10 Hz ningun auricular/altavoz lo reproduce (inaudible)
      osc.type = 'sine';
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      window.__vcaKeepAlive = ctx;
      // Reanudar si el navegador suspende el contexto (politica de autoplay).
      // Requiere un gesto del usuario: cualquier clic/tecla en la pagina lo activa.
      const resume = () => { try { if (ctx.state !== 'running') ctx.resume(); } catch (e) {} };
      resume();
      setInterval(resume, 3000);
      ['click', 'pointerdown', 'mousedown', 'keydown', 'touchstart', 'visibilitychange']
        .forEach(ev => document.addEventListener(ev, resume, true));
      // Publicar el estado ('running'/'suspended') para que la ventana lo muestre.
      const publish = () => { try { Store.set('vca_ka', { state: ctx.state, ts: Date.now() }); } catch (e) {} };
      publish();
      setInterval(publish, 2000);
      log('Keep-alive de audio iniciado (estado: ' + ctx.state + ').');
    } catch (e) { log('Keep-alive no disponible: ' + e); }
  }

  // ===========================================================================
  //  RELOJ DE PAUSAS (Colación / Break / Baño ...) — añadido
  //  Detecta la pausa activa leyendo el botón de estado del agente
  //  (.agent-status .dropdown-toggle): su texto es "En espera" cuando estás
  //  disponible y pasa a ser el nombre de la pausa al entrar en una. Muestra
  //  un cronómetro flotante con límite y aviso. La detección corre en el frame
  //  del botón y comparte el estado por localStorage; el reloj se dibuja en el
  //  frame superior. Límites: editar limitMin en PAUSE_LIMITS.
  // ===========================================================================
  function normPausa(t) {
    return (t || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  // limitMin: 0 = sin límite (solo cuenta el tiempo, sin alerta).
  const PAUSE_LIMITS = [
    { keys: ['colacion', 'almuerzo'], label: 'Colación', emoji: '🍽️', limitMin: 60 },
    { keys: ['break', 'descanso'],    label: 'Break',    emoji: '☕',  limitMin: 15 },
    { keys: ['bano'],                 label: 'Baño',     emoji: '🚻',  limitMin: 0 },
    { keys: ['envio correo', 'correo'], label: 'Envío correo', emoji: '✉️', limitMin: 0 },
    { keys: ['gestion'],              label: 'Gestión',  emoji: '🗂️', limitMin: 0 },
    { keys: ['capacitacion'],         label: 'Capacitación', emoji: '🎓', limitMin: 0 },
    { keys: ['reunion'],              label: 'Reunión',  emoji: '👥', limitMin: 0 },
    { keys: ['incidencia'],           label: 'Incidencia', emoji: '⚠️', limitMin: 0 }
  ];
  function matchPausa(text) {
    const n = normPausa(text);
    if (!n) return null;
    for (const p of PAUSE_LIMITS) { if (p.keys.some(k => n.includes(k))) return p; }
    return null;
  }
  // Detecta si el agente está EN PAUSA leyendo el panel del agente de este
  // Hermes360, que muestra "Estás en pausa." + "Pausar - <NOMBRE>" + "Salir de
  // pausa" cuando estás pausado. Devuelve el descriptor de la pausa, o null.
  // Palabras clave ordenadas de más larga a más corta, para que "envio correo"
  // gane sobre "correo" al armar el patrón de alternativas.
  const PAUSA_KEYS_SORTED = PAUSE_LIMITS.reduce((a, p) => a.concat(p.keys), [])
    .sort((a, b) => b.length - a.length);
  // Matchea el nombre que va JUSTO tras "Pausar -" (el estado actual), NO las
  // demás opciones del menú que también pueden aparecer en el texto del frame.
  const PAUSA_RE = new RegExp('pausar\\s*[-–:]\\s*(' +
    PAUSA_KEYS_SORTED.map(k => k.replace(/ /g, '\\s+')).join('|') + ')');
  // Vicidial: el código de pausa elegido se anota al pasar por
  // PauseCodeSelect_submit (la función de Vicidial que lo aplica).
  function nombrePausaVici(code) {
    try {
      const a = Array.from(document.querySelectorAll('a[onclick*="PauseCodeSelect_submit"]'))
        .find(x => (x.getAttribute('onclick') || '').indexOf("'" + code + "'") >= 0);
      const t = a ? a.textContent.replace(/\s+/g, ' ').trim() : '';
      return t || String(code || '');
    } catch (e) { return String(code || ''); }
  }
  function hookPausaVici() {
    if (!IS_VICI || !IS_TOP) return;
    const f = window.PauseCodeSelect_submit;
    if (typeof f !== 'function' || f.__vca) return;
    const envuelta = function (code) {
      try { Store.set('vca_pausecode', { code: String(code || ''), label: nombrePausaVici(code), t: Date.now() }); } catch (e) {}
      return f.apply(this, arguments);
    };
    envuelta.__vca = true;
    try { window.PauseCodeSelect_submit = envuelta; } catch (e) {}
  }
  function readPauseStateVici() {
    if (!IS_TOP) return null;
    if (String(window.VDRP_stage || '').toUpperCase() !== 'PAUSED') return null;
    if (viciEnLlamada() || viciEnDispo()) return null;
    const pc = Store.get('vca_pausecode', null);
    const nombre = pc ? (pc.label || pc.code) : '';
    const m = nombre && matchPausa(nombre);
    if (m) return m;
    return { keys: [], label: nombre ? 'Pausa ' + nombre : 'En pausa', emoji: '⏸️', limitMin: 0 };
  }
  function readPauseState() {
    if (IS_VICI) return readPauseStateVici();
    let txt = '';
    try { txt = normPausa((document.body && document.body.innerText) || ''); } catch (e) {}
    if (!txt) return null;
    // Señales de "estoy en pausa" (solo aparecen durante la pausa):
    if (!(txt.includes('estas en pausa') || txt.includes('salir de pausa'))) return null;
    const m = PAUSA_RE.exec(txt);
    if (m) return matchPausa(m[1]);
    return { keys: [], label: 'En pausa', emoji: '⏸️', limitMin: 0 };
  }
  const PauseReloj = {
    box: null, _cur: null, lastKey: null, hiddenKey: null, warnFired: false, overFired: false,
    ensureBox() {
      if (this.box) return this.box;
      const b = document.createElement('div');
      b.id = 'vca-pausa-reloj';
      b.style.cssText = [
        'position:fixed', 'right:14px', 'bottom:14px', 'z-index:2147483647',
        'min-width:172px', 'padding:10px 12px', 'border-radius:12px',
        'font-family:system-ui,Segoe UI,Arial,sans-serif', 'color:#fff',
        'box-shadow:0 6px 22px rgba(0,0,0,.3)', 'background:#16323b',
        'display:none', 'user-select:none', 'cursor:default'
      ].join(';');
      b.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
        + '<span data-r="title" style="font-size:12px;font-weight:700"></span>'
        + '<span data-r="close" title="Ocultar" style="cursor:pointer;opacity:.8;font-size:13px">✕</span></div>'
        + '<div data-r="time" style="font-size:26px;font-weight:800;line-height:1.1;margin-top:2px;font-variant-numeric:tabular-nums"></div>'
        + '<div data-r="limit" style="font-size:11px;opacity:.85;margin-top:1px"></div>'
        + '<div style="height:5px;border-radius:3px;background:rgba(255,255,255,.25);margin-top:7px;overflow:hidden">'
        + '<div data-r="bar" style="height:100%;width:0%;background:#fff;transition:width .5s"></div></div>';
      (document.documentElement || document.body).appendChild(b);
      b.querySelector('[data-r="close"]').addEventListener('click', () => { this.hiddenKey = this.lastKey; b.style.display = 'none'; });
      this.box = b;
      return b;
    },
    beep(times) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC(); let t = ctx.currentTime;
        for (let i = 0; i < (times || 1); i++) {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'square'; osc.frequency.value = 880; gain.gain.value = 0.15;
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(t); osc.stop(t + 0.18); t += 0.28;
        }
        setTimeout(() => { try { ctx.close(); } catch (e) {} }, (times || 1) * 300 + 200);
      } catch (e) {}
    },
    render(state) {
      const c = state;
      if (!c) { if (this.box) this.box.style.display = 'none'; this.lastKey = null; return; }
      const key = c.id + ':' + c.startedAt;
      if (key !== this.lastKey) { this.lastKey = key; this.warnFired = false; this.overFired = false; }
      if (this.hiddenKey === key) { if (this.box) this.box.style.display = 'none'; return; }
      const box = this.ensureBox();
      const mmss = (sec) => { const s = Math.max(0, Math.floor(sec)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
      const elapsed = (Date.now() - c.startedAt) / 1000;
      const limitSec = c.limitMin * 60;
      const pct = limitSec > 0 ? Math.min(100, elapsed / limitSec * 100) : 0;
      const over = limitSec > 0 && elapsed >= limitSec;
      const warn = limitSec > 0 && !over && pct >= 80;
      box.style.display = 'block';
      box.querySelector('[data-r="title"]').textContent = c.emoji + ' ' + c.label;
      box.querySelector('[data-r="time"]').textContent = mmss(elapsed);
      box.querySelector('[data-r="limit"]').textContent = limitSec > 0 ? ('Límite ' + mmss(limitSec) + (over ? ' · ¡EXCEDIDO!' : '')) : 'Sin límite';
      box.querySelector('[data-r="bar"]').style.width = pct + '%';
      let bg = '#166534', bar = '#4ade80';
      if (warn) { bg = '#9a6a00'; bar = '#fbbf24'; }
      if (over) { const blink = Math.floor(Date.now() / 500) % 2 === 0; bg = blink ? '#b91c1c' : '#7f1d1d'; bar = '#fca5a5'; }
      box.style.background = bg;
      box.querySelector('[data-r="bar"]').style.background = bar;
      if (warn && !this.warnFired) { this.warnFired = true; this.beep(1); }
      if (over && !this.overFired) { this.overFired = true; this.beep(3); }
    }
  };
  // ===========================================================================
  //  CUENTA REGRESIVA PARA TIPIFICAR (Vicidial)
  //  Hay ~30 s para tipificar desde que se entra al formulario de tipificación
  //  (el marco del script, ej. "Corte Llamadas BCISALUR"); si se pasa, el
  //  formulario se cae y se pierde lo escrito. El reloj arranca cuando ese
  //  formulario se vuelve visible, avisa con sonido a los 10 y 5 s, y se
  //  apaga al pulsar "Cortar y Tipificar" o al cerrarse el formulario.
  //  Calibración: − / + en el reloj (se recuerda). Y si el formulario se
  //  cierra solo sin haber tipificado, se mide cuánto duró de verdad y se
  //  ofrece usar esa medida (con 2 s de margen) con un clic.
  //  Clic en el número: reinicia la cuenta.
  // ===========================================================================
  const TIPIF = { LIM: 'vca_tipif_lim', POS: 'vca_tipif_pos', DEF: 25 };
  const RelojTipif = {
    caja: null, t0: 0, activo: false, enviado: false, clave: '', avisos: {}, ofreciendo: 0,
    limite() { const v = Number(Store.get(TIPIF.LIM, TIPIF.DEF)); return v >= 5 && v <= 180 ? v : TIPIF.DEF; },
    // El formulario: un marco visible y grande dentro del panel del script,
    // o de otro sitio. No cuentan el webphone ni la pestaña FORM de Vicidial.
    formulario() {
      for (const f of document.querySelectorAll('iframe')) {
        const id = (f.id || '') + ' ' + (f.name || '');
        if (/webphone|vcFormIFrame/i.test(id)) continue;
        let host = '';
        try { host = new URL(f.getAttribute('src') || '', location.href).host; } catch (e) {}
        const enScript = !!(f.closest && f.closest('[id*="script" i]'));
        if (!enScript && (!host || host === location.host)) continue;
        try { if (getComputedStyle(f).visibility !== 'visible') continue; } catch (e) { continue; }
        const r = f.getBoundingClientRect();
        if (r.width < 200 || r.height < 100) continue;
        return f;
      }
      return null;
    },
    tick() {
      if (!vigente()) return;
      const f = this.formulario();
      const clave = f ? (f.getAttribute('src') || 'form') : '';
      if (clave && clave !== this.clave) {
        this.clave = clave; this.form = f; this.iniciar(); this.ubicar();
        log('Reloj de tipificación: se abrió el formulario → cuenta de ' + this.limite() + ' s (' + String(clave).slice(0, 80) + ')');
      } else if (!clave && this.clave) {
        this.clave = '';
        if (this.activo) log('Reloj de tipificación: el formulario se cerró a los ' + Math.round((Date.now() - this.t0) / 1000) + ' s' + (this.enviado ? '' : ' sin tipificar'));
        this.cerrado();
      }
      if (this.activo) this.pintar();
    },
    iniciar() {
      this.t0 = Date.now(); this.activo = true; this.enviado = false; this.avisos = {}; this.ofreciendo = 0;
      this.pintar();
    },
    tipificado() {
      if (!this.activo) return;
      this.enviado = true; this.activo = false;
      log('Reloj de tipificación: tipificado a los ' + Math.round((Date.now() - this.t0) / 1000) + ' s');
      this.mensaje('✓ Tipificado a los ' + Math.round((Date.now() - this.t0) / 1000) + ' s', '#166534', 2500);
    },
    cerrado() {
      if (!this.activo) { if (!this.ofreciendo) this.ocultar(); return; }
      this.activo = false;
      const seg = Math.round((Date.now() - this.t0) / 1000);
      // Se cerró sin tipificar: si el tiempo difiere del límite, ofrecer ajustarlo.
      const sugerido = seg - 2;
      if (!this.enviado && seg >= 8 && seg <= 180 && sugerido !== this.limite()) this.ofrecer(seg, sugerido);
      else this.ocultar();
    },
    ajustar(d) {
      Store.set(TIPIF.LIM, Math.max(5, Math.min(180, this.limite() + d)));
      if (this.activo) this.pintar(); else this.mensaje('Límite: ' + this.limite() + ' s', '#123a6d', 1500);
    },
    ocultar() { if (this.caja) this.caja.style.display = 'none'; },
    // Donde quedó la última vez (se recuerda siempre). Si nunca se movió, bajo
    // los menús del formulario, a la izquierda: ahí no lo tapa el cotizador.
    ubicar() {
      const b = this.asegurarCaja();
      const pos = Store.get(TIPIF.POS, null);
      let left, top;
      if (pos) { left = pos.left; top = pos.top; }
      else {
        const r = this.form && this.form.getBoundingClientRect();
        left = r ? r.left + 12 : 24;
        top = r ? r.top + Math.max(60, Math.min(r.height - 100, 225)) : 200;
      }
      left = Math.max(0, Math.min(innerWidth - 220, left));
      top = Math.max(0, Math.min(innerHeight - 100, top));
      b.style.left = Math.round(left) + 'px'; b.style.top = Math.round(top) + 'px'; b.style.right = 'auto';
    },
    asegurarCaja() {
      if (this.caja && document.documentElement.contains(this.caja)) return this.caja;
      const b = document.createElement('div');
      b.id = 'vca-reloj-tipif';
      b.style.cssText = [
        'position:fixed', 'z-index:2147483647', 'display:none', 'left:24px', 'top:72px', 'cursor:grab',
        'background:#fff', 'border:1px solid rgba(18,58,109,.25)', 'border-radius:16px',
        'box-shadow:0 10px 30px rgba(12,28,56,.25), 0 2px 6px rgba(12,28,56,.12)',
        'padding:10px 12px', 'font-family:"Segoe UI",system-ui,Arial,sans-serif', 'color:#15202b',
        'user-select:none', 'min-width:190px'
      ].join(';');
      (document.body || document.documentElement).appendChild(b);
      // Se arrastra desde cualquier parte que no sea un botón o el número
      let arr = null;
      b.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button,[data-r="num"]')) return;
        const r = b.getBoundingClientRect();
        arr = { dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY, movio: false };
        b.style.cursor = 'grabbing';
        try { b.setPointerCapture(e.pointerId); } catch (e2) {}
      });
      // Doble clic en la manito: vuelve a su lugar bajo los menús del formulario
      b.addEventListener('dblclick', (e) => {
        const bajo = document.elementFromPoint(e.clientX, e.clientY);
        if (!bajo || !bajo.closest('[data-r="asa"]')) return;
        Store.del(TIPIF.POS); this.ubicar();
      });
      b.addEventListener('pointermove', (e) => {
        if (!arr) return;
        if (Math.abs(e.clientX - arr.x) + Math.abs(e.clientY - arr.y) > 3) arr.movio = true;
        if (!arr.movio) return;
        const left = Math.max(0, Math.min(innerWidth - 60, e.clientX - arr.dx));
        const top = Math.max(0, Math.min(innerHeight - 40, e.clientY - arr.dy));
        b.style.left = left + 'px'; b.style.top = top + 'px'; b.style.right = 'auto';
      });
      b.addEventListener('pointerup', () => {
        if (!arr) return; const movio = arr.movio; arr = null; b.style.cursor = 'grab';
        if (!movio) return;   // un clic sin arrastrar no cambia la posición guardada
        const r = b.getBoundingClientRect(); Store.set(TIPIF.POS, { left: Math.round(r.left), top: Math.round(r.top) });
      });
      b.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        const q = a.getAttribute('data-a');
        if (q === 'menos') this.ajustar(-1);
        else if (q === 'mas') this.ajustar(1);
        else if (q === 'reiniciar') this.iniciar();
        else if (q === 'cerrar') { this.activo = false; this.ofreciendo = 0; this.ocultar(); }
        else if (q === 'usar') { Store.set(TIPIF.LIM, Number(a.getAttribute('data-v'))); this.ofreciendo = 0; this.mensaje('Límite: ' + this.limite() + ' s', '#123a6d', 1800); }
      });
      this.caja = b;
      return b;
    },
    pintar() {
      const b = this.asegurarCaja();
      const lim = this.limite();
      const pasado = (Date.now() - this.t0) / 1000;
      const resto = lim - pasado;
      const n = Math.ceil(resto);
      // Avisos: un pitido a los 10 s, dos a los 5 s, tres al llegar a 0
      [[10, 1], [5, 2], [0, 3]].forEach(([s, v]) => { if (resto <= s && !this.avisos[s] && lim > s) { this.avisos[s] = 1; PauseReloj.beep(v); } });
      let color = '#16a34a';
      if (resto <= 10) color = '#d97706';
      if (resto <= 5) color = '#dc2626';
      const parpadea = resto <= 5 && Math.floor(Date.now() / 400) % 2 === 0;
      const frac = Math.max(0, Math.min(1, resto / lim));
      const C = 2 * Math.PI * 26;
      // La estructura se arma una vez; en cada tick sólo cambian números y
      // colores (si se rehiciera entera, los botones perderían clics).
      if (b.__modo !== 'reloj') {
        const btn = 'all:unset;cursor:pointer;width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;background:#eef2f7;color:#123a6d;font-weight:800;font-size:14px';
        b.innerHTML =
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<div data-r="num" data-a="reiniciar" title="Clic: reiniciar la cuenta" style="position:relative;width:64px;height:64px;cursor:pointer;flex:none">' +
              '<svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg)">' +
                '<circle cx="32" cy="32" r="26" fill="none" stroke="#e5eaf1" stroke-width="6"/>' +
                '<circle data-r="arco" cx="32" cy="32" r="26" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '"/>' +
              '</svg>' +
              '<div data-r="cifra" style="position:absolute;inset:8px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:800;font-variant-numeric:tabular-nums"></div>' +
            '</div>' +
            '<div style="flex:1;min-width:0">' +
              '<div data-r="tit" style="font-size:13px;font-weight:800;color:#123a6d"></div>' +
              '<div data-r="sub" style="font-size:11px;color:#5d6b7a;margin:2px 0 6px"></div>' +
              '<div style="display:flex;align-items:center;gap:5px">' +
                '<button data-a="menos" title="Bajar el límite 1 s" style="' + btn + '">−</button>' +
                '<span data-r="lim" style="font-size:11px;font-weight:700;min-width:34px;text-align:center"></span>' +
                '<button data-a="mas" title="Subir el límite 1 s" style="' + btn + '">+</button>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;align-self:stretch">' +
              '<button data-a="cerrar" title="Ocultar" style="all:unset;cursor:pointer;color:#94a3b8;font-size:14px">✕</button>' +
              '<div data-r="asa" title="Arrastra para moverlo · doble clic: volver bajo los menús" style="cursor:grab;color:#94a3b8;font-size:15px;line-height:1">✋</div>' +
            '</div>' +
          '</div>';
        b.__modo = 'reloj';
      }
      const q = (r) => b.querySelector('[data-r="' + r + '"]');
      b.style.display = 'block';
      b.style.borderColor = resto <= 5 ? color : 'rgba(18,58,109,.25)';
      const arco = q('arco');
      arco.setAttribute('stroke', color);
      arco.setAttribute('stroke-dashoffset', (C * (1 - frac)).toFixed(1));
      const cifra = q('cifra');
      cifra.textContent = n > 0 ? n : (n === 0 ? '0' : '+' + (-n));
      cifra.style.fontSize = (n < 0 ? 18 : 24) + 'px';
      cifra.style.color = parpadea ? '#fff' : color;
      cifra.style.background = parpadea ? color : 'transparent';
      q('tit').textContent = resto > 0 ? 'Tipificar' : '¡Tiempo!';
      q('sub').textContent = resto > 0 ? 'quedan ' + n + ' s' : 'se pasó el límite';
      q('lim').textContent = lim + ' s';
    },
    mensaje(txt, color, ms) {
      const b = this.asegurarCaja();
      b.style.display = 'block'; b.style.borderColor = 'rgba(18,58,109,.25)'; b.__modo = 'mensaje';
      b.innerHTML = '<div style="font-size:13px;font-weight:700;color:' + color + ';padding:4px 2px">' + txt + '</div>';
      const marca = Date.now(); this.ultimoMsg = marca;
      setTimeout(() => { if (this.ultimoMsg === marca && !this.activo && !this.ofreciendo) this.ocultar(); }, ms);
    },
    ofrecer(seg, sugerido) {
      const b = this.asegurarCaja();
      this.ofreciendo = Date.now();
      const btn = 'all:unset;cursor:pointer;padding:5px 10px;border-radius:8px;font-size:12px;font-weight:700';
      b.style.display = 'block'; b.style.borderColor = '#d97706'; b.__modo = 'oferta';
      b.innerHTML =
        '<div style="font-size:12.5px;line-height:1.35;max-width:230px"><b style="color:#9a6a00">El formulario se cerró a los ' + seg + ' s.</b><br>' +
        'Si fue el sistema (no tú), conviene un límite de <b>' + sugerido + ' s</b> (2 s de margen).</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px">' +
          '<button data-a="usar" data-v="' + sugerido + '" style="' + btn + ';background:#123a6d;color:#fff">Usar ' + sugerido + ' s</button>' +
          '<button data-a="cerrar" style="' + btn + ';background:#eef2f7;color:#123a6d">No</button>' +
        '</div>';
      const marca = this.ofreciendo;
      setTimeout(() => { if (this.ofreciendo === marca) { this.ofreciendo = 0; if (!this.activo) this.ocultar(); } }, 15000);
    }
  };

  // TEMPORAL (diagnóstico): recuadro visible en cada frame donde corre el
  // content script, indicando si ve el texto de pausa. Quitar: DEBUG = false.
  const VCA_PAUSA_DEBUG = false;
  function pausaDebugMarker(p) {
    if (!VCA_PAUSA_DEBUG) return;
    try {
      if (!document.body || document.body.tagName === 'FRAMESET') return;
      let d = document.getElementById('vca-pausa-dbg');
      if (!d) {
        d = document.createElement('div');
        d.id = 'vca-pausa-dbg';
        d.style.cssText = 'position:fixed;left:6px;top:6px;z-index:2147483647;background:#111;color:#0f0;font:11px monospace;padding:3px 6px;border-radius:4px;opacity:.92;pointer-events:none;max-width:70vw;white-space:nowrap;overflow:hidden';
        (document.documentElement || document.body).appendChild(d);
      }
      d.textContent = 'VCA' + (IS_TOP ? '[top]' : '[frame]') + ' ' + location.hostname + ' | pausa:' + (p ? p.label : 'no');
    } catch (e) {}
  }
  function pausaTick() {
    try {
      const p = readPauseState(); // null si este frame no está en pausa
      pausaDebugMarker(p);
      if (p) {
        if (!PauseReloj._cur || PauseReloj._cur.id !== p.label) {
          PauseReloj._cur = { id: p.label, label: p.label, emoji: p.emoji, limitMin: p.limitMin, startedAt: Date.now() };
        }
      } else {
        PauseReloj._cur = null;
      }
      // El reloj se dibuja en ESTE frame (el del panel del agente, que es el
      // visible). Los frames sin el texto de pausa devuelven null y no dibujan.
      PauseReloj.render(PauseReloj._cur);
      try { localStorage.setItem('vca_dbg', JSON.stringify({ matched: p ? p.label : null, hora: new Date().toLocaleTimeString() })); } catch (e) {}
    } catch (e) {}
  }

  // Diagnóstico: anota en el registro los marcos de la página y si se pueden
  // leer (los de otro sitio se manejan por mensajes). Se repite cuando cambian.
  let firmaMarcos = '';
  function listarMarcos() {
    try {
      const lista = Array.from(document.querySelectorAll('iframe, frame')).map(f => {
        let acceso = 'otro sitio';
        try { if (f.contentDocument) acceso = 'mismo sitio'; } catch (e) {}
        let src = f.getAttribute('src') || '';
        try { src = new URL(src, location.href); src = src.origin + src.pathname; } catch (e) {}
        return (f.id || f.name || 'marco') + ': ' + String(src).slice(0, 110) + ' (' + acceso + ')';
      }).filter(x => !/webphone/i.test(x));
      const firma = lista.join('|');
      if (firma !== firmaMarcos) { firmaMarcos = firma; lista.forEach(x => log('Marco ' + x)); }
    } catch (e) {}
    setTimeout(listarMarcos, 4000);
  }

  // ===========================================================================
  //  ARRANQUE
  // ===========================================================================
  function boot() {
    if (EXT) { aTop({ t: 'hola', url: urlMarco() }); return; }
    if (RELEVO) log('Motor v' + VCA_VERSION + ' tomó el relevo de la versión anterior (sin recargar la página).');
    // Lo que la versión anterior dejó en cola o grabando (claves viejas) se
    // borra, para que esa copia no siga ejecutando nada.
    if (IS_TOP) { Store.del('vca_armed'); Store.del('vca_learning'); }
    // CRM: sin cola. Borra al cargar cualquier tipificación que quedara pendiente,
    // para que NUNCA se aplique sola sobre el cliente que se abra en esta página.
    if (IS_CRM && IS_TOP) { try { Store.del(K.armed); } catch (e) {} }
    TimerDetector.start();
    DomDetector.start();
    JsSipDetector.start();
    setInterval(autoWatchTick, 700);
    // Reloj de pausas: solo en Vicidial (no en el GO Bci). Corre en cada
    // frame; solo actúa el que contiene el botón de estado del agente.
    // En RELEVO la copia anterior ya dibuja el reloj: no duplicarlo.
    if (!IS_CRM && !RELEVO) setInterval(() => { if (vigente()) pausaTick(); }, 1000);
    if (IS_VICI && IS_TOP) { hookPausaVici(); setInterval(hookPausaVici, 2000); }
    // Cuenta regresiva para tipificar
    if (IS_VICI && IS_TOP) setInterval(() => { try { RelojTipif.tick(); } catch (e) {} }, 250);
    // Expuesto para que el service worker lo dispare con chrome.scripting aunque
    // el temporizador de la pestaña este congelado en segundo plano.
    window.__vcaTick = autoWatchTick;
    // Versión del motor que corre en esta página (la pantalla de control avisa
    // si no coincide con la de la extensión instalada).
    if (IS_TOP) {
      // Clave nueva: la 1.0.2 sigue escribiendo 'vca_engine' si quedó viva en
      // la página, y el panel veía alternar las dos versiones.
      const latido = () => { if (vigente()) Store.set('vca_motor', { v: VCA_VERSION, t: Date.now(), relevo: RELEVO }); };
      latido(); setInterval(latido, 5000);
      setTimeout(listarMarcos, 1500);
    }
    // Sólo en Vicidial: es para que Chrome no congele la pestaña de atrás
    // mientras espera la llamada. En GO no hace falta (y Chrome lo reporta como error).
    if (IS_TOP && IS_VICI && settings().keepAlive && !RELEVO) startKeepAlive(); // uno por pestaña
    // NOTA: la UI ahora vive 100% en el popup de la extension. No se inyecta
    // ningun panel en la pagina (buildPanel/eleccion quedan sin usar).
    log('Cargado en', location.href.slice(0, 80),
        IS_TOP ? '(frame superior)' : '(frame hijo)', 'area=', myArea());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
