// control.js — Ventana de control MULTI-SITIO.
// Habla con TODAS las pestañas que tengan nuestro bridge (Vicidial, GO Bci…),
// une sus listas de atajos y enruta cada acción a la pestaña dueña del atajo.
// Los pasos grabados son específicos de cada web, por eso cada sitio guarda los
// suyos; aquí solo se muestran juntos.
'use strict';

const $ = (s) => document.querySelector(s);

let TABS = [];            // [{id, host, url}]
let diag = { lines: [], verdict: '', lastErr: '' };
let editingId = null;     // atajo en edición de nombre (no reconstruir la lista)
let listSig = '';         // firma para no re-renderizar sin cambios
let engineLog = [];       // registro del motor (diagnóstico)
let learningTab = null;   // pestaña que está capturando los clics

// ---------------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------------
function setStatus(t) { $('#status').textContent = t || ''; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function labelOf(st) { return (st && st.label) ? st.label : '(sin nombre)'; }
function siteName(host) {
  if (/vicidial/i.test(host)) return 'VICIDIAL';
  if (/(^|\.)go\.bciseguros\.cl/i.test(host)) return 'GO Bci';
  if (/multicotizador/i.test(host)) return 'Multicotizador';
  if (/bciseguros/i.test(host)) return 'Bci Seguros';
  return host || '?';
}
// Páginas por las que pasa un atajo, en orden (ej. "GO Bci → Multicotizador").
function rutaDeSitios(st) {
  const out = [];
  (st.steps || []).forEach(p => { const n = p.sitio ? siteName(p.sitio) : ''; if (n && out[out.length - 1] !== n) out.push(n); });
  return out.length > 1 ? out.join(' → ') : siteName(st.__host);
}
// Nombres de sitio SIN repetir: si hay dos pestañas de Vicidial, muestra
// "Vicidial" una sola vez (no "Vicidial + Vicidial").
function siteNamesJoined() {
  return [...new Set(TABS.map(t => siteName(t.host)))].join(' + ');
}

// ---------------------------------------------------------------------------
//  Sonido minimalista al pasar el mouse por un atajo (blip suave y elegante).
//  El audio se crea/reanuda con el primer gesto (política de autoplay del
//  navegador); los blips van a volumen muy bajo, muy cortos, y como máximo uno
//  cada ~90 ms para que mover rápido el mouse no lo sature.
// ---------------------------------------------------------------------------
let _actx = null;
let _lastBlip = 0;
function ensureAudio() {
  try {
    if (!_actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) _actx = new AC(); }
    if (_actx && _actx.state === 'suspended') _actx.resume();
  } catch (e) {}
}
function hoverBlip() {
  if (dragCtx && dragCtx.moved) return;   // en silencio mientras se arrastra
  ensureAudio();
  if (!_actx) return;
  const now = Date.now();
  if (now - _lastBlip < 90) return;
  _lastBlip = now;
  try {
    const t = _actx.currentTime;
    const osc = _actx.createOscillator();
    const g = _actx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046, t);                       // Do agudo
    osc.frequency.exponentialRampToValueAtTime(1568, t + 0.05);  // sube suave (elegante)
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.012);       // volumen bajo
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);       // decae rápido
    osc.connect(g); g.connect(_actx.destination);
    osc.start(t); osc.stop(t + 0.14);
  } catch (e) {}
}
document.addEventListener('pointerdown', ensureAudio);
document.addEventListener('keydown', ensureAudio);

function confirmBox(message) {
  return new Promise((res) => {
    const m = $('#modal');
    $('#modal-msg').textContent = message;
    m.style.display = 'flex';
    const done = (v) => { m.style.display = 'none'; $('#modal-yes').onclick = null; $('#modal-no').onclick = null; res(v); };
    $('#modal-yes').onclick = () => done(true);
    $('#modal-no').onclick = () => done(false);
  });
}

// ---------------------------------------------------------------------------
//  Descubrimiento de pestañas conectadas
// ---------------------------------------------------------------------------
// ¿Sigue viva esta ventana? Al RECARGAR la extensión, las ventanas abiertas de
// la instancia anterior quedan huérfanas: chrome.* lanza "Extension context
// invalidated". Hay que detectarlo y parar, no seguir llamando cada 900ms.
function contextAlive() {
  try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}

function queryTabs(q) {
  return new Promise((r) => {
    try { chrome.tabs.query(q, (t) => r(chrome.runtime.lastError ? [] : (t || []))); }
    catch (e) { r([]); }   // contexto invalidado u otro fallo: no dejar promesa colgada
  });
}
function pingTab(id) {
  return new Promise((res) => {
    try {
      chrome.tabs.sendMessage(id, { type: 'ping' }, { frameId: 0 }, (r) => {
        const e = chrome.runtime.lastError;
        res({ ok: !e && r && r.ok === true, err: e ? e.message : (r ? '' : 'sin respuesta') });
      });
    } catch (ex) { res({ ok: false, err: String(ex) }); }
  });
}
function sendTo(tabId, msg) {
  return new Promise((res) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }, (r) => {
        if (chrome.runtime.lastError) res(null); else res(r);
      });
    } catch (e) { res(null); }
  });
}
async function broadcast(msg) {
  for (const t of TABS) await sendTo(t.id, msg);
}
// Envía a TODAS las pestañas del mismo sitio (mismo siteKey). Así un cambio
// (color, renombrar, borrar, reordenar) queda guardado en todas las pestañas de
// ese sitio y no se “pierde” si la lista se lee de otra pestaña del mismo sitio.
async function sendToSite(host, msg) {
  const sk = siteKey(host);
  const targets = TABS.filter(t => siteKey(t.host) === sk);
  const list = targets.length ? targets : TABS;   // respaldo: si no casa, a todas
  let last = null;
  for (const t of list) last = await sendTo(t.id, msg);
  return last;
}

