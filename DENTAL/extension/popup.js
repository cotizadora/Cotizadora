/* =========================================================
   Cotizador Dental Bci — popup
   Tarifas: Script Bci Dental Full, septiembre 2026.
   Valores en centésimas de UF (enteros) para que la
   conversión a pesos no arrastre errores de coma flotante.
   El índice del arreglo es la cantidad de cargas (0 a 3).
   ========================================================= */
const PLANES = [
  {id:"basico", nom:"Plan 2 Básico",     precios:[26, 33, 39, 46]},
  {id:"full",   nom:"Plan 3 Full",       precios:[43, 68, 92, 116]},
  {id:"ninos",  nom:"Plan 4 Full Niños", precios:[null, 81, 113, 144]}
];
const MAX_CARGAS = 3;
const EDAD_NINOS = 14;

/* Aqui NO se calcula la edad del titular: no cambia el plan ni el precio.
   Lo unico que importa es la carga contra el corte de 14 anos.
   Las reglas de titular y conyuge estan documentadas en ../PRODUCTO.md. */
const REGLAS = {
  hijo: {min:{a:0, d:14, txt:"14 días"}, ing:{a:23,d:0, txt:"23 años y 0 días"}, per:{a:24,d:0, txt:"24 años y 0 días"}}
};

/* ---------- fechas ---------- */
function hoy(){ const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function fmt(d){ return String(d.getDate()).padStart(2,"0")+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+d.getFullYear(); }
// Lee "dd/mm/aaaa" y verifica que la fecha exista de verdad (rechaza 31/02)
function leerFecha(txt){
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt.trim());
  if(!m) return null;
  const dd=+m[1], mm=+m[2], aa=+m[3];
  if(mm<1 || mm>12 || dd<1 || aa<1900) return null;
  const d = new Date(aa, mm-1, dd);
  if(d.getFullYear()!==aa || d.getMonth()!==mm-1 || d.getDate()!==dd) return null;
  if(d > hoy()) return null;
  return d;
}
function hito(nac, h){
  const b = new Date(nac.getFullYear()+(h.a||0), nac.getMonth(), nac.getDate());
  b.setDate(b.getDate() + (h.d||0));
  return b;
}
function edad(nac, ref){
  let y=ref.getFullYear()-nac.getFullYear(), m=ref.getMonth()-nac.getMonth(), d=ref.getDate()-nac.getDate();
  if(d<0){ m--; d += new Date(ref.getFullYear(), ref.getMonth(), 0).getDate(); }
  if(m<0){ y--; m+=12; }
  return {y:y,m:m,d:d};
}
function edadTxt(nac, ref){
  const e = edad(nac, ref);
  if(e.y>0) return e.y+"a "+e.m+"m";
  if(e.m>0) return e.m+"m "+e.d+"d";
  return e.d+" días";
}

/* ---------- números ---------- */
function miles(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,"."); }
function ufTxt(c){ return miles(Math.floor(c/100))+","+String(c%100).padStart(2,"0"); }
function pesos(ufCent, planCent){
  const bruto = ufCent*planCent;                       // unidades de 0,0001 peso
  return {
    exacto: "$"+miles(Math.floor(bruto/10000))+","+String(bruto%10000).padStart(4,"0"),
    redondo: "$"+miles(Math.round(bruto/10000))
  };
}

