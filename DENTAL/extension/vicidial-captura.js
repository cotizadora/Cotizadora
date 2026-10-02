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

  // Aviso inmediato de llamada nueva: apenas cambia el lead en pantalla (sin
  // esperar nombre ni FORM) se avisa, para traer la pestaña y abrir el cotizador.
  let leadVisto = "";
  function vigilarLlamada(){
    const e = document.querySelector('input[name="lead_id"], #lead_id');
    const l = e ? String(e.value || "").trim() : "";
    if(!l || l === "0" || l === leadVisto) return;
    leadVisto = l;
    try{ chrome.runtime.sendMessage({tipo: "llamadaNueva", lead: l}, function(){ void chrome.runtime.lastError; }); }catch(e2){}
    mirar();
  }
  setInterval(vigilarLlamada, 400);
  vigilarLlamada();
})();

/* ============================================================
   CUENTA REGRESIVA PARA TIPIFICAR
   Aparece sola en la pantalla de Vicidial, arriba a la derecha, en
   cuanto se abre el formulario de tipificación (el marco del script,
   ej. "Corte Llamadas BCISALUR"). No hay que abrir ninguna extensión.
   Verde; ámbar y un pitido a los 10 s; rojo, parpadeo y dos pitidos a
   los 5 s; tres pitidos en 0. Se va cuando el formulario se cierra.
   − / + ajusta el límite (25 s; se recuerda) y clic en el número
   reinicia. Si el formulario dura más que el límite, se ofrece usar
   ese tiempo real (con 2 s de margen).
   ShortCut-Vicidial-GO trae el mismo reloj: si está, se usa el suyo
   y éste no se muestra (comparten límite y posición).
   ============================================================ */
