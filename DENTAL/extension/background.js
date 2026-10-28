importScripts("historial-db.js");

/* ============================================================
   LECTURA DE i-dental EN UNA PESTAÑA DE FONDO
   e-dentalsys.com arma su listado con JavaScript, así que se abre
   el sitio en una pestaña que no se activa, se espera a que
   aparezcan las tarjetas, se leen y se cierra la pestaña.

   Vive aquí y no en el popup para que el buscador nunca espere ni
   dependa de esto: la lectura corre aparte, deja el listado
   guardado y el popup lo muestra apenas está.

   Cuándo se lee:
   - al instalar o actualizar la extensión, y al abrir el navegador
     si lo guardado tiene más de una semana;
   - cuando una búsqueda no encuentra el listado guardado;
   - desde el mapeo completo, siempre (lectura forzada).
   Si una lectura no encontró nada, no se reintenta sola antes de
   6 horas, para no abrir pestañas en cada búsqueda.
   ============================================================ */

const EDE_URL = "https://www.e-dentalsys.com/#clinicas";
const SEMANA = 7 * 24 * 60 * 60 * 1000;
const ESPERA_REINTENTO = 6 * 60 * 60 * 1000;
let enCurso = null;

function leerGuardado(claves){ return chrome.storage.local.get(claves); }

function esperarCarga(tabId, maxMs){
  return new Promise(function(resolver){
    let listo = false;
    function fin(){ if(listo) return; listo = true; chrome.tabs.onUpdated.removeListener(oir); clearTimeout(t); resolver(); }
    function oir(id, cambio){ if(id === tabId && cambio.status === "complete") fin(); }
    const t = setTimeout(fin, maxMs);
    chrome.tabs.onUpdated.addListener(oir);
    chrome.tabs.get(tabId, function(tab){ if(!chrome.runtime.lastError && tab && tab.status === "complete") fin(); });
  });
}

async function leerEdentalEnPestana(){
  const diag = {via: "pestaña de fondo", url: EDE_URL, cuando: new Date().toISOString()};
  let tab = null;
  try{
    tab = await chrome.tabs.create({url: EDE_URL, active: false});
    await esperarCarga(tab.id, 25000);
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ["edental.js"]});
    const r = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: function(){ return leerEdentalVivo(20000); }
    });
    const v = (r && r[0] && r[0].result) || {lista: []};
    Object.assign(diag, {encontradas: v.lista.length, como: v.via, api: v.api, apiClinicas: v.apiClinicas,
                         ms: v.ms, titulo: v.titulo, urlFinal: v.url,
                         recursos: v.recursos, paginacion: v.paginacion, texto: v.texto});
    const res = {lista: v.lista, error: ""};
    const guardar = {};
    if(v.lista.length) guardar.red_edental = {t: Date.now(), d: res};
    // La dirección de datos queda anotada: la próxima vez se lee directo, sin pestaña
    if(v.api) guardar.ede_api = v.api;
    await chrome.storage.local.set(guardar);
    return {res: res, diag: diag};
  }catch(e){
    diag.error = String(e && e.message || e);
    return {res: {lista: [], error: "no pude abrir el sitio en una pestaña de fondo"}, diag: diag};
  }finally{
    if(tab) chrome.tabs.remove(tab.id).catch(function(){});
    await chrome.storage.local.set({diag_edental_vivo: diag, ede_intento: {t: Date.now(), n: diag.encontradas || 0}});
  }
}

async function pedirLectura(forzar){
  if(enCurso) return enCurso;   // otra búsqueda o el mapeo ya la pidió
  if(!forzar){
    const g = await leerGuardado(["red_edental", "ede_intento", "diag_edental_vivo"]);
    if(g.red_edental && Date.now() - g.red_edental.t < SEMANA) return {res: g.red_edental.d, diag: g.diag_edental_vivo || null};
    if(g.ede_intento && !g.ede_intento.n && Date.now() - g.ede_intento.t < ESPERA_REINTENTO){
      return {res: {lista: [], error: ""}, diag: g.diag_edental_vivo || null, omitida: true};
    }
  }
  enCurso = leerEdentalEnPestana().finally(function(){ enCurso = null; });
  return enCurso;
}

chrome.runtime.onMessage.addListener(function(msg, sender, responder){
  if(!msg || msg.tipo !== "edentalVivo") return;
  pedirLectura(!!msg.forzar).then(responder);
  return true;
});

// Al instalar o actualizar se lee de inmediato; al abrir el navegador, sólo
// si lo guardado ya venció.
/* La vigilancia de Vicidial (vicidial-captura.js) se reconecta sola en la
   pestaña ya abierta al instalar, actualizar o abrir el navegador, y cada vez
   que se abre el cotizador. Sin esto, tras actualizar la extensión no se
   enteraba de las llamadas hasta recargar Vicidial. No recarga nada. */
async function conectarCaptura(){
  let tabs = [];
  try{ tabs = await chrome.tabs.query({url: "https://vicidial.recaall.simtastic.cl/agc/*"}); }catch(e){}
  for(const t of tabs){
    try{ await chrome.scripting.executeScript({target: {tabId: t.id}, files: ["vicidial-captura.js"]}); }catch(e){}
  }
}
chrome.runtime.onInstalled.addListener(conectarCaptura);
chrome.runtime.onStartup.addListener(conectarCaptura);
chrome.runtime.onMessage.addListener(function(msg){ if(msg && msg.tipo === "conectarCaptura") conectarCaptura(); });