const SITE_RE = /vicidial\.recaall\.simtastic\.cl|\/\/([a-z0-9-]+\.)*bciseguros\.cl\//i;

async function scanTabs() {
  diag = { lines: [], verdict: '', lastErr: '' };
  const all = await queryTabs({});
  let cands = all.filter(t => SITE_RE.test(t.url || t.pendingUrl || ''));
  diag.lines.push('Pestañas: ' + all.length + ' | candidatas (Vicidial/GO): ' + cands.length);
  if (!cands.length) { cands = all; diag.lines.push('Sin URLs visibles; ping a todas...'); }

  const found = [];
  for (const t of cands) {
    let { ok, err } = await pingTab(t.id);
    let host = ''; try { host = new URL(t.url || '').hostname; } catch (e) {}
    // Pestaña de Vicidial/GO que no responde (abierta antes de instalar o
    // actualizar la extensión): se conecta sola, sin recargarla.
    if (!ok && SITE_RE.test(t.url || '')) {
      try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['bridge.js'] }); } catch (e) {}
      try { await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, world: 'MAIN', files: ['content.js'] }); } catch (e) {}
      ({ ok, err } = await pingTab(t.id));
      if (ok) diag.lines.push('  (conectada sin recargar)');
    }
    if (ok) {
      found.push({ id: t.id, host: host, url: t.url || '' });
      diag.lines.push('  OK    tab ' + t.id + '  ' + siteName(host) + '  ' + host);
    } else if (SITE_RE.test(t.url || '')) {
      diag.lines.push('  FALLA tab ' + t.id + '  ' + host + ' -> ' + err);
      diag.lastErr = err;
    }
  }
  diag.verdict = found.length ? 'ok' : 'notab';
  diag.lines.push('CONECTADAS: ' + found.length +
    (found.length ? ' (' + found.map(f => siteName(f.host)).join(', ') + ')' : ''));
  return found;
}

// El ping a todas las pestañas es lo lento: se hace solo cada RESCAN_MS, no en
// cada ciclo. Así las acciones del usuario no quedan detrás de un escaneo.
let lastScan = 0;
const RESCAN_MS = 6000;

// Reúne el estado de TODAS las pestañas conectadas.
async function collect() {
  if (!TABS.length || (Date.now() - lastScan) > RESCAN_MS) {
    TABS = await scanTabs();
    lastScan = Date.now();
  }
  const out = { states: [], armed: null, learning: null, settings: {}, ka: null, log: [], engines: [], sinGrabar: [], grabando: false };
  let failed = false;
  const seenStates = new Map();   // firma -> índice en out.states (evita duplicados)
  for (const t of TABS) {
    const r = await sendTo(t.id, { type: 'getData' });
    if (!r) { failed = true; continue; }
    // Varias pestañas del MISMO sitio (incluso de servidores Vicidial distintos)
    // reportan la misma lista; al fusionarlas se veían DUPLICADOS. Se muestran UNA
    // sola vez: firma = sitio + nombre + pasos. Si una copia trae color y la ya
    // mostrada no, se adopta el color (para que no se "pierda" entre pestañas).
    (r.states || []).forEach(s => {
      const sig = siteKey(t.host) + '|' + (s.label || s.name || '') + '|' + JSON.stringify(s.steps || []);
      if (seenStates.has(sig)) {
        const idx = seenStates.get(sig);
        if (s.color && !out.states[idx].color) out.states[idx].color = s.color;
        return;
      }
      seenStates.set(sig, out.states.length);
      out.states.push(Object.assign({}, s, { __tab: t.id, __host: t.host }));
    });
    if (r.armed && !out.armed) out.armed = Object.assign({}, r.armed, { __tab: t.id, __host: t.host });
    if (r.fallo && (!out.fallo || r.fallo.t > out.fallo.t)) out.fallo = r.fallo;
    // De todas las pestañas "grabando", nos quedamos con la que tiene más pasos.
    if (r.learning) {
      const n = (r.learning.steps || []).length;
      const cur = out.learning ? (out.learning.steps || []).length : -1;
      if (n > cur) out.learning = Object.assign({}, r.learning, { __tab: t.id, __host: t.host });
    }
    if (!out.ka && r.ka) out.ka = r.ka;
    if (r.learning && r.learning.recording) out.grabando = true;
    out.porSitio = out.porSitio || {};
    out.porSitio[siteName(t.host)] = r.learning ? (r.learning.steps || []).length : null;
    if (r.repuestos) out.repuestos = (out.repuestos || 0) + r.repuestos;
    if (!r.learning) out.sinGrabar.push(t.id);
    out.engines.push({ tab: t.id, host: t.host, engine: r.engine || null });
    Object.assign(out.settings, r.settings || {});
    (r.log || []).forEach(l => out.log.push('[' + siteName(t.host) + '] ' + l));
  }
  if (failed) lastScan = 0;   // alguna pestaña no respondió -> re-escanear ya
  return out;
}

function connectionWarningHtml() {
  return '<div class="warn"><b>Sin pestañas conectadas.</b><br>' +
    'Abre Vicidial y/o GO Bci. Si ya estaban abiertas, cierra y vuelve a abrir este panel; ' +
    'en GO Bci también sirve <b>F5</b>. En Vicidial evita F5 con una llamada en curso: ' +
    'recarga sólo entre llamadas o al iniciar el turno.<br>' +
    'Si persiste, da acceso al sitio: clic derecho en el icono → “Este puede leer y cambiar el sitio”.<br>' +
    '<span class="hintline">Último error: ' + (diag.lastErr || '—') + '</span></div>';
}

// ---------------------------------------------------------------------------
//  Lista de atajos
// ---------------------------------------------------------------------------
function sigOf(states, armed) {
  return JSON.stringify((states || []).map(s => [s.id, s.label, (s.steps || []).length, s.__host, s.color || ''])) +
    '|' + (armed ? armed.id : '');
}