/* ---------- valor UF ---------- */
let UF = null;
function pintarUF(cent, fecha, fuente){
  UF = cent;
  document.getElementById("ufVal").textContent   = cent===null ? "—" : "$"+ufTxt(cent);
  document.getElementById("ufFecha").textContent = cent===null ? "" : fecha+" · "+fuente;
  calcular();
}
async function cargarUF(){
  document.getElementById("ufFecha").textContent = "actualizando…";
  try{
    const r = await fetch("https://mindicador.cl/api/uf", {cache:"no-store"});
    if(r.ok){
      const j = await r.json(), s = j.serie && j.serie[0];
      if(s && s.valor){
        const cent = Math.round(s.valor*100);
        const iso = String(s.fecha).slice(0,10).split("-");          // sin desfase de zona horaria
        const f = iso[2]+"-"+iso[1]+"-"+iso[0];
        guardar(cent, f);
        pintarUF(cent, f, "mindicador");
        return;
      }
    }
  }catch(e){}
  try{
    const r = await fetch("https://api.boostr.cl/economy/uf.json", {cache:"no-store"});
    if(r.ok){
      const j = await r.json(), v = j && j.data && (j.data.value || j.data.valor);
      if(v){
        const cent = Math.round(parseFloat(String(v).replace(/\./g,"").replace(",","."))*100);
        const f = fmt(hoy());
        guardar(cent, f);
        pintarUF(cent, f, "boostr");
        return;
      }
    }
  }catch(e){}
  const c = leerGuardado();
  if(c){ pintarUF(c.c, c.f, "guardado"); }
  else  { pintarUF(null, "", ""); }
  document.getElementById("ufManualBox").style.display = "flex";
}
function guardar(c, f){ almacen.escribir("uf", {c:c, f:f}); }
let cacheUF = null;
function leerGuardado(){ return cacheUF; }

/* ---------- evaluación ---------- */
function evaluar(nac, ref, tipo){
  const r = REGLAS[tipo];
  const fMin = hito(nac, r.min), fIng = hito(nac, r.ing), fPer = hito(nac, r.per);
  let estado, motivo = "";
  if(ref < fMin){
    estado = "menor";
    motivo = "no cumple la edad mínima de ingreso ("+r.min.txt+"), la cumple el "+fmt(fMin);
  }else if(ref > fIng){
    estado = "fuera";
    motivo = (ref < fPer)
      ? "supera la edad máxima de ingreso ("+r.ing.txt+"), alcanzada el "+fmt(fIng)
      : "superó la edad máxima de permanencia ("+r.per.txt+") el "+fmt(fPer);
  }else{
    estado = "ok";
  }
  return {estado:estado, motivo:motivo, menor14: ref < hito(nac, {a:EDAD_NINOS, d:0})};
}

/* ---------- entrada rápida de fecha ---------- */
function autoFecha(el){
  const pos = el.selectionStart, largo = el.value.length;
  let v = el.value.replace(/\D/g,"").slice(0,8);
  if(v.length > 4)      v = v.slice(0,2)+"/"+v.slice(2,4)+"/"+v.slice(4);
  else if(v.length > 2) v = v.slice(0,2)+"/"+v.slice(2);
  el.value = v;
  if(pos < largo) el.setSelectionRange(pos, pos);       // no saltar al final al editar en medio
}

/* ---------- guardado ----------
   El popup se cierra cada vez que el ejecutivo pincha fuera, y en una
   llamada real se sale a buscar datos a otro sistema. Nada de lo que
   escriba puede perderse: el estado se guarda en cada tecla y se
   restaura al abrir. Sólo el botón "Nuevo cliente" lo borra. */
const almacen = {
  leer: function(clave, cb){
    try{ chrome.storage.local.get(clave, function(r){ cb(r ? r[clave] : null); }); }
    catch(e){
      try{ cb(JSON.parse(localStorage.getItem(clave) || "null")); }catch(e2){ cb(null); }
    }
  },
  escribir: function(clave, valor){
    try{ chrome.storage.local.set(Object.fromEntries([[clave, valor]])); }
    catch(e){ try{ localStorage.setItem(clave, JSON.stringify(valor)); }catch(e2){} }
  },
  borrar: function(clave){
    try{ chrome.storage.local.remove(clave); }
    catch(e){ try{ localStorage.removeItem(clave); }catch(e2){} }
  }
};

let restaurando = false;

function guardarEstado(){
  if(restaurando) return;
  const cargas = [].map.call(document.querySelectorAll("#hijos .fila"), function(f){
    return { edad: f.querySelector(".edad").value, fecha: f.querySelector(".fecha").value };
  });
  const hayAlgo = nCargas > 0 || cargas.some(function(c){ return c.edad || c.fecha; });
  if(!hayAlgo){ almacen.borrar("estado"); pintarGuardado(null); return; }
  const estado = {
    n: nCargas,
    plan: planElegido,
    abierto: !document.getElementById("panelVerif").hidden,
    cargas: cargas,
    cuando: Date.now()
  };
  almacen.escribir("estado", estado);
  pintarGuardado(estado);
}

