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

const REGLAS = {
  titular: {min:{a:18,d:0,  txt:"18 años"},        ing:{a:69,d:364, txt:"69 años y 364 días"}, per:{a:70,d:364, txt:"70 años y 364 días"}},
  conyuge: {min:{a:18,d:0,  txt:"18 años"},        ing:{a:69,d:364, txt:"69 años y 364 días"}, per:{a:70,d:364, txt:"70 años y 364 días"}},
  hijo:    {min:{a:0, d:14, txt:"14 días"},        ing:{a:23,d:0,   txt:"23 años y 0 días"},   per:{a:24,d:0,   txt:"24 años y 0 días"}}
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

/* ---------- cargas ---------- */
let nCargas = 0;
function pintarCargas(){
  const cont = document.getElementById("cargas");
  const previo = [].map.call(cont.querySelectorAll(".fila"), function(f){
    return {f:f.querySelector("input").value, p:f.querySelector("select").value};
  });
  cont.innerHTML = "";
  for(let i=0; i<nCargas; i++){
    const div = document.createElement("div");
    div.className = "fila";
    div.innerHTML =
      '<select class="par"><option value="hijo">Hijo</option><option value="conyuge">Cónyuge</option></select>'+
      '<input type="text" class="fecha" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">'+
      '<span class="chip">—</span>';
    if(previo[i]){ div.querySelector("input").value = previo[i].f; div.querySelector("select").value = previo[i].p; }
    div.querySelector("input").addEventListener("input", function(){ autoFecha(this); calcular(); });
    div.querySelector("select").addEventListener("change", calcular);
    cont.appendChild(div);
  }
}

/* ---------- cálculo ---------- */
let ultimaCotizacion = "";
function calcular(){
  const ref = hoy();
  const problemas = [];

  // Titular
  const inTit = document.getElementById("fTit");
  const chipTit = document.getElementById("chipTit");
  const nacTit = leerFecha(inTit.value);
  inTit.classList.toggle("mal", inTit.value.length===10 && !nacTit);
  if(!nacTit){
    chipTit.className = "chip";
    chipTit.textContent = !inTit.value ? "—" : (inTit.value.length===10 ? "fecha inválida" : "fecha incompleta");
  }else{
    const ev = evaluar(nacTit, ref, "titular");
    chipTit.className = "chip " + (ev.estado==="ok" ? "ok" : "bad");
    chipTit.textContent = edadTxt(nacTit, ref) + (ev.estado==="ok" ? " · apto" : " · NO apto");
    if(ev.estado!=="ok") problemas.push("Titular "+ev.motivo+".");
  }

  // Cargas
  let menores = 0;
  [].forEach.call(document.querySelectorAll("#cargas .fila"), function(f, i){
    const inp = f.querySelector("input"), chip = f.querySelector(".chip");
    const tipo = f.querySelector("select").value;
    const nac = leerFecha(inp.value);
    inp.classList.toggle("mal", inp.value.length===10 && !nac);
    if(!nac){
      chip.className = "chip";
      chip.textContent = !inp.value ? "—" : (inp.value.length===10 ? "fecha inválida" : "fecha incompleta");
      return;
    }
    const ev = evaluar(nac, ref, tipo);
    if(ev.menor14 && tipo==="hijo") menores++;
    if(ev.estado!=="ok"){
      chip.className = "chip bad"; chip.textContent = edadTxt(nac,ref)+" · NO apto";
      problemas.push("Carga "+(i+1)+" "+ev.motivo+".");
    }else if(ev.menor14 && tipo==="hijo"){
      chip.className = "chip warn"; chip.textContent = edadTxt(nac,ref)+" · menor de 14";
    }else{
      chip.className = "chip ok"; chip.textContent = edadTxt(nac,ref)+" · apto";
    }
  });

  // Plan que corresponde
  const obliga = menores > 0;
  const idPlan = obliga ? "ninos" : "full";
  const plan   = PLANES.filter(function(p){ return p.id===idPlan; })[0];
  const cent   = plan.precios[nCargas];

  // Aviso
  const av = document.getElementById("aviso");
  if(problemas.length){
    av.className = "aviso bad"; av.textContent = problemas.join(" ");
  }else if(obliga && cent!==null){
    av.className = "aviso bad";
    av.textContent = "Hay "+menores+" menor"+(menores===1?"":"es")+" de 14: obligatorio Plan 4 Full Niños.";
  }else if(obliga && cent===null){
    av.className = "aviso warn";
    av.textContent = "El Plan 4 Full Niños no se vende con titular solo.";
  }else{
    av.className = "aviso"; av.textContent = "";
  }

  // Tabla
  document.getElementById("tbody").innerHTML = PLANES.map(function(p){
    const c = p.precios[nCargas];
    if(c === null) return '<tr><td class="off">'+p.nom+'</td><td class="n off">—</td><td class="n off">no aplica</td></tr>';
    const v = UF ? pesos(UF, c) : null;
    const hit = (p.id===idPlan);
    return '<tr class="'+(hit?"hit":"")+'"><td>'+p.nom+'</td><td class="n">'+ufTxt(c)+
           '</td><td class="n">'+(v ? v.redondo : "—")+"</td></tr>";
  }).join("");

  // Total
  const v = (UF && cent!==null) ? pesos(UF, cent) : null;
  const compos = ["titular solo","titular + 1","titular + 2","titular + 3"][nCargas];
  document.getElementById("tUF").textContent  = cent===null ? "—" : ufTxt(cent)+" UF";
  document.getElementById("tCLP").textContent = v ? v.redondo : "";
  document.getElementById("exacto").textContent = v
    ? ufTxt(cent)+" × $"+ufTxt(UF)+" = "+v.exacto
    : (UF ? "" : "sin valor UF");

  ultimaCotizacion = v
    ? plan.nom+" · "+compos+" · "+ufTxt(cent)+" UF · "+v.redondo+" mensual (UF de hoy $"+ufTxt(UF)+")"
    : "";
}

/* ---------- eventos ---------- */
document.getElementById("fTit").addEventListener("input", function(){ autoFecha(this); calcular(); });
document.getElementById("ufReload").addEventListener("click", cargarUF);
document.getElementById("ufManual").addEventListener("input", function(){
  const v = parseFloat(this.value.replace(/\./g,"").replace(",","."));
  if(v > 0) pintarUF(Math.round(v*100), fmt(hoy()), "manual");
});
document.getElementById("conteo").addEventListener("click", function(e){
  const b = e.target.closest("button");
  if(!b) return;
  nCargas = +b.dataset.n;
  [].forEach.call(this.querySelectorAll("button"), function(x){ x.classList.toggle("on", x===b); });
  pintarCargas();
  calcular();
  const primera = document.querySelector("#cargas input");
  if(primera && !primera.value) primera.focus();
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