// ---------------------------------------------------------------------------
//  ORDEN FIJO Y PREDECIBLE
//  Los atajos NUNCA se reordenan solos: primero por procedencia (Vocal, CRM,
//  Otros) y dentro de cada grupo alfabéticamente. Así cada atajo conserva su
//  posición entre sesiones y se puede memorizar dónde está.
// ---------------------------------------------------------------------------
// Clave de sitio ESTABLE para exportar/importar/distribuir. El host completo
// cambia según el servidor asignado (cdn.s-br01a..., s-br02a...), así que
// agrupamos por dominio conocido; si no, la config de uno no serviría a otro.
function siteKey(host) {
  if (/vicidial\.recaall\.simtastic\.cl/i.test(host || '')) return 'vicidial';
  if (/go\.bciseguros\.cl/i.test(host || '')) return 'go.bciseguros.cl';
  return host || '';
}

function groupRank(host) {
  const s = siteName(host || '');
  if (/vicidial/i.test(s)) return 0;   // Vocal
  if (/go bci|multicotizador|bci seguros/i.test(s)) return 1;        // CRM
  return 2;                            // Otros
}
// Dentro del CRM, agrupa por color: verdes (positivas) juntas, luego rojas,
// luego sin color. Así las positivas quedan SIEMPRE agrupadas.
function colorRank(s) {
  const c = (s && s.color) || '';
  if (c === 'green') return 0;
  if (c === 'red') return 1;
  return 2;   // sin color
}
function sortStates(arr) {
  // Ordena por grupo/sitio (Vicidial, luego CRM); dentro del CRM, por color.
  // DENTRO de cada bloque conserva el orden guardado (sort estable → devuelve 0),
  // para poder reordenar a mano arrastrando. Nunca se mezclan los grupos.
  return (arr || []).slice().sort((a, b) => {
    const ga = groupRank(a.__host), gb = groupRank(b.__host);
    if (ga !== gb) return ga - gb;                              // 1º grupo
    const sa = siteName(a.__host || ''), sb = siteName(b.__host || '');
    if (sa !== sb) return sa.localeCompare(sb, 'es');            // 2º sitio
    if (/go bci/i.test(sa)) {                                       // 3º color (solo CRM)
      const ca = colorRank(a), cb = colorRank(b);
      if (ca !== cb) return ca - cb;
    }
    return 0;                                                    // mismo bloque: orden guardado
  });
}

// Modelo local para poder pintar cambios AL INSTANTE (sin esperar al servidor).
let lastStates = [];
let lastArmed = null;
// Operaciones del usuario aún en vuelo. Mientras haya alguna, el ciclo periódico
// NO sobrescribe el modelo local (si no, el cambio optimista "revive" porque el
// servidor todavía no lo aplicó). Al terminar, se reconcilia con la verdad.
let pendingOps = 0;
function optimistic(sendPromise) {
  pendingOps++;
  Promise.resolve(sendPromise).then(() => {
    pendingOps = Math.max(0, pendingOps - 1);
    refresh();            // reconciliar con el estado real
  });
}
let lastFallo = null;
function paintArmInfo(armed) {
  const f = lastFallo;
  const el = $('#arminfo');
  el.classList.remove('fallo');
  if (armed) {
    el.textContent = /bciseguros/i.test(armed.__host || '')
      ? '⏳ Ejecutando “' + labelOf(armed) + '” en GO…'
      : '⏳ “' + labelOf(armed) + '” en cola: se ejecuta en cuanto se pueda.';
  } else if (f && Date.now() - f.t < 3 * 60 * 1000) {
    const p = f.paso;
    el.classList.add('fallo');
    el.textContent = '⚠️ “' + (f.label || 'atajo') + '” no se completó' +
      (p ? ': en el paso ' + p.n + ' de ' + p.de + ' no apareció ' + p.que + '.' : '.') +
      ' Revisa que GO esté en la pantalla donde empezaste a grabar.';
  } else {
    el.textContent = '';
  }
}
function renderNow() {
  lastStates = sortStates(lastStates);
  renderList(lastStates, lastArmed);
  listSig = sigOf(lastStates, lastArmed);
  paintArmInfo(lastArmed);
}

