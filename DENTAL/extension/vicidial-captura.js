/* ============================================================
   CAPTURA AUTOMÁTICA DESDE VICIDIAL
   Corre dentro de la pantalla de agente de Vicidial. Cada pocos
   segundos mira el lead en pantalla (campos estándar y la pestaña
   FORM de la campaña, que es un marco aparte) y, cuando cae un
   lead nuevo o se completan sus datos, se los pasa al service
   worker para que queden en el Historial. Sólo lee: no escribe
   nada en Vicidial.
   ============================================================ */
(function(){
  if(window.top !== window) return;       // sólo en la página principal; los marcos se leen desde aquí
  // Al actualizar la extensión, la copia anterior queda desconectada (ya no
  // puede avisar). El service worker inyecta esta de nuevo en la pestaña
  // abierta; si la anterior sigue viva, no se duplica.
  if(window.__capturaDentalViva && window.__capturaDentalViva()) return;
  window.__capturaDentalViva = function(){ try{ return !!chrome.runtime.id; }catch(e){ return false; } };
  let ultimo = "";

  function leerCampos(doc, campos){
    if(!doc) return;
    doc.querySelectorAll("input, select, textarea").forEach(function(e){
      const k = String(e.name || e.id || "").toLowerCase();
      if(!k || e.type === "password" || e.type === "button" || e.type === "submit") return;
      const v = String(e.value || "").trim();
      if(v && !campos[k]) campos[k] = v;
    });
    // Marcos del mismo sitio (la pestaña FORM es uno)
    doc.querySelectorAll("iframe, frame").forEach(function(f){
      try{ leerCampos(f.contentDocument, campos); }catch(e){}
    });
  }
  // El usuario de Vicidial aparece en el texto "Logueado como usuario:137157624"
  function usuario(){
    const m = (document.body ? document.body.innerText.slice(0, 600) : "").match(/usuario:\s*([\w.-]+)/i);
    return m ? m[1] : "";
  }

  function mirar(){
    const campos = {};
    try{ leerCampos(document, campos); }catch(e){ return; }
    const lead = campos.lead_id || "";
    if(!lead) return;
    const clave = [lead, campos.nombres || campos.first_name || "", campos.rut || campos.vendor_lead_code || "",
                   campos.fono1 || campos.phone_number || "", campos.email || "", campos.comuna || campos.province || "",
                   campos.fec_nac1 || "", campos.fec_nac2 || "", campos.fec_nac3 || ""].join("|");
    if(clave === ultimo) return;
    // Esperar a que el lead tenga al menos nombre o RUT (el FORM carga después)
    if(!(campos.nombres || campos.first_name || campos.rut || campos.vendor_lead_code)) return;
    ultimo = clave;
    try{
      chrome.runtime.sendMessage({tipo: "capturaVicidial", campos: campos, usuario: usuario()}, function(){ void chrome.runtime.lastError; });
    }catch(e){}
  }
  setInterval(mirar, 3000);
  mirar();
})();