function pintarGuardado(estado){
  const barra = document.getElementById("guardado");
  if(!estado){ barra.hidden = true; return; }
  barra.hidden = false;
  const d = new Date(estado.cuando);
  document.getElementById("guardadoTxt").textContent =
    "Guardado a las " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0") +
    ". Se mantiene aunque cierres el popup.";
}

function restaurarEstado(cb){
  almacen.leer("estado", function(e){
    if(!e){ if(cb) cb(); return; }
    restaurando = true;
    nCargas = e.n || 0;
    planElegido = e.plan || "full";
    marcarCargas();
    const cont = document.getElementById("hijos");
    cont.innerHTML = "";
    (e.cargas || []).forEach(function(c){
      const caja = filaHijo(true);
      caja.querySelector(".edad").value  = c.edad  || "";
      caja.querySelector(".fecha").value = c.fecha || "";
    });
    if(e.abierto){
      document.getElementById("panelVerif").hidden = false;
      document.getElementById("abrirVerif").classList.add("open");
    }
    restaurando = false;
    pintarGuardado(e);
    calcular();
    if(cb) cb();
  });
}

/* ---------- veredictos ----------
   Con la fecha de nacimiento el veredicto es exacto.
   Con la edad en años alcanza para lo que decide el plan, salvo en los
   bordes (recién nacido, 23 años), donde hay que pedir la fecha. */
let nCargas = 0;

function veredictoPorFecha(nac, ref){
  const ev = evaluar(nac, ref, "hijo");
  const e  = edadTxt(nac, ref);
  if(ev.estado === "menor")
    return {clase:"no", chip:"bad", corto:e+" · aún no",
            texto:"Aún no puede ingresar: la edad mínima es 14 días. Podrá desde el "+fmt(hito(nac, REGLAS.hijo.min))+".",
            menor14:false, bloquea:true};
  if(ev.estado === "fuera")
    return {clase:"no", chip:"bad", corto:e+" · fuera",
            texto:"No entra en ningún plan: "+ev.motivo+".", menor14:false, bloquea:true};
  if(ev.menor14)
    return {clase:"no", chip:"warn", corto:e+" · menor de 14",
            texto:"Sólo Plan 4 Full Niños. No entra en Urgencia ni en Full.", menor14:true, bloquea:false};
  return {clase:"si", chip:"ok", corto:e+" · califica",
          texto:"Entra en Urgencia, en Full y en Full Niños.", menor14:false, bloquea:false};
}

function veredictoPorEdad(a){
  if(a < 0 || a > 120) return null;
  if(a === 0)
    return {clase:"pide", chip:"warn", corto:"menos de 1 año",
            texto:"Escribe la fecha de nacimiento: la edad mínima de ingreso son 14 días.",
            menor14:true, bloquea:false, aprox:true};
  if(a < 14)
    return {clase:"no", chip:"warn", corto:a+" años · menor de 14",
            texto:"Sólo Plan 4 Full Niños. No entra en Urgencia ni en Full.",
            menor14:true, bloquea:false, aprox:true};
  if(a < 23)
    return {clase:"si", chip:"ok", corto:a+" años · califica",
            texto:"Entra en Urgencia, en Full y en Full Niños.",
            menor14:false, bloquea:false, aprox:true};
  if(a === 23)
    return {clase:"pide", chip:"warn", corto:"23 años · depende",
            texto:"Escribe la fecha de nacimiento: el tope de ingreso es 23 años y 0 días, así que depende del día exacto.",
            menor14:false, bloquea:false, aprox:true};
  return {clase:"no", chip:"bad", corto:a+" años · fuera",
          texto:"No entra en ningún plan: el tope de permanencia es 24 años y 0 días.",
          menor14:false, bloquea:true, aprox:true};
}