function renderList(states, armed) {
  const list = $('#list');
  list.innerHTML = '';
  if (!states || !states.length) {
    list.innerHTML = '<div class="hintline">Aún no hay atajos. Abre <b>⚙️ Configuración → ⏺ Grabar nuevo atajo</b>.</div>';
    return;
  }
  states.forEach((st) => {
    const on = armed && armed.id === st.id;
    const isVocal = /vicidial/i.test(st.__host || '');
    const isCRM = /bciseguros/i.test(st.__host || '');
    const row = document.createElement('div');
    // Fondo: Vicidial siempre celeste; CRM según su color (verde/rojo) o neutro.
    let bgClass = '';
    if (isVocal) bgClass = ' site-vocal';
    else if (isCRM) bgClass = ' color-' + (st.color || 'none');
    row.className = 'sc' + bgClass + (on ? ' on' : '');
    row.dataset.id = st.id;
    row.dataset.site = siteKey(st.__host);            // grupo (sitio)
    row.dataset.color = st.color || '';               // sub-grupo por color (CRM)
    row.addEventListener('mouseenter', hoverBlip);    // sonido minimalista al pasar
    row.addEventListener('pointerdown', (e) => onRowPointerDown(e, st, row));

    const nPasos = st.steps ? st.steps.length : 0;
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    // Una sola línea: nombre + sitio. Los pasos van en el tooltip para ahorrar alto.
    lbl.innerHTML = (on ? '⏳ ' : '') + escapeHtml(labelOf(st)) +
      ' <span class="mini">· ' + escapeHtml(rutaDeSitios(st)) + '</span>';
    row.title = labelOf(st) + ' · ' + rutaDeSitios(st) + ' · ' + nPasos + ' pasos';

    const edit = document.createElement('button');
    edit.textContent = '✏️';
    edit.title = isCRM ? 'Renombrar y elegir color' : 'Renombrar';
    edit.addEventListener('click', () => startRename(lbl, st, isCRM, row));

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕'; del.title = 'Eliminar';
    del.addEventListener('click', async () => {
      if (!(await confirmBox('¿Eliminar el atajo “' + labelOf(st) + '”?'))) return;
      // INSTANTÁNEO: quitar de la lista y repintar YA; el envío va después.
      lastStates = lastStates.filter(x => x.id !== st.id);
      if (lastArmed && lastArmed.id === st.id) lastArmed = null;
      renderNow();
      optimistic(sendToSite(st.__host, { type: 'deleteState', id: st.id }));
    });

    const play = document.createElement('button');
    play.className = 'play';
    // Sin cola: ▶ (ejecutar). En cola (Vicidial): el mismo botón se vuelve ■
    // (detener) y al pulsarlo cancela lo que estaba encolado. Sin botón aparte.
    play.textContent = on ? '■' : '▶';
    play.title = on ? 'En cola — clic para detener' : 'Ejecutar';
    play.addEventListener('click', () => activateShortcut(st));

    row.append(lbl, edit, del, play);
    list.appendChild(row);
  });
}

// Ejecuta / cancela un atajo (lo mismo que el botón ▶/■). Se usa también al hacer
// clic en CUALQUIER zona del botón (no solo en el ▶). Calcula solo si está en cola.
// Pestaña donde ejecutar un atajo: la que se está mirando de ese sitio (con
// dos pestañas de GO abiertas, la orden iba a la primera y no a la visible).
async function tabParaSitio(host, porDefecto) {
  const sk = siteKey(host);
  const mias = new Set(TABS.filter(t => siteKey(t.host) === sk).map(t => t.id));
  if (!mias.size) return porDefecto;
  const todas = (await queryTabs({})).filter(t => mias.has(t.id));
  if (!todas.length) return porDefecto;
  todas.sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  return todas[0].id;
}

function activateShortcut(st) {
  const on = lastArmed && lastArmed.id === st.id;
  // INSTANTÁNEO: marcar/desmarcar en cola y repintar YA; el envío va después.
  lastArmed = on ? null : { id: st.id, label: st.label, __tab: st.__tab, __host: st.__host };
  lastFallo = null;
  renderNow();
  if (on) { optimistic(sendToSite(st.__host, { type: 'disarm' })); return; }
  optimistic(tabParaSitio(st.__host, st.__tab).then(id => sendTo(id, { type: 'arm', id: st.id })));
}

// ---------------------------------------------------------------------------
//  ARRASTRAR PARA REORDENAR (drag & drop) dentro del MISMO grupo/sitio.
//  Se arrastra el botón completo; los demás se apartan con animación y el atajo
//  se suelta en la posición deseada. NUNCA cruza de grupo (Vicidial ↔ CRM):
//  el destino se limita a las filas del mismo sitio.
// ---------------------------------------------------------------------------
let dragCtx = null;

function onRowPointerDown(e, st, row) {
  if (e.button != null && e.button !== 0) return;       // solo botón izquierdo
  if (e.target.closest('button, input')) return;         // no arrastrar desde los controles
  if (editingId != null) return;                         // no arrastrar mientras se edita
  const list = $('#list');
  const rows = Array.from(list.querySelectorAll('.sc'));
  // Grupo de arrastre = mismo sitio Y mismo color. Así una verde solo se mueve
  // entre verdes (las positivas quedan siempre agrupadas); Vicidial (sin color)
  // se mueve entre todas las de Vicidial.
  const group = rows.filter(r => r.dataset.site === row.dataset.site &&
                                 r.dataset.color === row.dataset.color);
  const startIndex = group.indexOf(row);
  if (startIndex < 0) return;
  let step = row.offsetHeight + 6;
  if (group.length > 1) {
    const a = group[0].getBoundingClientRect(), b = group[1].getBoundingClientRect();
    step = Math.abs(b.top - a.top) || step;
  }
  dragCtx = { st, row, group, startIndex, targetIndex: startIndex, step, startY: e.clientY, moved: false };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
  window.addEventListener('pointercancel', onDragEnd, { once: true });
}

function onDragMove(e) {
  if (!dragCtx) return;
  const dy = e.clientY - dragCtx.startY;
  if (!dragCtx.moved) {
    if (Math.abs(dy) < 4) return;                         // umbral: distinguir clic de arrastre
    dragCtx.moved = true;
    dragCtx.row.classList.add('dragging');
    document.body.classList.add('dragging-active');
  }
  e.preventDefault();
  dragCtx.row.style.transform = 'translateY(' + dy + 'px) scale(1.03)';
  // Destino: según cuánto se movió, limitado SIEMPRE a los bordes del grupo.
  let ti = dragCtx.startIndex + Math.round(dy / dragCtx.step);
  ti = Math.max(0, Math.min(dragCtx.group.length - 1, ti));
  dragCtx.targetIndex = ti;
  // Apartar las demás filas del grupo para dejar el hueco (animado por CSS).
  dragCtx.group.forEach((r, i) => {
    if (r === dragCtx.row) return;
    let shift = 0;
    if (i > dragCtx.startIndex && i <= ti) shift = -dragCtx.step;
    else if (i < dragCtx.startIndex && i >= ti) shift = dragCtx.step;
    r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
  });
}

