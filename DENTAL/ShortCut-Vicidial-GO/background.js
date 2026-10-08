// background.js — Service worker. Al pulsar el icono abre (o enfoca) la VENTANA
// de control (ventana propia del navegador, no un popup anclado; no se cierra al
// hacer clic en la pagina). Se ancla arriba a la derecha (cerca de la barra de
// extensiones) y recuerda la ultima posicion donde la dejaste.
'use strict';

const W = 300, H = 460;
let controlWinId = null;

async function getSavedPos() {
  try { const o = await chrome.storage.local.get('ctrlPos'); return o.ctrlPos || null; }
  catch (e) { return null; }
}
async function savePos(w) {
  if (w.left == null) return;
  try { await chrome.storage.local.set({ ctrlPos: { left: w.left, top: w.top, width: w.width, height: w.height } }); }
  catch (e) {}
}

// Busca una ventana de control YA abierta (robusto aunque el service worker se
// haya reiniciado y perdido controlWinId). Evita que se acumulen ventanas.
async function findControlWindow() {
  const base = chrome.runtime.getURL('control.html');
  try {
    const wins = await chrome.windows.getAll({ populate: true });
    for (const w of wins) {
      if ((w.tabs || []).some(t => t.url && t.url.split('?')[0] === base)) return w.id;
    }
  } catch (e) {}
  return null;
}

async function openControl() {
  // Ya abierta (en cualquier ventana) -> enfocar esa, no crear otra
  const existing = await findControlWindow();
  if (existing != null) {
    try { await chrome.windows.update(existing, { focused: true }); controlWinId = existing; return; }
    catch (e) {}
  }
  controlWinId = null;

  const saved = await getSavedPos();
  let left, top, width = W, height = H;
  if (saved) {
    left = saved.left; top = saved.top; width = saved.width || W; height = saved.height || H;
  } else {
    // esquina superior derecha de la ventana del navegador actual
    try {
      const cur = await chrome.windows.getLastFocused();
      left = Math.max(0, (cur.left || 0) + (cur.width || 1280) - W - 16);
      top = Math.max(0, (cur.top || 0) + 72);
    } catch (e) { left = 200; top = 100; }
  }

  const url = chrome.runtime.getURL('control.html?win=1');  // ?win=1 => modo ventana
  try {
    const win = await chrome.windows.create({ url, type: 'popup', width, height, left, top, focused: true });
    controlWinId = win.id;
  } catch (e) {
    const win = await chrome.windows.create({ url, type: 'popup', width: W, height: H });
    controlWinId = win.id;
  }
}

// El icono abre el POPUP ANCLADO (default_popup en el manifest): NO se crea
// ninguna ventana aparte, así nada aparece en la barra de tareas. No enganchamos
// onClicked (con default_popup ni siquiera se dispara) ni abrimos ventanas.
chrome.windows.onRemoved.addListener((id) => { if (id === controlWinId) controlWinId = null; });
if (chrome.windows.onBoundsChanged) {
  chrome.windows.onBoundsChanged.addListener((w) => { if (w.id === controlWinId) savePos(w); });
}

// ---------------------------------------------------------------------------
//  PULSO DE SEGUNDO PLANO
//  El navegador congela los temporizadores de las pestañas en segundo plano.
//  Aquí, desde el service worker (que no está atado a la pestaña), disparamos
//  periódicamente window.__vcaTick() en la pestaña de Vicidial con
//  chrome.scripting.executeScript, que se ejecuta aunque la pestaña esté al
//  fondo. Es una red de seguridad ADEMÁS del keep-alive de audio.
//  Nota: alarms tiene un mínimo de ~30s; el keep-alive sigue siendo la vía
//  rápida (~1s) cuando está activo.
// ---------------------------------------------------------------------------
function ensurePump() {
  try { chrome.alarms.create('vca-pump', { periodInMinutes: 0.5 }); } catch (e) {}
}
// Al instalar/actualizar/recargar la extensión, las ventanas de control abiertas
// quedan HUÉRFANAS (su contexto se invalida y dejan de responder). Las cerramos
// para que no queden ventanas muertas ni inunden el registro de errores.
async function closeStaleControlWindows() {
  const base = chrome.runtime.getURL('control.html');
  try {
    const wins = await chrome.windows.getAll({ populate: true });
    for (const w of wins) {
      if ((w.tabs || []).some(t => t.url && t.url.split('?')[0] === base)) {
        try { await chrome.windows.remove(w.id); } catch (e) {}
      }
    }
  } catch (e) {}
  controlWinId = null;
}