/* ---------- filas de cargas ---------- */
function filaHijo(silencioso){
  const cont = document.getElementById("hijos");
  if(cont.querySelectorAll(".fila").length >= MAX_CARGAS) return null;
  const caja = document.createElement("div");
  caja.innerHTML =
    '<div class="fila">'+
      '<input type="text" class="edad" inputmode="numeric" placeholder="edad" maxlength="3">'+
      '<span class="sep">o</span>'+
      '<input type="text" class="fecha" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">'+
      '<span class="chip">—</span>'+
    '</div>'+
    '<div class="veredicto n"></div>';
  cont.appendChild(caja);
  const ed = caja.querySelector(".edad"), fe = caja.querySelector(".fecha");
  ed.addEventListener("input", function(){
    this.value = this.value.replace(/\D/g,"").slice(0,3);
    calcular(); guardarEstado();
  });
  fe.addEventListener("input", function(){ autoFecha(this); calcular(); guardarEstado(); });
  if(!silencioso){ ed.focus(); calcular(); guardarEstado(); }
  return caja;
}

/* ---------- cálculo ---------- */
let ultimaCotizacion = "";
let planElegido = "full";

function calcular(){
  const ref = hoy();
  const problemas = [];
  let menores = 0, evaluados = 0;

  [].forEach.call(document.querySelectorAll("#hijos .fila"), function(f){
    const ed  = f.querySelector(".edad");
    const fe  = f.querySelector(".fecha");
    const chip = f.querySelector(".chip");
    const ver  = f.parentNode.querySelector(".veredicto");

    const nac = leerFecha(fe.value);
    fe.classList.toggle("mal", fe.value.length===10 && !nac);

    let v = null;
    if(nac){
      // Con fecha, la edad se deriva y se bloquea para que no se pisen
      v = veredictoPorFecha(nac, ref);
      ed.value = edad(nac, ref).y;
      ed.readOnly = true;
      ed.title = "Calculada desde la fecha. Borra la fecha para escribirla a mano.";
      ed.classList.remove("mal");
    }else{
      ed.readOnly = false;
      ed.title = "";
      if(ed.value !== ""){
        v = veredictoPorEdad(parseInt(ed.value, 10));
        ed.classList.toggle("mal", v === null);
      }else{
        ed.classList.remove("mal");
      }
    }

    if(!v){
      chip.className = "chip";
      chip.textContent = (fe.value.length===10) ? "fecha inválida" : (fe.value ? "fecha incompleta" : "—");
      ver.className = "veredicto n"; ver.textContent = "";
      return;
    }
    evaluados++;
    chip.className = "chip " + v.chip;
    chip.textContent = v.corto;
    ver.className = "veredicto " + v.clase;
    ver.textContent = v.texto + (v.aprox && v.clase!=="pide" ? " (por edad; con la fecha queda exacto)" : "");
    if(v.menor14) menores++;
    if(v.bloquea) problemas.push(v.texto);
  });

  if(evaluados > nCargas){ nCargas = Math.min(evaluados, MAX_CARGAS); marcarCargas(); }

  document.getElementById("abrirVerif").classList.toggle("hay", menores > 0);

  // Plan
  const obliga = menores > 0;
  if(obliga) planElegido = "ninos";
  if(PLANES.filter(function(p){ return p.id===planElegido; })[0].precios[nCargas] === null && !obliga){
    planElegido = "full";
  }
  const plan = PLANES.filter(function(p){ return p.id===planElegido; })[0];
  const cent = plan.precios[nCargas];

  // Aviso
  const av = document.getElementById("aviso");
  let clase = "aviso", texto = "";
  if(obliga){
    clase = "aviso bad";
    const alt = PLANES[0].precios[nCargas];
    texto = "Hay "+menores+" menor"+(menores===1?"":"es")+" de 14: no entra"+(menores===1?"":"n")+
            " en Urgencia ni en Full. Obligatorio Plan 4 Full Niños.";
    if(UF && alt!==null && cent!==null) texto += " Son "+pesos(UF, cent-alt).redondo+" más al mes que Urgencia.";
  }else if(evaluados > 0){
    clase = "aviso ok";
    texto = (evaluados===1 ? "La carga califica" : "Las "+evaluados+" cargas califican")+
            ": el cliente elige entre Urgencia y Full.";
  }
  if(cent === null){
    clase = "aviso warn";
    texto = "El Plan 4 Full Niños no se vende con titular solo. Marca al menos 1 carga.";
  }
  if(problemas.length){ clase = "aviso bad"; texto = problemas.join(" "); }
  av.className = clase; av.textContent = texto;

  // Tabla seleccionable
  document.getElementById("tbody").innerHTML = PLANES.map(function(p){
    const c = p.precios[nCargas];
    const veta = (obliga && p.id!=="ninos");
    if(c === null) return '<tr><td class="off">'+p.nom+'</td><td class="n off">—</td><td class="n off">no aplica</td></tr>';
    const v = UF ? pesos(UF, c) : null;
    const cls = (p.id===planElegido) ? "hit" : (veta ? "veta" : "sel");
    return '<tr class="'+cls+'" data-plan="'+p.id+'"><td>'+p.nom+(veta ? ' <small>(no admite menores)</small>' : '')+
           '</td><td class="n">'+ufTxt(c)+'</td><td class="n">'+(v ? v.redondo : "—")+"</td></tr>";
  }).join("");

  // Total
  const v = (UF && cent!==null) ? pesos(UF, cent) : null;
  const compos = ["titular solo","titular + 1","titular + 2","titular + 3"][nCargas];
  document.getElementById("tUF").textContent  = cent===null ? "—" : ufTxt(cent)+" UF";
  document.getElementById("tCLP").textContent = v ? v.redondo : "";
  document.getElementById("exacto").textContent = v ? ufTxt(cent)+" × $"+ufTxt(UF)+" = "+v.exacto
                                                    : (UF ? "" : "sin valor UF");
  ultimaCotizacion = v
    ? plan.nom+" · "+compos+" · "+ufTxt(cent)+" UF · "+v.redondo+" mensual (UF de hoy $"+ufTxt(UF)+")"
    : "";
}