function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove);
  const ctx = dragCtx; dragCtx = null;
  if (!ctx) return;
  document.body.classList.remove('dragging-active');
  if (!ctx.moved) {
    // No hubo arrastre: fue un CLIC en el cuerpo de la fila -> ejecutar el atajo
    // (clic en cualquier zona, no solo en el ▶). Los botones ✏️/✕ ya se
    // excluyeron en onRowPointerDown, así que aquí siempre es el cuerpo.
    ctx.row.classList.remove('dragging'); ctx.row.style.transform = '';
    activateShortcut(ctx.st);
    return;
  }
  const from = ctx.startIndex, to = ctx.targetIndex;
  // Nuevo orden de los ids del grupo tras mover el arrastrado a su destino.
  const groupIds = ctx.group.map(r => r.dataset.id);
  groupIds.splice(to, 0, groupIds.splice(from, 1)[0]);
  // Animación de asentado: la fila baja/sube a su hueco antes de repintar.
  ctx.row.style.transition = 'transform .16s ease';
  ctx.row.style.transform = 'translateY(' + ((to - from) * ctx.step) + 'px) scale(1)';
  setTimeout(() => {
    reorderGroupInLastStates(groupIds);
    renderNow();
    optimistic(sendToSite(ctx.st.__host, { type: 'reorderStates', order: groupIds }));
  }, 160);
}

// Reordena SOLO los atajos cuyos ids están en orderedIds, en ese orden, ocupando
// las MISMAS posiciones que ya ocupaban en la lista (deja el resto intacto). Así
// no descoloca a los de otro color ni a los de otro grupo.
function reorderGroupInLastStates(orderedIds) {
  const set = new Set(orderedIds);
  const byId = {}; lastStates.forEach(s => { if (set.has(s.id)) byId[s.id] = s; });
  const slots = [];
  lastStates.forEach((s, i) => { if (set.has(s.id)) slots.push(i); });
  slots.forEach((slot, k) => { if (byId[orderedIds[k]]) lastStates[slot] = byId[orderedIds[k]]; });
}

