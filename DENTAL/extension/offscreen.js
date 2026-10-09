/* Documento oculto: convierte el respaldo en un archivo descargable para el
   service worker (que no puede crear enlaces a archivos por sí mismo). */
chrome.runtime.onMessage.addListener(function(msg, sender, responder){
  if(!msg || msg.tipo !== "hacerBlob" || msg.destino !== "offscreen") return;
  const url = URL.createObjectURL(new Blob([msg.texto], {type: "application/json"}));
  setTimeout(function(){ URL.revokeObjectURL(url); }, 5 * 60 * 1000);
  responder({url: url});
});