function marcarCargas(){
  [].forEach.call(document.querySelectorAll("#conteo button"), function(b){
    b.classList.toggle("on", +b.dataset.n === nCargas);
  });
}

/* ---------- eventos ---------- */
document.getElementById("ufReload").addEventListener("click", cargarUF);
document.getElementById("ufManual").addEventListener("input", function(){
  const v = parseFloat(this.value.replace(/\./g,"").replace(",","."));
  if(v > 0){
    const cent = Math.round(v*100), f = fmt(hoy());
    guardar(cent, f);                      // la UF escrita a mano también se recuerda
    pintarUF(cent, f, "manual");
  }
});
document.getElementById("conteo").addEventListener("click", function(e){
  const b = e.target.closest("button");
  if(!b) return;
  nCargas = +b.dataset.n;
  marcarCargas(); calcular(); guardarEstado();
});
document.getElementById("abrirVerif").addEventListener("click", function(){
  const panel = document.getElementById("panelVerif");
  const abierto = !panel.hidden;
  panel.hidden = abierto;
  this.classList.toggle("open", !abierto);
  if(!abierto && !document.querySelector("#hijos .fila")) filaHijo();
  guardarEstado();
});
document.getElementById("masHijo").addEventListener("click", function(){ filaHijo(); });
document.getElementById("tbody").addEventListener("click", function(e){
  const tr = e.target.closest("tr");
  if(!tr || !tr.dataset.plan || tr.classList.contains("veta")) return;
  planElegido = tr.dataset.plan;
  calcular(); guardarEstado();
});
document.getElementById("limpiar").addEventListener("click", function(){
  if(!confirm("¿Borrar los datos de este cliente y empezar de cero?")) return;
  almacen.borrar("estado");
  nCargas = 0; planElegido = "full";
  document.getElementById("hijos").innerHTML = "";
  document.getElementById("panelVerif").hidden = true;
  document.getElementById("abrirVerif").classList.remove("open","hay");
  marcarCargas(); pintarGuardado(null); calcular();
});
document.getElementById("copiar").addEventListener("click", function(){
  if(!ultimaCotizacion) return;
  navigator.clipboard.writeText(ultimaCotizacion).then(function(){
    const b = document.getElementById("copiar");
    b.textContent = "Copiado";
    setTimeout(function(){ b.textContent = "Copiar"; }, 1200);
  });
});

/* ---------- arranque ---------- */
almacen.leer("uf", function(u){
  if(u){ cacheUF = u; if(UF===null) pintarUF(u.c, u.f, "guardado"); }
  restaurarEstado(function(){ cargarUF(); });
});
calcular();