function startRename(lbl, st, isCRM, row) {
  editingId = st.id;
  // Ocultar los botones de acción mientras se edita (dejan sitio al editor).
  const hidden = row ? Array.from(row.querySelectorAll('button')) : [];
  hidden.forEach(b => b.style.display = 'none');

  const input = document.createElement('input');
  input.value = st.label || '';
  lbl.innerHTML = ''; lbl.appendChild(input);

  // Color SOLO en el CRM: pequeños botones que cambian el FONDO de la fila al
  // instante. Aparecen únicamente al editar, así la lista queda limpia a diario.
  let picker = null;
  if (isCRM && row) {
    const setBg = (col) => {
      row.classList.remove('color-none', 'color-green', 'color-red');
      row.classList.add('color-' + (col || 'none'));
    };
    const mk = (col, label, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cchip cc-' + (col || 'none') + (((st.color || '') === col) ? ' on' : '');
      b.textContent = label; b.title = title;
      b.addEventListener('mousedown', (e) => e.preventDefault());  // no quitar foco al input
      b.addEventListener('click', () => {
        st.color = col;
        const it = lastStates.find(x => x.id === st.id); if (it) it.color = col;
        setBg(col);
        picker.querySelectorAll('.cchip').forEach(c => c.classList.remove('on'));
        b.classList.add('on');
        optimistic(sendToSite(st.__host, { type: 'setColor', id: st.id, color: col }));
      });
      return b;
    };
    picker = document.createElement('span');
    picker.className = 'colorpick';
    picker.append(
      mk('green', 'Verde', 'Contacto / interesado'),
      mk('red', 'Rojo', 'No contacto / no interesado'),
      mk('', 'Sin color', 'Quitar color')
    );
    row.append(picker);
  }

  input.focus(); input.select();
  let doneOnce = false;
  const finish = (save) => {
    if (doneOnce) return; doneOnce = true;
    const v = input.value.trim();
    editingId = null;
    if (picker) picker.remove();
    if (save && v && v !== st.label) {
      // INSTANTÁNEO: renombrar en el modelo local y repintar YA (re-ordena solo
      // si el nuevo nombre cambia su lugar alfabético); el envío va después.
      const it = lastStates.find(x => x.id === st.id);
      if (it) it.label = v;
      if (lastArmed && lastArmed.id === st.id) lastArmed.label = v;
      renderNow();
      optimistic(sendToSite(st.__host, { type: 'rename', id: st.id, label: v }));
    } else {
      listSig = ''; refresh();
    }
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// ---------------------------------------------------------------------------
//  Grabación (se activa en TODAS las pestañas; guarda donde hubo clics)
// ---------------------------------------------------------------------------
function showRecBox(mode) {
  const box = $('#recbox');
  box.className = mode || '';
  $('#rec-recording').style.display = mode === 'recording' ? 'block' : 'none';
  $('#rec-naming').style.display = mode === 'naming' ? 'block' : 'none';
  $('#rec').style.display = mode ? 'none' : 'block';
}

// Nombra el/los sitio(s) conocidos que NO están conectados, para que se vea
// antes de grabar (los clics en una pestaña sin conectar no se capturan).
function missingSiteHtml() {
  // Basta con que haya una página conectada: grabar en GO no necesita Vicidial ni al revés
  if (TABS.length) return '';
  const falta = [];
  if (!TABS.some(t => /vicidial/i.test(t.host || ''))) falta.push('Vicidial');
  if (!TABS.some(t => /bciseguros/i.test(t.host || ''))) falta.push('GO Bci');
  if (!falta.length) return '';
  return '<br>⚠️ <b>' + falta.join(' y ') + '</b> sin conectar: los clics ahí NO se graban. ' +
         'Abre esa pestaña (en Vicidial, recárgala sólo entre llamadas).';
}

// Estado del segundo plano en DOS piezas para ahorrar alto: una insignia corta
// que va en la misma línea que los sitios, y un aviso largo SOLO si hay que actuar.
function bgBadge(r) {
  const s = r.settings || {};
  if (s.keepAlive === false) return '⚪ 2° plano off';
  const ka = r.ka;
  if (!ka) return '⚪ 2° plano…';
  const fresh = (Date.now() - (ka.ts || 0)) < 8000;
  if (ka.state === 'running') return fresh ? '🟢 2° plano' : '🟠 2° plano sin latido';
  return '🟠 2° plano suspendido';
}
function bgWarning(r) {
  const s = r.settings || {};
  if (s.keepAlive === false) return '';
  const ka = r.ka;
  if (ka && ka.state !== 'running') {
    return '🟠 Haz <b>un clic en la página</b> de Vicidial/GO para activar el 2° plano.';
  }
  return '';   // todo bien -> vacío -> #bg:empty lo colapsa (no ocupa alto)
}

let lastCount = -1;
let refreshing = false;
async function refresh() {
  // Evita que se solapen ciclos: si ya hay uno en vuelo, este se descarta (la UI
  // ya se pintó de forma optimista y el siguiente ciclo reconcilia igualmente).
  if (refreshing) return;
  refreshing = true;
  try { await refreshInner(); } finally { refreshing = false; }
}

async function refreshInner() {
  const r = await collect();
  engineLog = r.log || engineLog;
  // Grabación en curso y una pestaña que se conectó después (o no recibió la
  // orden): se suma a la grabación, para que sus clics también queden.
  if (r.grabando && r.sinGrabar.length) r.sinGrabar.forEach(id => sendTo(id, { type: 'learnStart', ts: r.learning && r.learning.ts }));
  pintarAvisoMotor(r.engines);

  if (!TABS.length) {
    if (editingId == null) { $('#list').innerHTML = connectionWarningHtml(); listSig = ''; }
    setStatus('Sin conexión.');
    return;
  }

  const learn = r.learning;
  learningTab = learn ? learn.__tab : null;

  if (learn && learn.recording) {
    showRecBox('recording');
    $('#reccount').textContent = (learn.steps || []).length;
    // Mostrar SIEMPRE dónde se está capturando: si falta un sitio, los clics
    // que hagas allí no se grabarán y hay que saberlo ANTES de perder el tiempo.
    // Cuántos clics lleva cada página: si GO no suma, se ve en el momento
    const ps = r.porSitio || {};
    const detalle = Object.keys(ps).map(k => escapeHtml(k) + ' ' + (ps[k] == null ? '(no graba)' : '(' + ps[k] + ')')).join(' + ');
    $('#reccap').innerHTML = 'Capturando en: <b>' + (detalle || escapeHtml(siteNamesJoined() || '—')) + '</b>' + missingSiteHtml() +
      (r.repuestos ? '<br>♻ La página borró la grabación ' + r.repuestos + ' vez/veces y se repuso.' : '');
    setStatus('Grabando…');
  } else if (learn && !learn.recording) {
    showRecBox('naming');
    const n = (learn.steps || []).length;
    $('#namecount').textContent = n;
    $('#namesite').textContent = siteName(learn.__host);
    // Si no se capturó nada, decirlo claramente en vez de dejar guardar en vano.
    const vacio = n === 0;
    $('#nameok').style.display = vacio ? 'none' : '';
    $('#namewarn').style.display = vacio ? 'block' : 'none';
    $('#name').style.display = vacio ? 'none' : '';
    $('#save').style.display = vacio ? 'none' : '';
    if (vacio) {
      $('#namewarn').innerHTML = '<b>No se capturó ningún clic.</b><br>' +
        'La pestaña donde hiciste los clics no estaba conectada. Recárgala (en Vicidial, ' +
        'sólo entre llamadas), comprueba arriba que aparezca, y vuelve a grabar.' + missingSiteHtml();
    } else if (lastCount !== n) {
      // Recién detenida: NO auto-rellenar (antes se ponía "Atajo N"). El nombre
      // es OBLIGATORIO: dejamos el campo vacío y con el foco para invitar a
      // escribirlo. Guardar sin nombre queda bloqueado (ver botón Guardar).
      $('#name').value = '';
      try { $('#name').focus(); } catch (e) {}
    }
    setStatus(vacio ? 'Grabación vacía.' : 'Grabación detenida. Escríbele un nombre y guarda.');
  } else {
    showRecBox('');
    setStatus('');
  }
  lastCount = learn ? (learn.steps || []).length : -1;

  // Sincroniza con la verdad del servidor SOLO si no hay cambios del usuario en
  // vuelo (si no, pisaríamos lo que acabamos de pintar de forma optimista). Y
  // NUNCA mientras se arrastra (repintar cortaría el arrastre a medias).
  if (pendingOps === 0 && !(dragCtx && dragCtx.moved)) {
    lastStates = sortStates(r.states);
    lastArmed = r.armed;
    lastFallo = r.fallo || null;
    if (editingId == null) {
      const sig = sigOf(lastStates, lastArmed);
      if (sig !== listSig) { renderList(lastStates, lastArmed); listSig = sig; }
    }
  }
  paintArmInfo(lastArmed);
}

// ---- Grabación compartida entre páginas ----------------------------------
function grab(v) { return new Promise(r => { try { chrome.storage.local.set({ vcaGrab: v }, () => r()); } catch (e) { r(); } }); }
function leerTodo() { return new Promise(r => { try { chrome.storage.local.get(null, x => r(x || {})); } catch (e) { r({}); } }); }
async function grabOff(borrar) {
  const g = (await leerTodo()).vcaGrab;
  if (borrar) { try { await chrome.storage.local.remove('vcaGrab'); } catch (e) {} return; }
  if (g) await grab({ ts: g.ts, on: false });
}
// Pasos de la grabación actual en todas las páginas, ordenados por la hora del clic.
async function pasosGrabados() {
  const r = await collect();
  const todo = await leerTodo();
  const ts = (todo.vcaGrab && todo.vcaGrab.ts) || (r.learning && r.learning.ts) || 0;
  const listas = [];
  for (const t of TABS) {
    const l = await sendTo(t.id, { type: 'getData' });
    if (l && l.learning && (!ts || l.learning.ts === ts)) listas.push(l.learning.steps || []);
  }
  Object.keys(todo).forEach(k => {
    const l = /^vcaSitio:/.test(k) && todo[k] && todo[k].learning;
    if (l && (!ts || l.ts === ts)) listas.push(l.steps || []);
  });
  const vistos = new Set(), pasos = [];
  listas.forEach(lst => lst.forEach(p => {
    const firma = (p.t || '') + '|' + (p.sitio || '') + '|' + (p.path || '') + '|' + (p.value || '') + '|' + (p.optText || '');
    if (!vistos.has(firma)) { vistos.add(firma); pasos.push(p); }
  }));
  pasos.sort((a, b) => (a.t || 0) - (b.t || 0));
  // Un atajo de GO / multicotizador no lleva clics de Vicidial (se cuelan al
  // copiar el RUT o mirar la llamada mientras se graba).
  const bci = pasos.some(p => /bciseguros/.test(p.sitio || ''));
  return { pasos: bci ? pasos.filter(p => p.sitio !== 'vicidial') : pasos, ts: ts };
}

// ---- Botones de grabación --------------------------------------------------
$('#rec').addEventListener('click', async () => {
  $('#name').value = '';
  // Recién abierto, el panel puede no haber reconocido aún todas las pestañas
  // (tarda unos segundos): se buscan AHORA, para que la orden llegue también
  // a GO y no sólo a Vicidial.
  setStatus('Conectando pestañas…');
  TABS = await scanTabs(); lastScan = Date.now();
  // Una sola grabación para todas las páginas, también las que se abran después
  // (otra pestaña, el multicotizador, la página que sigue a "Ingresar").
  const ts = Date.now();
  await grab({ ts: ts, on: true });
  await broadcast({ type: 'learnStart', ts: ts });   // graba en TODAS las pestañas
  listSig = ''; refresh();
});
$('#stop').addEventListener('click', async () => { await grabOff(); await broadcast({ type: 'learnStop' }); refresh(); });
$('#cancel1').addEventListener('click', async () => { await grabOff(); await broadcast({ type: 'learnCancel' }); listSig = ''; refresh(); });
$('#cancel2').addEventListener('click', async () => { await grabOff(); await broadcast({ type: 'learnCancel' }); listSig = ''; refresh(); });
$('#save').addEventListener('click', async () => {
  if (learningTab == null) { setStatus('No hay nada grabado.'); return; }
  const label = $('#name').value.trim();
  // Nombre OBLIGATORIO: sin nombre no se guarda. Se enfoca el campo y parpadea
  // en rojo un instante para dejar claro que hay que escribirlo.
  if (!label) {
    const el = $('#name');
    try { el.focus(); } catch (e) {}
    el.style.borderColor = '#c0392b'; el.style.background = '#fdecea';
    setTimeout(() => { el.style.borderColor = ''; el.style.background = ''; }, 1200);
    setStatus('Escríbele un nombre para guardar.');
    return;
  }
  // Junta los pasos de todas las páginas (también de las que ya se cerraron)
  // y lo guarda en la página donde empieza el atajo.
  const { pasos, ts } = await pasosGrabados();
  let destino = learningTab;
  const inicio = pasos[0] && pasos[0].sitio;
  const t0 = inicio && TABS.find(t => siteKey(t.host) === inicio);
  if (t0) destino = t0.id;
  const r = await sendTo(destino, { type: 'learnSave', label: label, steps: pasos, ts: ts });
  await grabOff(true);
  await broadcast({ type: 'learnCancel' });  // limpia grabaciones vacías en las demás
  setStatus(r && r.ok ? 'Atajo guardado.' : 'No se guardó (0 clics grabados).');
  $('#name').value = '';
  listSig = ''; refresh();
});

// ---- Global ----------------------------------------------------------------
$('#export').addEventListener('click', async () => {
  const r = await collect();
  if (!TABS.length) { setStatus('Sin pestañas conectadas.'); return; }
  const states = (r.states || []).map(s => ({ id: s.id, label: s.label, steps: s.steps, color: s.color || '', site: siteKey(s.__host) }));
  const cfg = { version: 3, exportedAt: new Date().toISOString(), states: states, settings: r.settings || {} };
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'auto-atajos-config.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  setStatus('Configuración exportada (' + states.length + ' atajos).');
});

$('#import').addEventListener('click', () => $('#file').click());
$('#copylog').addEventListener('click', async () => {
  const texto = 'ShortCut-Vicidial-GO v' + chrome.runtime.getManifest().version + '\n' + (engineLog || []).join('\n');
  try { await navigator.clipboard.writeText(texto); setStatus('Registro copiado (' + (engineLog || []).length + ' líneas). Pégalo en WhatsApp.'); }
  catch (e) { setStatus('No se pudo copiar el registro.'); }
});
$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  let cfg; try { cfg = JSON.parse(await f.text()); } catch (err) { setStatus('Archivo JSON inválido.'); return; }
  e.target.value = '';
  if (!Array.isArray(cfg.states)) { setStatus('El archivo no tiene “states”.'); return; }
  if (!(await confirmBox('Importar reemplazará los atajos de los sitios incluidos. ¿Continuar?'))) return;
  // Reparte cada atajo a la pestaña de su sitio.
  let n = 0;
  for (const t of TABS) {
    const mine = cfg.states.filter(s => !s.site || siteKey(s.site) === siteKey(t.host));
    if (!mine.length) continue;
    const r = await sendTo(t.id, { type: 'importConfig', states: mine, settings: cfg.settings || {} });
    if (r && r.ok) n += mine.length;
  }
  setStatus(n ? ('Importados ' + n + ' atajos.') : 'Ningún atajo coincidía con los sitios abiertos.');
  listSig = ''; refresh();
});

