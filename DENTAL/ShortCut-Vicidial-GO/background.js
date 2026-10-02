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