// AL INSTALAR/ACTUALIZAR: las pestañas abiertas quedan sin conexión con la
// extensión nueva.
//  - GO Bci: se recarga sola (como hacía la versión de Vocalcom).
//  - Vicidial: NUNCA se recarga, porque recargar la pantalla del agente puede
//    sacarlo de la sesión o cortar la llamada. En su lugar se le inyectan los
//    scripts en la página ya abierta.
// Antes de cerrar o recargar una pestaña de Bci: que no salte el aviso
// "¿Quieres salir del sitio?" (dejaría todo detenido esperando un clic).
async function soltarSalida(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true }, world: 'MAIN',
      func: () => { try { window.__vcaSalidaLibre = true; window.onbeforeunload = null; } catch (e) {} }
    });
  } catch (e) {}
}
// Ventanas emergentes de Bci (GO abre el multicotizador en otra ventana):
// permitidas, para que Chrome no las bloquee cuando las abre un atajo.
function permitirVentanasBci() {
  try {
    if (!chrome.contentSettings || !chrome.contentSettings.popups) return;
    ['https://*.bciseguros.cl/*', 'http://*.bciseguros.cl/*'].forEach((pat) => {
      try { chrome.contentSettings.popups.set({ primaryPattern: pat, setting: 'allow' }, () => void chrome.runtime.lastError); } catch (e) {}
    });
  } catch (e) {}
}
permitirVentanasBci();

async function reloadOurSiteTabs() {
  let go = [];
  try { go = await chrome.tabs.query({ url: '*://go.bciseguros.cl/*' }); } catch (e) {}
  for (const t of go) {
    await soltarSalida(t.id);
    try { await chrome.tabs.reload(t.id, { bypassCache: false }); } catch (e) {}
  }
  let vici = [];
  try { vici = await chrome.tabs.query({ url: '*://vicidial.recaall.simtastic.cl/*' }); } catch (e) {}
  // Otras páginas de Bci (multicotizador…): una cotización a medias no se
  // recarga; se le conecta la extensión nueva igual que a Vicidial.
  try { vici = vici.concat((await chrome.tabs.query({ url: '*://*.bciseguros.cl/*' })).filter(t => !/\/\/go\.bciseguros\.cl\//i.test(t.url || ''))); } catch (e) {}
  for (const t of vici) {
    try { await chrome.scripting.executeScript({ target: { tabId: t.id, allFrames: true }, world: 'MAIN', files: ['content.js'] }); } catch (e) {}
    try { await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['bridge.js'] }); } catch (e) {}
  }
}

// ---------------------------------------------------------------------------
//  ATAJOS COMPARTIDOS (default-config.json del paquete)
//  Vienen sin usuario ni clave (pasos con `credencial`): cada persona usa los
//  suyos. Cada vez que el paquete trae una publicación más nueva, sus atajos
//  se instalan o se ponen al día (por id o por nombre) en el respaldo de cada
//  sitio; los atajos propios de la persona se conservan. Al abrir Vicidial o
//  GO la página toma esa lista (más nueva). En el computador de quien los
//  publicó (`autor`) no se hace nada: ahí están los originales.
// ---------------------------------------------------------------------------
const normaNombre = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
async function aplicarCompartidos() {
  try {
    const cfg = await fetch(chrome.runtime.getURL('default-config.json')).then((r) => r.json()).catch(() => null);
    if (!cfg || !cfg.publicado || !Array.isArray(cfg.states) || !cfg.states.length) return;
    const yo = await chrome.storage.local.get(['vcaInstalacion', 'vcaCompartidoT']);
    if (cfg.autor && cfg.autor === yo.vcaInstalacion) return;
    if ((yo.vcaCompartidoT || 0) >= cfg.publicado) return;
    const porSitio = {};
    cfg.states.forEach((s) => { if (s && s.id && (s.steps || []).length) (porSitio[sitioClave(s.site || '')] = porSitio[sitioClave(s.site || '')] || []).push(s); });
    const ahora = Date.now();
    for (const sitio of Object.keys(porSitio)) {
      if (!sitio) continue;
      const k = 'vcaSitio:' + sitio;
      const b = (await chrome.storage.local.get(k))[k] || {};
      const lista = Array.isArray(b.states) ? b.states.slice() : [];
      porSitio[sitio].forEach((s) => {
        const nuevo = { id: s.id, label: s.label, steps: s.steps, color: s.color || '', compartido: cfg.publicado };
        const i = lista.findIndex((x) => x && (x.id === s.id || normaNombre(x.label) === normaNombre(s.label)));
        if (i >= 0) lista[i] = Object.assign({}, lista[i], nuevo); else lista.push(nuevo);
      });
      await chrome.storage.local.set({ [k]: Object.assign({}, b, { states: lista, statesT: ahora, t: ahora }) });
    }
    await chrome.storage.local.set({ vcaCompartidoT: cfg.publicado });
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(async (details) => {
  ensurePump();
  closeStaleControlWindows();
  await aplicarCompartidos();
  // 'install' (primera vez) y 'update' (nueva versión) dejan el script viejo
  // colgado; en ambos casos recargamos las pestañas de los sitios.
  if (!details || details.reason === 'install' || details.reason === 'update') {
    reloadOurSiteTabs();
  }
});
chrome.runtime.onStartup.addListener(() => { ensurePump(); permitirVentanasBci(); aplicarCompartidos(); });
ensurePump();

async function pumpTick() {
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: '*://vicidial.recaall.simtastic.cl/*' }); } catch (e) {}
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: t.id, allFrames: true },
        world: 'MAIN',
        func: () => { try { if (window.__vcaTick) window.__vcaTick(); } catch (e) {} }
      });
    } catch (e) {}
  }
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'vca-pump') pumpTick(); });