// ---- Modo popup anclado al icono -------------------------------------------
// El icono abre el popup anclado (no crea ventana, NO sale en la barra de tareas).
const IS_WINDOW = location.search.indexOf('win=1') >= 0;
const IS_EMBED = location.search.indexOf('embed=1') >= 0;   // (panel flotante, desactivado)
if (IS_WINDOW) document.body.classList.add('aswindow');

// Incrustado (panel flotante): avisar al contenedor nuestro ALTO real para que
// ajuste el iframe al contenido (sin scroll). Se actualiza si la lista cambia.
if (IS_EMBED) {
  const postH = () => {
    try { parent.postMessage({ __vcaHeight: Math.ceil(document.documentElement.scrollHeight) }, '*'); } catch (e) {}
  };
  try { new ResizeObserver(postH).observe(document.documentElement); } catch (e) {}
  window.addEventListener('load', postH);
  setTimeout(postH, 120);
  setTimeout(postH, 600);
}

// Versión: en el título siempre, para saber de un vistazo cuál está instalada.
const VERSION = chrome.runtime.getManifest().version;
$('#ver').textContent = 'v' + VERSION;
document.title = 'ShortCut-Vicidial-GO v' + VERSION;

// Si una pestaña sigue con el motor de una versión anterior (se actualizó la
// extensión sin recargar la página), lo nuevo NO funciona ahí: avisarlo.
const inyectado = {};   // tabId -> última vez que se le conectó el motor
async function conectarMotor(tabId) {
  if (Date.now() - (inyectado[tabId] || 0) < 15000) return;
  inyectado[tabId] = Date.now();
  try { await chrome.scripting.executeScript({ target: { tabId: tabId, allFrames: true }, world: 'MAIN', files: ['content.js'] }); }
  catch (e) { diag.lastErr = 'motor: ' + (e && e.message || e); }
}
async function motorEnPagina(tabId) {
  try {
    const r = await chrome.scripting.executeScript({ target: { tabId: tabId }, world: 'MAIN',
      func: () => String(window.__VCA_LOADED__ === undefined ? 'ninguno' : window.__VCA_LOADED__) });
    return r && r[0] ? r[0].result : '?';
  } catch (e) { return 'sin acceso'; }
}
// Lo que de verdad corre en la página se pregunta directo (no se fía sólo del
// latido) y se recuerda 30 s por pestaña, para no consultar en cada ciclo.
const motorVisto = {};   // tabId -> {v, t}
async function motorActual(tabId) {
  const c = motorVisto[tabId];
  if (c && Date.now() - c.t < 30000) return c.v;
  const v = await motorEnPagina(tabId);
  motorVisto[tabId] = { v: v, t: Date.now() };
  return v;
}
let avisoEnCurso = false;
async function pintarAvisoMotor(engines) {
  if (avisoEnCurso) return;            // un chequeo a la vez: sin parpadeo
  avisoEnCurso = true;
  try {
    const viejas = [];
    for (const x of (engines || [])) {
      const e = x.engine;
      const fresco = e && e.v === VERSION && (Date.now() - (e.t || 0)) < 90000;
      if (fresco) continue;
      const m = await motorActual(x.tab);
      if (m === VERSION) continue;     // la página ya corre esta versión: todo bien
      viejas.push({ x: x, m: m });
    }
    const el = $('#motor');
    if (!viejas.length) { el.hidden = true; el.innerHTML = ''; return; }
    // Se conecta el motor nuevo SIN recargar la página; sólo si no basta se pide F5.
    viejas.forEach(o => { conectarMotor(o.x.tab); delete motorVisto[o.x.tab]; });
    const sitios = Array.from(new Set(viejas.map(o => siteName(o.x.host)))).join(' y ');
    el.innerHTML = '⏳ Conectando v' + VERSION + ' en <b>' + escapeHtml(sitios) + '</b>… si no se va, F5 sin llamada.' +
      ' <span class="hintline">(motor: ' + escapeHtml(viejas.map(o => o.m === 'true' ? '1.0.0/1.0.1' : o.m).join(', ')) + ')</span>';
    el.hidden = false;
  } finally { avisoEnCurso = false; }
}

