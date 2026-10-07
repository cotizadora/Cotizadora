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
async function reloadOurSiteTabs() {
  let go = [];
  try { go = await chrome.tabs.query({ url: '*://go.bciseguros.cl/*' }); } catch (e) {}
  for (const t of go) {
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

chrome.runtime.onInstalled.addListener((details) => {
  ensurePump();
  closeStaleControlWindows();
  // 'install' (primera vez) y 'update' (nueva versión) dejan el script viejo
  // colgado; en ambos casos recargamos las pestañas de los sitios.
  if (!details || details.reason === 'install' || details.reason === 'update') {
    reloadOurSiteTabs();
  }
});
chrome.runtime.onStartup.addListener(ensurePump);
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
async function ejecutarFlujo(id, forzarLogin) {
  const f = (await flujosGuardados()).find((x) => x.id === id);
  if (!f) return { ok: false, motivo: 'no-existe' };
  const url = (f.steps[0] && f.steps[0].url) || ('https://' + f.sitio + '/');
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
        reply(await ejecutarFlujo(String(msg.id || ''), !!msg.forzarLogin));
      }
    } catch (e) { reply({ ok: false, motivo: String(e && e.message || e) }); }
  })();
  return true;
});
