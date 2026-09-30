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
function guardar(c, f){ try{ chrome.storage.local.set({uf:{c:c, f:f}}); }catch(e){} }
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

/* ---------- verificador de hijos ----------
   Las cargas se cuentan con los botones: eso basta para el precio.
   Las fechas de los hijos son opcionales y sólo se piden cuando el
   ejecutivo sospecha que hay un menor, que es lo que cambia el plan. */
let nCargas = 0;

function veredictoHijo(nac, ref){
  const ev = evaluar(nac, ref, "hijo");
  const e  = edadTxt(nac, ref);
  if(ev.estado === "menor")
    return {clase:"no", chip:"bad", corto:e+" · aún no", texto:"Aún no puede ingresar: la edad mínima es 14 días.", menor14:false, bloquea:true};
  if(ev.estado === "fuera")
    return {clase:"no", chip:"bad", corto:e+" · fuera", texto:"No califica: "+ev.motivo+".", menor14:false, bloquea:true};
  if(ev.menor14)
    return {clase:"no", chip:"warn", corto:e+" · menor de 14",
            texto:"NO califica para el plan de Urgencia. Obliga a pasar al Plan 4 Full Niños.", menor14:true, bloquea:false};
  return {clase:"si", chip:"ok", corto:e+" · califica",
          texto:"Sí califica para el plan de Urgencia y para cualquier otro.", menor14:false, bloquea:false};
}

function filaHijo(){
  const cont = document.getElementById("hijos");
  if(cont.querySelectorAll(".fila").length >= MAX_CARGAS) return;
  const caja = document.createElement("div");
  caja.innerHTML =
    '<div class="fila">'+
      '<input type="text" class="fecha" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">'+
      '<span class="chip">—</span>'+
    '</div>'+
    '<div class="veredicto n"></div>';
  cont.appendChild(caja);
  const inp = caja.querySelector("input");
  inp.addEventListener("input", function(){ autoFecha(this); calcular(); });
  inp.focus();
  calcular();
}

/* ---------- cálculo ---------- */
let ultimaCotizacion = "";
/* Sin menores el cliente elige entre Urgencia y Full (y puede tomar el 4).
   Con un menor de 14, el Plan 4 es obligatorio y los otros se bloquean. */
let planElegido = "full";

function calcular(){
  const ref = hoy();
  const problemas = [];

  // Hijos verificados (opcional)
  let menores = 0, verificados = 0;
  [].forEach.call(document.querySelectorAll("#hijos .fila"), function(f){
    const inp = f.querySelector("input"), chip = f.querySelector(".chip");
    const ver = f.parentNode.querySelector(".veredicto");
    const nac = leerFecha(inp.value);
    inp.classList.toggle("mal", inp.value.length===10 && !nac);
    if(!nac){
      chip.className = "chip";
      chip.textContent = !inp.value ? "—" : (inp.value.length===10 ? "fecha inválida" : "fecha incompleta");
      ver.className = "veredicto n"; ver.textContent = "";
      return;
    }
    verificados++;
    const v = veredictoHijo(nac, ref);
    chip.className = "chip " + v.chip;
    chip.textContent = v.corto;
    ver.className = "veredicto " + v.clase;
    ver.textContent = v.texto;
    if(v.menor14) menores++;
    if(v.bloquea) problemas.push("Un hijo no califica: "+v.texto.replace(/^No califica: /,"").replace(/^Aún no puede ingresar: /,""));
  });

  // Si se verificaron más hijos que cargas marcadas, se ajusta el número
  if(verificados > nCargas){
    nCargas = Math.min(verificados, MAX_CARGAS);
    marcarCargas();
  }

  // Aviso del botón del verificador
  const btn = document.getElementById("abrirVerif");
  btn.classList.toggle("hay", menores > 0);

  // Plan
  const obliga = menores > 0;
  if(obliga) planElegido = "ninos";
  // Si la composición elegida no existe en ese plan, cae al Full
  if(PLANES.filter(function(p){ return p.id===planElegido; })[0].precios[nCargas] === null && !obliga){
    planElegido = "full";
  }
  const idPlan = planElegido;
  const plan   = PLANES.filter(function(p){ return p.id===idPlan; })[0];
  const cent   = plan.precios[nCargas];

  // Aviso
  const av = document.getElementById("aviso");
  let clase = "aviso", texto = "";
  if(obliga){
    clase = "aviso bad";
    const alt = PLANES[0].precios[nCargas];
    texto = "Hay "+menores+" menor"+(menores===1?"":"es")+" de 14: no entra"+(menores===1?"":"n")+
            " en el plan de Urgencia. Obligatorio Plan 4 Full Niños.";
    if(UF && alt!==null && cent!==null){
      texto += " Diferencia con Urgencia: "+pesos(UF, cent-alt).redondo+" más al mes.";
    }
  }else if(verificados > 0){
    clase = "aviso ok";
    texto = (verificados===1 ? "El hijo califica" : "Los "+verificados+" hijos califican")+
            ": puede quedar en Urgencia o en Full, como prefiera el cliente.";
  }
  if(cent === null){
    clase = "aviso warn";
    texto = "El Plan 4 Full Niños no se vende con titular solo. Marca al menos 1 carga.";
  }
  if(problemas.length){ clase = "aviso bad"; texto = problemas.join(" "); }
  av.className = clase;
  av.textContent = texto;

  // Tabla: cada fila disponible se puede elegir con un clic
  document.getElementById("tbody").innerHTML = PLANES.map(function(p){
    const c = p.precios[nCargas];
    const veta = (obliga && p.id!=="ninos");           // planes que el menor deja fuera
    if(c === null){
      return '<tr><td class="off">'+p.nom+'</td><td class="n off">—</td><td class="n off">no aplica</td></tr>';
    }
    const v = UF ? pesos(UF, c) : null;
    const cls = (p.id===idPlan) ? "hit" : (veta ? "veta" : "sel");
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
  if(v > 0) pintarUF(Math.round(v*100), fmt(hoy()), "manual");
});
document.getElementById("conteo").addEventListener("click", function(e){
  const b = e.target.closest("button");
  if(!b) return;
  nCargas = +b.dataset.n;
  marcarCargas();
  calcular();
});
document.getElementById("abrirVerif").addEventListener("click", function(){
  const panel = document.getElementById("panelVerif");
  const abierto = !panel.hidden;
  panel.hidden = abierto;
  this.classList.toggle("open", !abierto);
  if(!abierto && !document.querySelector("#hijos .fila")) filaHijo();
});
document.getElementById("masHijo").addEventListener("click", filaHijo);
document.getElementById("tbody").addEventListener("click", function(e){
  const tr = e.target.closest("tr");
  if(!tr || !tr.dataset.plan || tr.classList.contains("veta")) return;
  planElegido = tr.dataset.plan;
  calcular();
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
try{
  chrome.storage.local.get("uf", function(r){
    if(r && r.uf){ cacheUF = r.uf; if(UF===null) pintarUF(r.uf.c, r.uf.f, "guardado"); }
    cargarUF();
  });
}catch(e){ cargarUF(); }
calcular();