// RUT del cliente que está en Vicidial (lo usan los pasos "RUT del cliente" de GO)
function pintarCliRut(c) {
  const el = $('#cliRut');
  if (!el) return;
  el.textContent = c && c.rut ? '🪪 Cliente en Vicidial: ' + c.rut + (c.nombre ? ' · ' + c.nombre : '') : '';
}
try {
  chrome.storage.local.get('vcaCliente', r => pintarCliRut(r && r.vcaCliente));
  chrome.storage.onChanged.addListener(ch => { if (ch.vcaCliente) pintarCliRut(ch.vcaCliente.newValue); });
} catch (e) {}

// ---- Init ------------------------------------------------------------------
function showStaleNotice() {
  const el = $('#list');
  if (el) el.innerHTML =
    '<div class="warn"><b>La extensión se actualizó.</b><br>' +
    'Esta ventana quedó desconectada de la extensión y ya no responde. ' +
    'Ciérrala y vuelve a abrirla con el icono.</div>';
  setStatus('Ventana obsoleta — ciérrala y reábrela.');
}

(async function init() {
  if (!contextAlive()) { showStaleNotice(); return; }
  refresh();
  const timer = setInterval(() => {
    if (!contextAlive()) { clearInterval(timer); showStaleNotice(); return; }
    refresh();
  }, 900);
})();