// ---------------------------------------------------------------------------
//  ATAJOS QUE CRUZAN PÁGINAS
//  Antes de cada clic, la página anota aquí "voy en el paso N" (con todos los
//  pasos). Si ese clic abre otra página —en la misma pestaña o en una nueva,
//  del mismo sitio o de otro (GO → multicotizador)—, la página nueva pregunta
//  al cargar y, si el paso que sigue es suyo, continúa desde ahí.
//  Se entrega UNA sola vez: a la misma pestaña, o a una página de otro sitio.
// ---------------------------------------------------------------------------
const PEND = 'vcaPendiente';
const area = chrome.storage.session || chrome.storage.local;
const VIGENCIA_MS = 60 * 1000;
// Vigente hasta: 60 s desde el último aviso, o más si la página lo pidió
// (ej. 3 minutos mientras espera que la persona inicie sesión).
const vigente = (p) => p && p.data && Date.now() < Math.max(p.t + VIGENCIA_MS, p.data.vence || 0);

// Una página de Bci quiso abrir una ventana nueva durante un atajo y Chrome
// la bloqueó: la abre la extensión (al lado de la pestaña que la pidió).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'abrirUrl' || !sender || !sender.tab) return;
  if (!/^https?:\/\//i.test(String(msg.url || '')) || !/(^|\.)bciseguros\.cl$/i.test(new URL(sender.tab.url || 'about:blank').hostname || '')) return;
  try { chrome.tabs.create({ url: msg.url, active: true, openerTabId: sender.tab.id, index: sender.tab.index + 1, windowId: sender.tab.windowId }); } catch (e) {}
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || (msg.type !== 'pendiente' && msg.type !== 'pendienteTomar')) return;
  const tab = sender && sender.tab ? sender.tab.id : null;
  (async () => {
    try {
      if (msg.type === 'pendiente') {
        const p = (await area.get(PEND))[PEND];
        // Otra pestaña ya tomó el atajo y va más adelante: un aviso atrasado no la pisa.
        const deOtra = p && p.tab !== tab && vigente(p);
        if (msg.op === 'clear') { if (!deOtra) await area.remove(PEND); }
        else if (msg.data && !(deOtra && p.data && p.data.label === msg.data.label && p.data.desde >= msg.data.desde)) {
          await area.set({ [PEND]: { data: msg.data, tab: tab, sitio: msg.data.sitio, t: Date.now() } });
        }
        reply({ ok: true });
        return;
      }
      // pendienteTomar
      const p = (await area.get(PEND))[PEND];
      if (!vigente(p)) { reply({}); return; }
      const sig = p.data.steps && p.data.steps[p.data.desde];
      if (!sig || (sig.sitio && sig.sitio !== msg.sitio)) { reply({}); return; }
      if (tab !== p.tab && msg.sitio === p.sitio) { reply({}); return; }   // otra pestaña del mismo sitio: no
      // Entregado: desde ahora lo lleva esta pestaña.
      // (sin la vigencia larga: ya la tomó una página que avanza por su cuenta)
      await area.set({ [PEND]: { data: Object.assign({}, p.data, { vence: 0 }), tab: tab, sitio: msg.sitio, t: Date.now(), tomado: true } });
      reply({ data: p.data });
    } catch (e) { reply({}); }
  })();
  return true;
});