chrome.runtime.onInstalled.addListener(function(d){
  if(d.reason === "install" || d.reason === "update") pedirLectura(true);
});
chrome.runtime.onStartup.addListener(function(){ pedirLectura(false); });

/* ============================================================
   HISTORIAL: captura automática y respaldos
   - vicidial-captura.js (dentro de Vicidial) manda cada lead que
     cae; aquí se guarda en el Historial.
   - Respaldos: cada hora se revisa si toca uno. Se guarda un punto
     de restauración interno y, una vez al día, un archivo JSON en
     Descargas/DENTAL-respaldos/ que sobrevive aunque se borre o
     reinstale la extensión.
   ============================================================ */
chrome.runtime.onMessage.addListener(function(msg, sender, responder){
  if(!msg || msg.tipo !== "capturaVicidial") return;
  const c = clienteDesdeCampos(msg.campos || {}, "");
  abrirAlEntrarLlamada(c.lead, sender && sender.tab);   // respaldo, por si no llegó el aviso rápido
  HDB.capturar(c, {ejecutivo: msg.usuario || ""})
    .then(function(r){ responder({ok: true, id: r && r.id}); })
    .catch(function(e){ responder({ok: false, error: String(e && e.message || e)}); });
  return true;
});

/* ============================================================
   ABRIR EL COTIZADOR SOLO CUANDO ENTRA UNA LLAMADA
   Cuando cae un lead nuevo en Vicidial se trae al frente su pestaña y
   se abre el popup, esté el ejecutivo en la pestaña que esté. Una vez por lead: si se cierra,
   no vuelve a abrirse hasta el próximo cliente. Se apaga desde la
   casilla "Abrir solo al entrar una llamada" del cotizador.
   Para poder abrirlo, la ventana de Chrome se pone al frente.
   ============================================================ */
let leadEnCurso = "";
async function abrirAlEntrarLlamada(lead, tab){
  if(!lead || lead === leadEnCurso) return;
  leadEnCurso = lead;   // en memoria: el aviso rápido y el respaldo no compiten
  const g = await chrome.storage.local.get(["autoAbrir", "ultimoLeadAbierto"]);
  if(g.autoAbrir === false || g.ultimoLeadAbierto === lead) return;
  await chrome.storage.local.set({ultimoLeadAbierto: lead});
  // Primero se trae la pestaña de Vicidial al frente, para leer al cliente
  if(tab && tab.id !== undefined){
    try{ await chrome.tabs.update(tab.id, {active: true}); }catch(e){}
    try{ await chrome.windows.update(tab.windowId, {focused: true}); }catch(e){}
  }
  if(!chrome.action || !chrome.action.openPopup) return;
  try{ await chrome.action.openPopup(tab && tab.windowId !== undefined ? {windowId: tab.windowId} : undefined); }
  catch(e){ try{ await chrome.action.openPopup(); }catch(e2){} }
}
chrome.runtime.onMessage.addListener(function(msg, sender){
  if(msg && msg.tipo === "llamadaNueva") abrirAlEntrarLlamada(String(msg.lead || ""), sender && sender.tab);
});

function hoyISO(){ const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

// Un documento oculto arma el archivo (un service worker no puede crear
// enlaces a archivos); la descarga se hace desde aquí.
async function urlDeArchivo(texto){
  if(chrome.offscreen){
    try{
      const hay = chrome.runtime.getContexts ? (await chrome.runtime.getContexts({contextTypes: ["OFFSCREEN_DOCUMENT"]})).length : 0;
      if(!hay) await chrome.offscreen.createDocument({url: "offscreen.html", reasons: ["BLOBS"], justification: "Respaldo del historial de clientes"});
      const r = await chrome.runtime.sendMessage({tipo: "hacerBlob", texto: texto, destino: "offscreen"});
      if(r && r.url) return r.url;
    }catch(e){}
  }
  return "data:application/json;charset=utf-8," + encodeURIComponent(texto);
}
async function respaldoEnArchivo(motivo){
  const datos = await HDB.exportar();
  const url = await urlDeArchivo(JSON.stringify(datos));
  const id = await chrome.downloads.download({
    url: url, filename: "DENTAL-respaldos/historial-dental-" + hoyISO() + ".json",
    conflictAction: "overwrite", saveAs: false
  });
  await HDB.meta("ultimoArchivo", {fecha: hoyISO(), ts: Date.now(), total: datos.total, motivo: motivo || "automático", descarga: id});
  return {total: datos.total};
}
async function revisarRespaldos(){
  try{
    const cfg = await HDB.configRespaldo();
    if(!cfg.auto) return;
    const lista = await HDB.listarRespaldos();
    const ultimo = lista[0] ? new Date(lista[0].ts).getTime() : 0;
    if(Date.now() - ultimo >= cfg.cadaHoras * 3600 * 1000) await HDB.respaldar("automático");
    if(cfg.archivo){
      const ua = await HDB.meta("ultimoArchivo");
      if(!ua || ua.fecha !== hoyISO()) await respaldoEnArchivo("automático");
    }
  }catch(e){}
}
chrome.runtime.onMessage.addListener(function(msg, sender, responder){
  if(!msg || msg.tipo !== "respaldoArchivo") return;
  respaldoEnArchivo(msg.motivo || "manual").then(responder, function(e){ responder({error: String(e && e.message || e)}); });
  return true;
});
try{
  chrome.alarms.create("respaldos", {periodInMinutes: 60, delayInMinutes: 1});
  chrome.alarms.onAlarm.addListener(function(a){ if(a.name === "respaldos") revisarRespaldos(); });
}catch(e){}