(function(){
  if(window.top !== window) return;
  // Una copia por página; si la anterior quedó desconectada al actualizar, ésta la reemplaza
  if(window.__relojDentalVivo && window.__relojDentalVivo()) return;
  const vivo = function(){ try{ return !!chrome.runtime.id; }catch(e){ return false; } };
  window.__relojDentalVivo = vivo;
  const LIM = "vca_tipif_lim", POS = "vca_tipif_pos", DEF = 25;
  function leer(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } }
  function guardar(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function limite(){ const v = Number(leer(LIM, DEF)); return v >= 5 && v <= 180 ? v : DEF; }
  function pitido(n){
    try{
      const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC(); let t = ctx.currentTime;
      for(let i = 0; i < n; i++){
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
        o.start(t); o.stop(t + 0.18); t += 0.28;
      }
      setTimeout(function(){ try{ ctx.close(); }catch(e){} }, n * 300 + 200);
    }catch(e){}
  }
  // El formulario: un marco visible y grande, de otro sitio o dentro del panel
  // del script. No cuentan el webphone ni la pestaña FORM.
  function formulario(){
    const fs = document.querySelectorAll("iframe");
    for(let i = 0; i < fs.length; i++){
      const f = fs[i];
      if(/webphone|vcFormIFrame/i.test((f.id || "") + " " + (f.name || ""))) continue;
      let host = "";
      try{ host = new URL(f.getAttribute("src") || "", location.href).host; }catch(e){}
      const enScript = !!(f.closest && f.closest('[id*="script" i]'));
      if(!enScript && (!host || host === location.host)) continue;
      try{ if(getComputedStyle(f).visibility !== "visible") continue; }catch(e){ continue; }
      const r = f.getBoundingClientRect();
      if(r.width < 200 || r.height < 100) continue;
      return f;
    }
    return null;
  }
  // ShortCut-Vicidial-GO dibuja su propio reloj: si está a la vista, se usa ése
  function relojShortCut(){ const b = document.getElementById("vca-reloj-tipif"); return !!(b && b.style.display !== "none"); }

  const R = {caja: null, t0: 0, activo: false, clave: "", avisos: {}, ofreciendo: 0, msg: 0};
  function caja(){
    if(R.caja && document.documentElement.contains(R.caja)) return R.caja;
    const b = document.createElement("div");
    b.id = "dental-reloj-tipif";
    const pos = leer(POS, null);
    b.style.cssText = ["position:fixed", "z-index:2147483647", "display:none",
      pos ? "left:" + pos.left + "px;top:" + pos.top + "px" : "right:24px;top:72px",
      "background:#fff", "border:1px solid rgba(18,58,109,.25)", "border-radius:16px",
      "box-shadow:0 10px 30px rgba(12,28,56,.25), 0 2px 6px rgba(12,28,56,.12)",
      "padding:10px 12px", 'font-family:"Segoe UI",system-ui,Arial,sans-serif', "color:#15202b",
      "user-select:none", "min-width:190px"].join(";");
    (document.body || document.documentElement).appendChild(b);
    let arr = null;
    b.addEventListener("pointerdown", function(e){
      if(e.target.closest("button,[data-r=num]")) return;
      const r = b.getBoundingClientRect(); arr = {dx: e.clientX - r.left, dy: e.clientY - r.top};
      try{ b.setPointerCapture(e.pointerId); }catch(e2){}
    });
    b.addEventListener("pointermove", function(e){
      if(!arr) return;
      b.style.left = Math.max(0, Math.min(innerWidth - 60, e.clientX - arr.dx)) + "px";
      b.style.top = Math.max(0, Math.min(innerHeight - 40, e.clientY - arr.dy)) + "px"; b.style.right = "auto";
    });
    b.addEventListener("pointerup", function(){
      if(!arr) return; arr = null;
      const r = b.getBoundingClientRect(); guardar(POS, {left: Math.round(r.left), top: Math.round(r.top)});
    });
    b.addEventListener("click", function(e){
      const a = e.target.closest("[data-a]"); if(!a) return;
      const q = a.getAttribute("data-a");
      if(q === "menos" || q === "mas"){ guardar(LIM, Math.max(5, Math.min(180, limite() + (q === "mas" ? 1 : -1)))); if(R.activo) pintar(); }
      else if(q === "reiniciar") iniciar();
      else if(q === "cerrar"){ R.activo = false; R.ofreciendo = 0; ocultar(); }
      else if(q === "usar"){ guardar(LIM, Number(a.getAttribute("data-v"))); R.ofreciendo = 0; mensaje("Límite: " + limite() + " s", 1800); }
    });
    R.caja = b; return b;
  }
  function ocultar(){ if(R.caja) R.caja.style.display = "none"; }
  function iniciar(){ R.t0 = Date.now(); R.activo = true; R.avisos = {}; R.ofreciendo = 0; pintar(); }
  function pintar(){
    // Si ShortCut ya muestra su reloj, el de aquí se queda guardado (cuenta igual por detrás)
    if(relojShortCut()){ ocultar(); return; }
    const b = caja(), lim = limite(), resto = lim - (Date.now() - R.t0) / 1000, n = Math.ceil(resto);
    [[10, 1], [5, 2], [0, 3]].forEach(function(x){ if(resto <= x[0] && !R.avisos[x[0]] && lim > x[0]){ R.avisos[x[0]] = 1; pitido(x[1]); } });
    const color = resto <= 5 ? "#dc2626" : resto <= 10 ? "#d97706" : "#16a34a";
    const parpadea = resto <= 5 && Math.floor(Date.now() / 400) % 2 === 0;
    const C = 2 * Math.PI * 26, frac = Math.max(0, Math.min(1, resto / lim));
    if(b.__modo !== "reloj"){
      const btn = "all:unset;cursor:pointer;width:22px;height:22px;line-height:22px;text-align:center;border-radius:6px;background:#eef2f7;color:#123a6d;font-weight:800;font-size:14px";
      b.innerHTML = '<div style="display:flex;align-items:center;gap:12px">' +
        '<div data-r="num" data-a="reiniciar" title="Clic: reiniciar la cuenta" style="position:relative;width:64px;height:64px;cursor:pointer;flex:none">' +
          '<svg width="64" height="64" viewBox="0 0 64 64" style="transform:rotate(-90deg)"><circle cx="32" cy="32" r="26" fill="none" stroke="#e5eaf1" stroke-width="6"/>' +
          '<circle data-r="arco" cx="32" cy="32" r="26" fill="none" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '"/></svg>' +
          '<div data-r="cifra" style="position:absolute;inset:8px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:800;font-variant-numeric:tabular-nums"></div></div>' +
        '<div style="flex:1;min-width:0"><div data-r="tit" style="font-size:13px;font-weight:800;color:#123a6d"></div>' +
          '<div data-r="sub" style="font-size:11px;color:#5d6b7a;margin:2px 0 6px"></div>' +
          '<div style="display:flex;align-items:center;gap:5px"><button data-a="menos" title="Bajar el límite 1 s" style="' + btn + '">−</button>' +
          '<span data-r="lim" style="font-size:11px;font-weight:700;min-width:34px;text-align:center"></span>' +
          '<button data-a="mas" title="Subir el límite 1 s" style="' + btn + '">+</button></div></div>' +
        '<button data-a="cerrar" title="Ocultar" style="all:unset;cursor:pointer;align-self:flex-start;color:#94a3b8;font-size:14px">✕</button></div>';
      b.__modo = "reloj";
    }
    const q = function(r){ return b.querySelector('[data-r="' + r + '"]'); };
    b.style.display = "block"; b.style.borderColor = resto <= 5 ? color : "rgba(18,58,109,.25)";
    q("arco").setAttribute("stroke", color); q("arco").setAttribute("stroke-dashoffset", (C * (1 - frac)).toFixed(1));
    const c = q("cifra");
    c.textContent = n > 0 ? n : (n === 0 ? "0" : "+" + (-n)); c.style.fontSize = (n < 0 ? 18 : 24) + "px";
    c.style.color = parpadea ? "#fff" : color; c.style.background = parpadea ? color : "transparent";
    q("tit").textContent = resto > 0 ? "Tipificar" : "¡Tiempo!";
    q("sub").textContent = resto > 0 ? "quedan " + n + " s" : "se pasó el límite";
    q("lim").textContent = lim + " s";
  }
  function mensaje(txt, ms){
    const b = caja(); b.__modo = "mensaje"; b.style.display = "block"; b.style.borderColor = "rgba(18,58,109,.25)";
    b.innerHTML = '<div style="font-size:13px;font-weight:700;color:#123a6d;padding:4px 2px">' + txt + "</div>";
    const m = R.msg = Date.now();
    setTimeout(function(){ if(R.msg === m && !R.activo && !R.ofreciendo) ocultar(); }, ms);
  }
  function cerrado(){
    if(!R.activo){ if(!R.ofreciendo) ocultar(); return; }
    R.activo = false;
    const seg = Math.round((Date.now() - R.t0) / 1000), sug = seg - 2;
    // Duró MÁS que el límite: el sistema da más tiempo del configurado. (Si se
    // cerró antes, puede ser que tipificaste: no se puede distinguir, no se ofrece.)
    if(!relojShortCut() && seg > limite() + 1 && seg <= 180){
      const b = caja(); R.ofreciendo = Date.now(); b.__modo = "oferta"; b.style.display = "block"; b.style.borderColor = "#d97706";
      const btn = "all:unset;cursor:pointer;padding:5px 10px;border-radius:8px;font-size:12px;font-weight:700";
      b.innerHTML = '<div style="font-size:12.5px;line-height:1.35;max-width:230px"><b style="color:#9a6a00">El formulario duró ' + seg + " s.</b><br>" +
        "Si se cerró solo, conviene un límite de <b>" + sug + " s</b> (2 s de margen).</div>" +
        '<div style="display:flex;gap:6px;margin-top:8px"><button data-a="usar" data-v="' + sug + '" style="' + btn + ';background:#123a6d;color:#fff">Usar ' + sug + " s</button>" +
        '<button data-a="cerrar" style="' + btn + ';background:#eef2f7;color:#123a6d">No</button></div>';
      const m = R.ofreciendo; setTimeout(function(){ if(R.ofreciendo === m){ R.ofreciendo = 0; if(!R.activo) ocultar(); } }, 15000);
    } else ocultar();
  }
  setInterval(function(){
    if(!vivo()){ ocultar(); return; }          // copia vieja tras actualizar: se apaga
    const f = formulario(), clave = f ? (f.getAttribute("src") || "form") : "";
    if(clave && clave !== R.clave){ R.clave = clave; iniciar(); }
    else if(!clave && R.clave){ R.clave = ""; cerrado(); }
    if(R.activo) pintar();
  }, 250);
})();