// ---------------------------------------------------------------------------
//  PEDIDOS DEL COTIZADOR DENTAL (otra extensión)
//  El cotizador encuentra a ShortCut por la marca `vca_ext_id` que el puente
//  deja en la página de Vicidial, y le pide:
//    {type:'listarFlujos'}                 → los atajos de GO / multicotizador
//    {type:'ejecutarFlujo', id, forzarLogin} → ejecutarlo (abre GO si está cerrado;
//                                            con forzarLogin, parte siempre en el login)
//  Sólo atiende estos dos pedidos; nada más se puede hacer desde fuera.
// ---------------------------------------------------------------------------
function sitioClave(host) {
  host = String(host || '').toLowerCase();
  if (/vicidial\.recaall\.simtastic\.cl/.test(host)) return 'vicidial';
  return host;
}
async function flujosGuardados() {
  const todo = await chrome.storage.local.get(null);
  const out = [];
  Object.keys(todo).forEach((k) => {
    const m = /^vcaSitio:(.+)$/.exec(k);
    if (!m || !/bciseguros/.test(m[1])) return;
    ((todo[k] && todo[k].states) || []).forEach((s) => {
      if (!s || !s.id || !(s.steps || []).length) return;
      const sitios = [];
      s.steps.forEach((p) => { if (p.sitio && sitios[sitios.length - 1] !== p.sitio) sitios.push(p.sitio); });
      out.push({ id: s.id, label: s.label || 'Atajo', sitio: m[1], pasos: s.steps.length, sitios: sitios,
                 creado: s.steps[0] && s.steps[0].t || 0, steps: s.steps });
    });
  });
  return out;
}
async function enfocar(tab) {
  try { await chrome.tabs.update(tab.id, { active: true }); } catch (e) {}
  try { if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
}
// RUT que muestra el cotizador (ej. 12780633-0): es el que escribe el atajo.
function dvDe(num) {
  let s = 0, m = 2;
  for (let i = num.length - 1; i >= 0; i--) { s += Number(num[i]) * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (s % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
async function clienteDelCotizador(rut) {
  const m = /^(\d{6,8})-?([\dK])$/.exec(String(rut).toUpperCase().replace(/[^0-9K-]/g, ''));
  if (!m || dvDe(m[1]) !== m[2]) return;
  const previo = (await chrome.storage.local.get('vcaCliente')).vcaCliente || {};
  const dato = Object.assign({}, previo.num === m[1] ? previo : {}, {
    num: m[1], dv: m[2], rut: m[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + m[2], t: Date.now() });
  await chrome.storage.local.set({ vcaCliente: dato });
}
// Todas las pestañas de Bci (GO, multicotizador…). Nunca Vicidial.
async function pestanasBci() {
  try { return (await chrome.tabs.query({ url: '*://*.bciseguros.cl/*' })).filter((t) => !/vicidial/i.test(t.url || '')); } catch (e) { return []; }
}
// Pasos del inicio de sesión de GO (los primeros pasos en la pantalla de
// login de un atajo que tiene la clave grabada, ej. «LOGUEO GO»).
const RUTA_LOGIN = /login|ingres|sesion/i;
function pasosDeLogin(lista) {
  for (const x of lista) {
    if (!x.steps.some((p) => p.secreto)) continue;
    const out = [];
    for (const p of x.steps) { if (!RUTA_LOGIN.test(p.ruta || '')) break; out.push(p); }
    if (out.some((p) => p.secreto)) return out;
  }
  return [];
}
async function ejecutarFlujo(id, forzarLogin, limpiar) {
  const lista = await flujosGuardados();
  const f = lista.find((x) => x.id === id);
  if (!f) return { ok: false, motivo: 'no-existe' };
  // Un atajo sin el login (ej. «EVALUAR MEDIO DE PAGO») en una pestaña nueva:
  // si GO pide la clave, entra con los pasos del login de otro atajo. Si la
  // sesión sigue abierta, la página se los salta sola.
  let steps = f.steps;
  if (limpiar && !RUTA_LOGIN.test((steps[0] && steps[0].ruta) || '')) {
    const login = pasosDeLogin(lista.filter((x) => x.id !== id && x.sitio === f.sitio));
    if (login.length) steps = login.concat(steps);
  }
  const url = (steps[0] && steps[0].url) || ('https://' + f.sitio + '/');
  if (limpiar) {
    // Partir limpio: se cierran TODAS las pestañas de GO y del multicotizador
    // (con sus avisos y ventanas a medias) y se abre una sola, nueva.
    const viejas = await pestanasBci();
    const ref = viejas.slice().sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)))[0];
    let win = null;
    try { win = ref ? await chrome.windows.get(ref.windowId) : await chrome.windows.getLastFocused({ windowTypes: ['normal'] }); } catch (e) {}
    const nueva = await chrome.tabs.create(Object.assign({ url: 'about:blank', active: true },
      win && win.type === 'normal' ? { windowId: win.id } : {}, ref && win && win.id === ref.windowId ? { index: ref.index } : {}));
    for (const t of viejas) await soltarSalida(t.id);
    try { if (viejas.length) await chrome.tabs.remove(viejas.map((t) => t.id)); } catch (e) {}
    await area.set({ [PEND]: { data: { label: f.label, steps: steps, desde: 0, sitio: 'panel', t: Date.now(), vence: Date.now() + 3 * 60 * 1000 }, tab: null, sitio: 'panel', t: Date.now() } });
    try { await chrome.tabs.update(nueva.id, { url: url }); } catch (e) {}
    await enfocar(nueva);
    return { ok: true, como: 'GO abierto limpio', cerradas: viejas.length };
  }
  let tabs = [];
  try { tabs = (await chrome.tabs.query({ url: '*://' + f.sitio + '/*' })); } catch (e) {}
  tabs.sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  const tab = tabs[0];
  if (tab && !forzarLogin) {
    // GO ya está abierto: se ejecuta ahí (se salta el login si la sesión sigue).
    let r = null;
    try { r = await chrome.tabs.sendMessage(tab.id, { type: 'arm', id: id }, { frameId: 0 }); } catch (e) {}
    if (r && r.ok) { await enfocar(tab); return { ok: true, como: 'pestaña abierta' }; }
  }
  // GO cerrado, sin conexión, o "partir siempre en el login": se abre en la
  // dirección del primer paso y la página que carga sigue el atajo.
  await area.set({ [PEND]: { data: { label: f.label, steps: f.steps, desde: 0, sitio: 'panel', t: Date.now(), vence: Date.now() + 3 * 60 * 1000 }, tab: null, sitio: 'panel', t: Date.now() } });
  if (tab) { try { await chrome.tabs.update(tab.id, { url: url, active: true }); } catch (e) {} await enfocar(tab); return { ok: true, como: 'login en la pestaña de GO' }; }
  const nueva = await chrome.tabs.create({ url: url, active: true });
  await enfocar(nueva);
  return { ok: true, como: 'GO abierto' };
}
chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  if (!msg || (msg.type !== 'listarFlujos' && msg.type !== 'ejecutarFlujo')) return;
  (async () => {
    try {
      if (msg.type === 'listarFlujos') {
        const fl = await flujosGuardados();
        reply({ ok: true, version: chrome.runtime.getManifest().version,
                flujos: fl.map((f) => ({ id: f.id, label: f.label, sitio: f.sitio, pasos: f.pasos, sitios: f.sitios, creado: f.creado })) });
      } else {
        if (msg.rut) await clienteDelCotizador(String(msg.rut));
        reply(await ejecutarFlujo(String(msg.id || ''), !!msg.forzarLogin, !!msg.limpiar));
      }
    } catch (e) { reply({ ok: false, motivo: String(e && e.message || e) }); }
  })();
  return true;
});
