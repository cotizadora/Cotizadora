/* ============================================================
   LECTURA DE i-dental EN UNA PESTAÑA DE FONDO
   e-dentalsys.com arma su listado con JavaScript, así que se abre
   el sitio en una pestaña que no se activa, se espera a que
   aparezcan las tarjetas, se leen y se cierra la pestaña.

   Vive aquí y no en el popup para que termine aunque el popup se
   cierre a mitad de camino: el resultado queda guardado y la
   próxima búsqueda lo usa al instante.
   ============================================================ */

const EDE_URL = "https://www.e-dentalsys.com/#clinicas";
let enCurso = null;

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
    Object.assign(diag, {encontradas: v.lista.length, ms: v.ms, titulo: v.titulo, urlFinal: v.url,
                         recursos: v.recursos, paginacion: v.paginacion, texto: v.texto});
    const res = {lista: v.lista, error: ""};
    if(v.lista.length) await chrome.storage.local.set({red_edental: {t: Date.now(), d: res}});
    return {res: res, diag: diag};
  }catch(e){
    diag.error = String(e && e.message || e);
    return {res: {lista: [], error: "no pude abrir el sitio en una pestaña de fondo"}, diag: diag};
  }finally{
    if(tab) chrome.tabs.remove(tab.id).catch(function(){});
    await chrome.storage.local.set({diag_edental_vivo: diag});
  }
}

chrome.runtime.onMessage.addListener(function(msg, sender, responder){
  if(!msg || msg.tipo !== "edentalVivo") return;
  // Si ya hay una lectura andando (otra búsqueda, el mapeo), se comparte
  if(!enCurso) enCurso = leerEdentalEnPestana().finally(function(){ enCurso = null; });
  enCurso.then(responder);
  return true;
});
