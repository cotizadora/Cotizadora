/* =========================================================
   Cotizador Dental Bci — popup
   Tarifas: Script Bci Dental Full, septiembre 2026.
   Valores en centésimas de UF (enteros) para que la
   conversión a pesos no arrastre errores de coma flotante.
   El índice del arreglo es la cantidad de cargas (0 a 3).
   ========================================================= */
const PLANES = [
  {id:"basico", nom:"Plan Urgencias",    precios:[26, 33, 39, 46]},
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
/* Abierta como página web (no como extensión) no hay chrome.storage ni se
   puede consultar otro sitio, así que la UF se escribe a mano. */
const ESWEB = (typeof chrome === "undefined" || !chrome.storage);

async function cargarUF(){
  if(ESWEB){
    document.getElementById("ufManualBox").style.display = "flex";
    const c = leerGuardado();
    if(c) pintarUF(c.c, c.f, "escrita a mano");
    else  document.getElementById("ufFecha").textContent = "escríbela aquí abajo";
    avisarUFVieja();
    return;
  }
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

function avisarUFVieja(){
  const el = document.getElementById("ufVieja");
  if(!el) return;
  const c = leerGuardado();
  const vieja = UF !== null && c && c.f && c.f !== fmt(hoy());
  el.hidden = !vieja;
  if(vieja) el.textContent = "Ese valor es del " + c.f + ". Actualízalo con la UF de hoy.";
}
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

let restaurando = false;

function guardarEstado(){
  if(restaurando) return;
  const cargas = [].map.call(document.querySelectorAll("#hijos .fila"), function(f){
    return { edad: f.querySelector(".edad").value, fecha: f.querySelector(".fecha").value };
  });
  const comuna = document.getElementById("comuna").value;
  const hayAlgo = nCargas > 0 || envio !== "linea" || planElegido !== PLAN_POR_DEFECTO || guionAbierto ||
                  !document.getElementById("panelClin").hidden || comuna !== "";
  if(!hayAlgo){ almacen.borrar("estado"); pintarGuardado(null); return; }
  const estado = {
    n: nCargas,
    plan: planElegido,
    guion: guionAbierto,
    pasos: pasos,
    clinAbierto: !document.getElementById("panelClin").hidden,
    comuna: comuna,
    envio: envio,
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
    ". Se mantiene durante la llamada; tras 45 min sin cambios vuelve a cero.";
}

/* Lo guardado es de la llamada en curso. Si pasaron 45 minutos sin cambios,
   es de un cliente anterior: se descarta y se parte en Plan Urgencias, sin
   cargas y póliza en línea. */
const VIGENCIA_LLAMADA = 45 * 60 * 1000;

function restaurarEstado(cb){
  almacen.leer("estado", function(e){
    if(e && (!e.cuando || Date.now() - e.cuando > VIGENCIA_LLAMADA)){ almacen.borrar("estado"); e = null; }
    if(!e){ pintarBloqueCargas(); if(cb) cb(); return; }
    restaurando = true;
    nCargas = Math.max(0, Math.min(MAX_CARGAS, e.n || 0));
    planElegido = e.plan || PLAN_POR_DEFECTO;
    guionAbierto = !!e.guion;
    if(e.pasos) pasos = Object.assign({basico: 0, full: 0, ninos: 0}, e.pasos);
    envio = e.envio || "linea";
    marcarEnvio();

    // Una fila por carga, con lo que se había escrito
    const cont = document.getElementById("hijos");
    cont.innerHTML = "";
    for(let k = 0; k < nCargas; k++){
      const caja = filaHijo(true);
      const c = (e.cargas || [])[k] || {};
      caja.querySelector(".edad").value  = c.edad  || "";
      caja.querySelector(".fecha").value = c.fecha || "";
    }
    pintarBloqueCargas();

    if(e.clinAbierto){
      document.getElementById("panelClin").hidden = false;
      document.getElementById("abrirClin").classList.add("open");
    }
    document.getElementById("comuna").value = e.comuna || "";
    restaurando = false;
    pintarGuardado(e);
    calcular();
    if(e.comuna && norm(e.comuna).length >= 3) buscarComuna(e.comuna);
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
            texto:"Sólo Plan 4 Full Niños. No entra en Urgencias ni en Full.", menor14:true, bloquea:false};
  return {clase:"si", chip:"ok", corto:e+" · califica",
          texto:"Entra en Urgencias, en Full y en Full Niños.", menor14:false, bloquea:false};
}

function veredictoPorEdad(a){
  if(a < 0 || a > 120) return null;
  if(a === 0)
    return {clase:"pide", chip:"warn", corto:"menos de 1 año",
            texto:"Escribe la fecha de nacimiento: la edad mínima de ingreso son 14 días.",
            menor14:true, bloquea:false, aprox:true};
  if(a < 14)
    return {clase:"no", chip:"warn", corto:a+" años · menor de 14",
            texto:"Sólo Plan 4 Full Niños. No entra en Urgencias ni en Full.",
            menor14:true, bloquea:false, aprox:true};
  if(a < 23)
    return {clase:"si", chip:"ok", corto:a+" años · califica",
            texto:"Entra en Urgencias, en Full y en Full Niños.",
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
      '<span class="edadbox">'+
        '<input type="text" class="edad" inputmode="numeric" placeholder="edad" maxlength="3">'+
        '<span class="spin">'+
          '<button type="button" class="up" tabindex="-1" title="Subir un año">&#9650;</button>'+
          '<button type="button" class="down" tabindex="-1" title="Bajar un año">&#9660;</button>'+
        '</span>'+
      '</span>'+
      '<span class="sep">o</span>'+
      '<input type="text" class="fecha" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10">'+
      '<span class="chip">—</span>'+
    '</div>'+
    '<div class="veredicto n"></div>';
  cont.appendChild(caja);
  const ed = caja.querySelector(".edad"), fe = caja.querySelector(".fecha");

  // Flechas: suben y bajan de a un año, entre 0 y 99
  function mover(paso){
    if(ed.readOnly) return;
    const actual = ed.value === "" ? (paso > 0 ? -1 : 1) : parseInt(ed.value, 10);
    const nuevo = Math.max(0, Math.min(99, (isNaN(actual) ? 0 : actual) + paso));
    ed.value = String(nuevo);
    calcular(); guardarEstado();
  }
  caja.querySelector(".up").addEventListener("click", function(){ mover(1); });
  caja.querySelector(".down").addEventListener("click", function(){ mover(-1); });
  // Y con las flechas del teclado, que es aún más rápido
  ed.addEventListener("keydown", function(e){
    if(e.key === "ArrowUp"){ e.preventDefault(); mover(1); }
    else if(e.key === "ArrowDown"){ e.preventDefault(); mover(-1); }
  });
  ed.addEventListener("input", function(){
    this.value = this.value.replace(/\D/g,"").slice(0,3);
    calcular(); guardarEstado();
  });
  fe.addEventListener("input", function(){ autoFecha(this); calcular(); guardarEstado(); });
  if(!silencioso){ ed.focus(); calcular(); guardarEstado(); }
  return caja;
}

/* La casilla "tiene cargas" es la que habilita todo lo de las cargas.
   Sin marcarla se cotiza al titular solo. Marcada, hay una fila de edad
   por cada carga: 1 carga, 1 fila. */
function sincronizarFilas(){
  const cont = document.getElementById("hijos");
  while(cont.children.length < nCargas) filaHijo(true);
  while(cont.children.length > nCargas) cont.removeChild(cont.lastElementChild);
}

function pintarBloqueCargas(){
  document.getElementById("tieneCargas").checked = nCargas > 0;
  document.getElementById("bloqueCargas").hidden = nCargas === 0;
  marcarCargas();
  sincronizarFilas();
}

/* ---------- cálculo ---------- */
let ultimaCotizacion = "";
/* Por defecto se cotiza el Plan Urgencias. Sin menores, el cliente puede
   subir a Full. Con un menor de 14, el Plan 4 queda forzado. */
const PLAN_POR_DEFECTO = "basico";
let planElegido = PLAN_POR_DEFECTO;
/* true cuando el Plan 4 lo impuso un menor, no el ejecutivo. Si el menor
   desaparece (se corrige la edad, se quita la carga), se vuelve solo al plan
   por defecto en vez de dejar cotizando el plan más caro sin razón. */
let planForzado = false;

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



  // Plan. Con cero cargas no se incorpora a nadie, asi que un menor escrito
  // en el verificador no puede obligar al Plan 4: todavia no entra al grupo.
  const obliga = menores > 0 && nCargas > 0;
  if(obliga){
    planElegido = "ninos";
    planForzado = true;
  }else if(planForzado){
    planElegido = PLAN_POR_DEFECTO;     // se acabó la obligación: no dejar el caro puesto
    planForzado = false;
  }
  if(PLANES.filter(function(p){ return p.id===planElegido; })[0].precios[nCargas] === null && !obliga){
    planElegido = PLAN_POR_DEFECTO;
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
            " en Urgencias ni en Full. Obligatorio Plan 4 Full Niños.";
    if(UF && alt!==null && cent!==null) texto += " Son "+pesos(UF, cent-alt).redondo+" más al mes que Urgencias.";
  }else if(evaluados > 0){
    clase = "aviso ok";
    texto = (evaluados===1 ? "La carga califica" : "Las "+evaluados+" cargas califican")+
            ": el cliente puede quedarse en Urgencias o subir a Full.";
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
    const flecha = (guionAbierto && p.id===planElegido) ? '<span class="flecha">&#9656;</span>' : '';
    const nombre = veta
      ? p.nom + ' <small>(no admite menores)</small>'
      : '<button type="button" class="nomplan" data-nombre="'+p.id+'">'+p.nom+flecha+'</button>';
    return '<tr class="'+cls+'" data-plan="'+p.id+'"><td>'+nombre+
           '</td><td class="n">'+ufTxt(c)+'</td><td class="n">'+(v ? v.redondo : "—")+"</td></tr>";
  }).join("");

  // Total
  const v = (UF && cent!==null) ? pesos(UF, cent) : null;
  const compos = ["titular solo","titular + 1","titular + 2","titular + 3"][nCargas];
  document.getElementById("tUF").textContent  = cent===null ? "—" : ufTxt(cent)+" UF";
  document.getElementById("tCLP").textContent = v ? v.redondo : "";
  document.getElementById("exacto").textContent = v ? ufTxt(cent)+" × $"+ufTxt(UF)+" = "+v.exacto
                                                    : (UF ? "" : "sin valor UF");
  // Resumen permanente arriba: siempre a la vista, cambie lo que cambie
  document.getElementById("resPlan").textContent   = plan.nom;
  document.getElementById("resCompos").textContent = compos;
  document.getElementById("resUF").textContent     = cent===null ? "—" : ufTxt(cent)+" UF";
  document.getElementById("resCLP").textContent    = v ? v.redondo : "—";

  ultimaCotizacion = v
    ? plan.nom+" · "+compos+" · "+ufTxt(cent)+" UF · "+v.redondo+" mensual (UF de hoy $"+ufTxt(UF)+")"
    : "";

  if(typeof pintarGuion === "function") pintarGuion();
}

function marcarEnvio(){
  [].forEach.call(document.querySelectorAll("#envio button"), function(b){
    b.classList.toggle("on", b.dataset.envio === envio);
  });
  document.getElementById("envioPista").textContent = (envio === "linea")
    ? "Tiene cuenta Bci: se carga la prima a su cuenta corriente."
    : "Sin cuenta Bci: se le envía el link de pago, con 48 horas de vigencia.";
}

function marcarCargas(){
  [].forEach.call(document.querySelectorAll("#conteo button"), function(b){
    b.classList.toggle("on", +b.dataset.n === nCargas);
  });
}

/* ============================================================
   GUION DE VENTA
   Tomado del Script Bci Dental Full de septiembre 2026. Cada
   seccion declara en que planes se lee, y los montos se
   calculan en vivo con la UF del dia, para no leer cifras
   congeladas al cliente.
   ============================================================ */
const GUION = [
  /* Texto del Script Bci Dental Full de septiembre 2026, en su orden, con
     sólo las faltas de tipeo corregidas. Cada <p> y cada <li> es una frase
     de la lectura guiada. Lo que va en <p class="nota"> es instrucción para
     el ejecutivo: no se lee al cliente y la lectura guiada lo salta. */
  {t:"Apertura", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Muy buenos días / tardes, usted habla con <em>[su nombre]</em>, lo llamo por ser cliente Bci.</p>'+
    '<p>¿Cómo está?</p>'+
    '<p class="nota">Empatizar.</p>'+
    '<p>El motivo de mi llamado es para entregarle una información importante, son buenas noticias, no le quitaré mucho tiempo.</p>'+
    '<p>Primero que todo, queremos agradecer su permanencia como cliente y contarle que Bci pone a su disposición el día de hoy '+
    'una completa cobertura dental que le cubrirá hasta el 100% en los tratamientos dentales más frecuentes.</p>'+
    '<p>Y lo mejor es que la atención es exclusiva en la red de clínicas <strong>Uno Salud Dental</strong>, '+
    'que son más de 80 clínicas a lo largo de todo Chile.</p>'; }},

  {t:"Urgencias dentales", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Tendrá los siguientes tratamientos de <strong>urgencias dentales, sin costo (a costo 0)</strong>, '+
    'en caso de dolor, inflamación y sangrado, por ejemplo:</p>'+
    '<ul>'+
      '<li>Extracciones simples</li>'+
      '<li>Trepanación, que es la primera parte del tratamiento de conducto (entre otros)</li>'+
      '<li>Colocación de cemento o tapadura temporal</li>'+
      '<li>Urgencia protésica: recementación de corona, puentes, incrustaciones y reparación en el sillón de otro tipo de prótesis</li>'+
    '</ul>'; }},

  {t:"Prevención", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Lo mejor es que además le cubrimos tratamientos de prevención como:</p>'+
    '<ul>'+
      '<li>Evaluación y diagnóstico</li>'+
      '<li>Radiografías pieza a pieza</li>'+
      '<li>Extracciones simples</li>'+
      '<li>Una limpieza profunda (profilaxis + remoción de cálculos supragingivales), para remover la placa bacteriana '+
          'y el sarro acumulados entre los dientes</li>'+
    '</ul>'+
    '<p>Los odontólogos, don <em>[nombre]</em>, recomiendan realizar una limpieza al menos 1 vez al año, y usted la tendría '+
    'sin costo con nosotros dentro de 30 días, al igual que el resto de los tratamientos.</p>'+
    '<p>Y en el caso de urgencia dental, usted puede comenzar a utilizarlo en <strong>48 horas hábiles</strong>.</p>'; }},

  {t:"Tratamientos con copago · sólo Full y Full + Niños", p:["full","ninos"], html:function(d){ return ''+
    '<p>Importante indicar, don <em>[nombre]</em>, que para los tratamientos más complejos y que suelen ser los más costosos '+
    'en forma particular, usted también podrá acceder a ellos dentro de 30 días, a través de copagos claros y fijos antes '+
    'de su realización. Se los detallo:</p>'+
    '<ul>'+
      '<li><strong>5 tapaduras en resina por año</strong> con un costo de $12.000 cada una '+
          '($45.000 es el valor actual en otras clínicas)</li>'+
      '<li><strong>2 tratamientos de conducto</strong> en muelas, premolares o dientes anteriores al año, con un costo de '+
          '$12.000 cada uno ($150.000 a $300.000 aprox. es el valor referencial en otras clínicas)</li>'+
    '</ul>'+
    '<p>Contará además con <strong>hasta un 65% de descuento</strong> en precio promedio de mercado para los siguientes '+
    'tratamientos más frecuentes de odontología general:</p>'+
    '<ul>'+
      '<li>Extracciones de las muelas del juicio</li>'+
      '<li>Planos de relajación para el bruxismo</li>'+
      '<li>Cambio de tapadura de amalgama a resina (cambio estético)</li>'+
      '<li>Tapaduras de resina adicionales</li>'+
      '<li>Tratamientos de conducto adicionales</li>'+
    '</ul>'; }},

  {t:"Programa de Salud y Bienestar", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Y de manera adicional le quiero contar que con este seguro podrá acceder sin costo al '+
    '<strong>Programa de Salud y Bienestar de Bci</strong>, el cual cuenta con 13 programas de salud, tales como:</p>'+
    '<ul>'+
      '<li>Telemedicina</li><li>Salud mental</li><li>Nutrición</li><li>Kinesiología</li><li>Fonoaudiología</li>'+
      '<li>Entre otras</li>'+
    '</ul>'+
    '<p>Sin costo adicional, de uso ilimitado, con atención multicanal y profesionales de la salud altamente calificados.</p>'+
    '<p>Para acceder debe descargar la aplicación de <strong>Care Assistance</strong> y seguir las instrucciones que recibirá '+
    'en el correo de bienvenida.</p>'; }},

  {t:"Muerte accidental", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Bueno, finalmente y complementando las asistencias indicadas, don <em>[nombre]</em>, existe una protección frente a '+
    'accidentes personales que usted pueda sufrir y terminen en fallecimiento (sólo titular), entregando una indemnización '+
    'a sus herederos legales de <span class="dato">50 UF</span>' + (d.ap ? ', <span class="dato">' + d.ap + '</span> aprox' : '') + '.</p>'+
    '<p>Dinero de libre disposición.</p>'+
    '<p>Es una cobertura full y completa, ¿verdad?</p>'; }},

  {t:"Sin reembolsos", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Lo mejor es que no trabajamos con reembolso, así que puede olvidarse de comprar bonos y los papeleos.</p>'+
    '<p>Es muy simple: usted agenda la primera hora llamando al <strong>227501096</strong>, en cualquiera de las clínicas '+
    'de la red Uno Salud, en donde le aplicarán todos los descuentos y valores que le he mencionado automáticamente '+
    'en su presupuesto.</p>'; }},

  {t:"Requisitos", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Usted, don <em>[nombre]</em>, cumple con los requisitos ya que es mayor de 18 años y menor de 70 años.</p>'+
    '<p>Y la permanencia máxima es hasta un día antes de cumplir los 71 años.</p>'+
    (d.cargas > 0
      ? '<p>Don <em>[nombre]</em>, además usted puede incorporar adicionales (cónyuge e hijos).</p>'+
        '<p>La edad mínima de ingreso de sus hijos es de <strong>14 días</strong> y la permanencia es hasta los '+
        '<strong>24 años 0 días</strong>.</p>'+
        '<p>Y sus adicionales contarían con la cobertura de asistencia dental y los 10 programas.</p>'+
        '<p class="nota">Así dice el script: "10 programas" aquí y "13 programas" más arriba.</p>'
      : ''); }},

  {t:"Si no quiere el Full · Plan Urgencia + prevención", p:["full"], clase:"ojo", html:function(d){ return ''+
    '<p class="nota">Sólo si el cliente se niega a tomar el Plan Full.</p>'+
    '<p>Como no queremos que se quede sin cobertura y lo tome por sorpresa un dolor en sus dientes, ofrecemos por sólo '+
    '<span class="dato">' + (d.clpBasico || '—') + '</span> aproximadamente mensuales, es decir, '+
    '<span class="dato">UF ' + (d.ufBasico || '—') + '</span>, todas las urgencias dentales que ya le mencioné más '+
    'tratamientos de prevención.</p>'; }},

  {t:"Plan niños", p:["ninos"], clase:"clave", html:function(d){ return ''+
    '<p>Además, don <em>[nombre]</em>, en caso de tener niños menores de 14 años, le entregamos '+
    '<strong>11 procedimientos asociados a dientes temporales</strong> adicionales, a costo cero y sin tope, '+
    'las que podrá utilizar dentro de 30 días.</p>'+
    '<p class="nota">Hay un menor de 14 en el grupo: no corresponde ofrecer Urgencias ni Full.</p>'; }},

  {t:"El precio", p:["basico","full","ninos"], clase:"clave", html:function(d){ return ''+
    '<p>Lo más importante, don <em>[nombre]</em>, es que todas las coberturas, asistencias y beneficios mencionados tienen '+
    'un costo de <span class="dato">UF ' + d.uf + '</span> fijas, que son <span class="dato">' + d.clp + '</span> aprox.</p>'+
    '<p>Serán cargados automáticamente en su cuenta Bci terminada en los dígitos <em>[XXX]</em>, recién en su próximo '+
    'estado de cuenta.</p>'+
    '<p class="nota">' + d.plan + ' · ' + d.compos + ' · calculado con la UF de hoy, $' + d.ufdia + '.</p>'+
    '<p>Además, don <em>[nombre]</em>, este mes nos encontramos con una promoción especial, donde la compañía durante este '+
    'mes le otorgará <em>[X]</em> cuota sin costo para usted en el primer año de vigencia.</p>'+
    '<p>¿Qué fecha de cargo le acomoda?</p>'+
    '<p>¿Lo incorporo, verdad?</p>' +
    (d.plan === "Plan Urgencias"
      ? '<p class="nota">Para ofrecer más cobertura, elige el Plan 3 Full: su script agrega los tratamientos con copago.</p>' : ''); }},

  {t:"Opcional · sólo como argumento", p:["basico","full","ninos"], clase:"ojo", html:function(d){ return ''+
    '<p class="nota">Opcional. Úsalo sólo como argumento.</p>'+
    '<p>Le otorgaremos además 3 meses gratuitos del seguro de sala de urgencia, con el que tendrá una cobertura de '+
    '500 UF en caso de muerte accidental para sus herederos legales ($20.500.000 aprox.) y a su vez 9 UF ($370.000) '+
    'para cubrir los gastos de atención inicial de una urgencia médica por accidentes de manera ilimitada y hasta 3 veces '+
    'por enfermedad.</p>'; }},

  {t:"Compañía", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Don <em>[nombre]</em>, estas coberturas son otorgadas por Bci Seguros Vida en conjunto con Bci Corredores de Seguros.</p>'; }},

  {t:"Validación de datos", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Entonces, para cumplir con la normativa y poder realizar el correcto envío de su póliza, le voy a solicitar que me '+
    'corrobore si los datos que tengo en pantalla están vigentes y correctos.</p>'+
    '<ul>'+
      '<li>Fecha de nacimiento</li>'+
      '<li>Domicilio completo</li>'+
      '<li>Teléfono de contacto</li>'+
      '<li>Correo electrónico <span class="nota">(fundamental para enviar la póliza vía email)</span></li>'+
      '<li>Nombre completo del titular <span class="nota">(en negación, 50/50)</span></li>'+
      '<li>RUT <span class="nota">(en negación, 50/50)</span></li>'+
    '</ul>'+
    (d.cargas > 0
      ? '<p class="nota">De cada asegurado adicional, obligatorio: nombre completo, RUT, fecha de nacimiento y parentesco.</p>'
      : ''); }},

  {t:"Grabación", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Antes de continuar le informo que, para su tranquilidad y respaldo, esta conversación está siendo grabada.</p>'; }},

  {t:"Exclusiones del seguro", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Estas son algunas de las principales exclusiones de esta póliza. No se cubrirá en caso de que el origen o '+
    'consecuencia de los daños sean por:</p>'+
    '<ul>'+
      '<li>Guerra, peleas, riñas, actos delictivos</li>'+
      '<li>Suicidio o intento de suicidio</li>'+
      '<li>Intoxicación o encontrarse bajo el efecto de cualquier narcótico o droga</li>'+
      '<li>Conducción en estado de ebriedad</li>'+
      '<li>Negligencia o imprudencia</li>'+
      '<li>Prestación de servicios en las fuerzas armadas o funciones policiales</li>'+
      '<li>Movimientos sísmicos desde el grado 8 inclusive en la escala de Mercalli</li>'+
      '<li>Viaje o vuelo en vehículo aéreo de itinerario no regular</li>'+
    '</ul>'+
    '<p>En relación con el Programa Dental, se excluyen:</p>'+
    '<ul>'+
      '<li>Las cirugías de alta complejidad</li>'+
      '<li>Cirugías para implantes que se realicen fuera de la red Uno Salud</li>'+
      '<li>Costos de laboratorio y medicación</li>'+
    '</ul>'; }},

  {t:"Pregunta de contratación · textual", p:["basico","full","ninos"], clase:"clave", html:function(d){ return ''+
    '<p>Sr.(a) <em>[apellido]</em>, entonces con fecha <em>[DD/MM/AA]</em>, ¿acepta la contratación en forma voluntaria del '+
    '<strong>Seguro Dental Modular Bci</strong> con las coberturas detalladas anteriormente, con un valor mensual de '+
    '<span class="dato">UF ' + d.uf + '</span> fijas, <span class="dato">' + d.clp + '</span> aprox., IVA incluido? ¿Acepta?</p>'+
    '<p class="nota">La respuesta puede ser sí, acepto o de acuerdo. No se acepta ok, ya, correcto, etc.</p>'; }},

  {t:"Medio de pago · póliza en línea", p:["basico","full","ninos"], envio:"linea", clase:"clave", html:function(d){ return ''+
    '<p>Sr./Sra. <em>[apellido]</em>, usted ¿autoriza el cargo de la prima mensual del seguro, el que será descontado de su '+
    'cuenta corriente <em>[N.º medio de pago]</em> del banco Bci? ¿Acepta?</p>'+
    '<p class="nota">Esperar respuesta.</p>'; }},

  {t:"Medio de pago · link de pago", p:["basico","full","ninos"], envio:"link", clase:"clave", html:function(d){ return ''+
    '<p class="nota">Pago débito: cobro inmediato. Pago crédito: próximo ciclo de facturación.</p>'+
    '<p>Sr./Sra. <em>[apellido]</em>, en este momento le llegará a su correo electrónico un correo con el asunto '+
    '<strong>“Multicotizador – Pago de primera cuota”</strong>, donde encontrará el link de pago (en naranjo: '+
    '<strong>“Pagar aquí”</strong>).</p>'+
    '<p>¿Autoriza el cargo de la prima mensual del Seguro Dental, el que será descontado en la forma de pago que usted '+
    'seleccione cuando ingrese al link enviado a su correo? ¿Acepta?</p>'+
    '<p class="nota">Esperar respuesta.</p>'+
    '<p>Si no puede realizar el pago en este momento, le comento que este link tiene una vigencia de <strong>48 horas</strong>.</p>'+
    '<p>Mientras no realice el pago, este seguro no está vigente y no puede hacer uso de las asistencias y las coberturas.</p>'; }},

  {t:"Después del pago", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Lo invitamos a siempre estar al día en el pago de su prima mensual, para así poder utilizar su cobertura cuando la necesite.</p>'+
    '<p>Haremos llegar a su correo electrónico dentro de unos minutos (cuando registre su medio de pago) su póliza de seguro '+
    'y todas las comunicaciones relativas a esta.</p>'; }},

  {t:"Cierre normativo", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Las condiciones generales de su póliza están registradas en la CMF bajo el código <strong>POL 3 2013 0085 Alt. A</strong> '+
    'para muerte accidental y <strong>POL 3 2019 0055</strong> para la cobertura dental.</p>'+
    '<p>Don/Sra. <em>[nombre y apellido]</em>, le comento que la compañía Bci Seguros Vida y Bci Corredores de Seguros '+
    'tratarán sus datos para evaluar y mejorar sus servicios por medio de análisis de datos y estudios analíticos, '+
    'resolver consultas, publicidad y realizar gestiones propias de sus negocios.</p>'+
    '<p>¿Autoriza el tratamiento de los mismos?</p>'+
    '<p>Don/Sra., el código de operación asociado a esta venta es <em>[RUT del cliente o ID de venta]</em>.</p>'+
    '<p>Guárdelo para futuras consultas o modificaciones a la póliza.</p>'+
    '<p>La grabación de esta conversación constituye prueba de la información proporcionada y la aceptación de este contrato.</p>'+
    '<p>Le informo que la vigencia de su seguro comenzará a regir a contar de hoy <em>[DD/MM/AAAA]</em> y tendrá vigencia '+
    'anual y renovable automáticamente por periodos iguales y sucesivos de un año.</p>'+
    '<p>El asegurado podrá poner término unilateral al seguro en cualquier momento, sin expresión de causa, '+
    'comunicándolo al asegurador.</p>'+
    '<p>Le recuerdo que la contratación es de carácter voluntario y usted puede retractarse del seguro dentro del plazo '+
    'de diez días contado desde que reciba la póliza, sin expresión de causa ni cargo alguno, teniendo el derecho a la '+
    'devolución de la prima que hubiere pagado.</p>'+
    '<p>El seguro terminará en caso de no pago de prima, al cumplir la edad de permanencia y/o en caso de fallecimiento.</p>'+
    '<p>Las demás causales de término anticipado están señaladas en las respectivas POL.</p>'+
    '<p>Visítenos en el sitio web www.bci.cl/corredora-de-seguros/diversificacion-de-cartera</p>'+
    '<p>Desde ya le damos la más cordial bienvenida a Bci Corredores de Seguros y a Bci Seguros Vida S.A.</p>'+
    '<p>Revise su póliza una vez recibida y ante cualquier consulta, solicitud de grabación, entre otros, puede contactarnos '+
    'al Centro de Respuesta Inmediata al fono <strong>600 6000 292</strong>.</p>'+
    '<p>En caso de que el asegurado requiera los servicios de asistencia dental, deberá comunicarse al número telefónico '+
    '<strong>227501096</strong>.</p>'; }},

  {t:"Encuesta EPA", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Don/Srta. <em>[nombre]</em>, para finalizar lo derivaré a una pequeña encuesta de 2 preguntas para que califique '+
    'mi atención en esta llamada, ¿de acuerdo?</p>'+
    '<p>Que tenga buen día / tarde.</p>'+
    '<p class="nota">En el sistema: Transfer-Conf → ingroup ENCUESTA_EPA → CLOSER LOCAL, y tipificar. '+
    'Obligatoria salvo derivación a IVR por pago con tarjeta de crédito.</p>'; }}
];

let guionAbierto = false;   // se abre sólo al pinchar el nombre del plan
/* Por defecto se lee la opción de póliza en línea, porque el cliente tiene
   cuenta Bci. Si no la tiene, se le envía el link de pago. */
let envio = "linea";

function pintarGuion(){
  const app = document.getElementById("app");
  const yaAbierto = app.classList.contains("abierto");
  if(guionAbierto && !yaAbierto) abriendoHasta = Date.now() + 300;
  app.classList.toggle("abierto", guionAbierto);
  if(!guionAbierto) return;
  const caja = document.getElementById("guion");
  const scroll = caja.scrollTop;

  const plan = PLANES.filter(function(p){ return p.id===planElegido; })[0];
  const cent = plan.precios[nCargas];
  const basico = PLANES[0].precios[nCargas];
  const full   = PLANES[1].precios[nCargas];

  const d = {
    plan:   plan.nom,
    compos: ["titular solo","titular + 1 carga","titular + 2 cargas","titular + 3 cargas"][nCargas],
    cargas: nCargas,
    uf:     cent===null ? "—" : ufTxt(cent),
    clp:    (UF && cent!==null)   ? pesos(UF, cent).redondo   : "—",
    ufdia:  UF ? ufTxt(UF) : "—",
    ap:     UF ? pesos(UF, 5000).redondo : "",          // 50 UF de muerte accidental
    ufBasico:  basico!==null ? ufTxt(basico) : null,
    clpBasico: (UF && basico!==null) ? pesos(UF, basico).redondo : null,
    clpFull:   (UF && full!==null)   ? pesos(UF, full).redondo   : null
  };

  document.getElementById("guionTit").textContent = "Script · " + plan.nom;
  document.getElementById("guionSub").textContent =
    d.compos + " · " + d.uf + " UF · " + d.clp + " mensual";

  document.getElementById("guionCuerpo").innerHTML = GUION
    .filter(function(sec){
      if(sec.p.indexOf(planElegido) === -1) return false;
      if(sec.envio && sec.envio !== envio) return false;    // sólo la opción de pago que corresponde
      return true;
    })
    .map(function(sec){
      return '<div class="gs '+(sec.clase||"")+'"><h4>'+sec.t+"</h4>"+sec.html(d)+"</div>";
    }).join("");

  // Se redibuja con cada cambio (una edad, el envío): que no salte de lugar.
  // Al abrirlo, en cambio, se lleva a la frase donde se quedó.
  caja.scrollTop = scroll;
  marcarPasos(!yaAbierto);
}

/* ============================================================
   LECTURA GUIADA, LETRA Y CONTRASTE
   Cada frase del script es un paso. Las flechas ↑ ↓ avanzan y
   retroceden, la frase actual queda marcada y lo ya leído se
   atenúa. Se recuerda en qué frase quedó cada plan.
   La letra, el contraste y el modo guiado son preferencias del
   ejecutivo: no se borran con "Nuevo cliente".
   ============================================================ */
const prefs = {letra: 100, contraste: "normal", guiada: true, ancho: 760};
let pasos = {basico: 0, full: 0, ninos: 0};

function aplicarPrefs(){
  const g = document.getElementById("guion");
  g.style.setProperty("--gfs", (13 * prefs.letra / 100).toFixed(1) + "px");
  g.dataset.contraste = prefs.contraste;
  g.classList.toggle("guiada", prefs.guiada);
  document.getElementById("letraTam").textContent = prefs.letra + "%";
  document.getElementById("letraMenos").disabled = prefs.letra <= 80;
  document.getElementById("letraMas").disabled = prefs.letra >= 220;
  [].forEach.call(document.querySelectorAll("#contraste button"), function(b){
    b.classList.toggle("on", b.dataset.c === prefs.contraste);
  });
  document.getElementById("guiada").classList.toggle("on", prefs.guiada);
  document.getElementById("pasoAnt").disabled = !prefs.guiada;
  document.getElementById("pasoSig").disabled = !prefs.guiada;
  aplicarAncho();
  // La barra queda pegada bajo la cabecera, cuya altura cambia con la letra
  const cab = g.querySelector(".guion-cab");
  if(cab) g.style.setProperty("--gb-top", cab.offsetHeight + "px");
}
function guardarPrefs(){ almacen.escribir("prefs", prefs); }

/* ---------- ancho del script ----------
   La manija del borde derecho ensancha sólo la zona de lectura y el texto
   se reacomoda, hasta el borde de la ventana. */
const ANCHO_MIN = 300, ANCHO_NORMAL = 760, IZQ = 374;   // 360 de la cotización + 14 de la manija
function anchoMax(){
  return Math.max(ANCHO_MIN, window.innerWidth - IZQ - (ESWEB ? 40 : 6));
}
function anchoActual(){ return Math.max(ANCHO_MIN, Math.min(prefs.ancho || ANCHO_NORMAL, anchoMax())); }
function aplicarAncho(){
  document.documentElement.style.setProperty("--gw", anchoActual() + "px");
}
(function(){
  const tir = document.getElementById("tirador"), app = document.getElementById("app");
  let x0 = null, w0 = 0;
  tir.addEventListener("pointerdown", function(e){
    if(e.button !== 0) return;
    x0 = e.clientX; w0 = anchoActual();
    tir.setPointerCapture(e.pointerId);
    app.classList.add("arrastrando");
    e.preventDefault();
  });
  tir.addEventListener("pointermove", function(e){
    if(x0 === null) return;
    const quiere = w0 + (e.clientX - x0);
    prefs.ancho = Math.round(Math.max(ANCHO_MIN, Math.min(anchoMax(), quiere)));
    aplicarAncho();
  });
  function soltar(){
    if(x0 === null) return;
    x0 = null;
    app.classList.remove("arrastrando");
    guardarPrefs();
  }
  tir.addEventListener("pointerup", soltar);
  tir.addEventListener("pointercancel", soltar);
  tir.addEventListener("dblclick", function(){ prefs.ancho = ANCHO_NORMAL; aplicarAncho(); guardarPrefs(); });
  // Con teclado: ← y → de a 20 px
  tir.addEventListener("keydown", function(e){
    if(e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const quiere = anchoActual() + (e.key === "ArrowRight" ? 20 : -20);
    prefs.ancho = Math.max(ANCHO_MIN, Math.min(anchoMax(), quiere));
    aplicarAncho(); guardarPrefs();
    e.preventDefault();
  });
  window.addEventListener("resize", aplicarAncho);
})();


function frases(){
  return [].slice.call(document.querySelectorAll("#guionCuerpo .gs p:not(.nota), #guionCuerpo .gs li"));
}
function marcarPasos(llevar){
  const ps = frases();
  const n = ps.length;
  const i = n ? Math.max(0, Math.min(n - 1, pasos[planElegido] || 0)) : 0;
  pasos[planElegido] = i;
  ps.forEach(function(el, k){
    el.classList.add("paso");
    el.dataset.i = k;
    el.classList.toggle("actual", prefs.guiada && k === i);
    el.classList.toggle("leido", prefs.guiada && k < i);
  });
  document.getElementById("pasoNum").textContent = n ? (i + 1) + " / " + n : "—";
  if(llevar && prefs.guiada && ps[i]){
    // Recién abierto, el panel todavía se está desplegando (el texto está
    // más angosto y alto): se espera a que termine para ubicar la frase.
    const espera = Math.max(0, abriendoHasta - Date.now());
    setTimeout(function(){ llevarAlPaso(ps[i]); }, espera);
  }
}
let abriendoHasta = 0;
// Deja la frase a la vista, justo bajo la cabecera y la barra fijas
function llevarAlPaso(el){
  const g = document.getElementById("guion");
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(g.scrollHeight <= g.clientHeight + 2){   // la web: se desplaza la página
    el.scrollIntoView({block: "center", behavior: suave ? "smooth" : "auto"});
    return;
  }
  const tapa = g.querySelector(".guion-cab").offsetHeight + g.querySelector(".guion-barra").offsetHeight;
  const rg = g.getBoundingClientRect(), re = el.getBoundingClientRect();
  const libre = g.clientHeight - tapa;
  const margen = Math.max(10, Math.min((libre - re.height) / 3, 120));
  const destino = g.scrollTop + (re.top - rg.top) - tapa - margen;
  g.scrollTo({top: Math.max(0, destino), behavior: suave ? "smooth" : "auto"});
}
function moverPaso(delta){
  pasos[planElegido] = (pasos[planElegido] || 0) + delta;
  marcarPasos(true);
  guardarEstado();
}

/* ---------- búsqueda y resultados ---------- */
let busquedaId = 0, temporizador = null;

function alEscribirComuna(){
  clearTimeout(temporizador);
  const q = document.getElementById("comuna").value;
  if(norm(q).length < 3){ pintarSugerencias([], false); pintarResultados(null); return; }
  temporizador = setTimeout(function(){ buscarComuna(q); }, 380);
}

// Elige la comuna entre los candidatos. Sólo la da por elegida si no hay
// empate: con "las c" ofrece Las Cabras y Las Condes en vez de adivinar.
// Abreviaturas de uso común al escribir comunas
const ABREV = {pto: "puerto", pta: "punta", sta: "santa", sto: "santo", gral: "general", sn: "san",
               stgo: "santiago", valpo: "valparaiso", conce: "concepcion", vina: "vina del mar"};
function expandirAbrev(q){
  return norm(q).split(" ").map(function(w){ return ABREV[w] || w; }).join(" ");
}
function elegirComuna(q, candidatos){
  const q2 = expandirAbrev(q);
  function pt(n){
    const a = puntaje(q, n), b = q2 !== norm(q) ? puntaje(q2, n) : null;
    return a === null ? b : (b === null ? a : Math.min(a, b));
  }
  const cand = candidatos
    .map(function(x){ return {x: x, pt: pt(x.nombre)}; })
    .filter(function(c){ return c.pt !== null; })
    .sort(function(a, b){ return a.pt - b.pt || a.x.nombre.localeCompare(b.x.nombre, "es"); });
  const claro = cand.length && (cand.length === 1 || cand[0].pt < cand[1].pt || cand[0].pt === 0);
  return {comuna: claro ? cand[0].x : null, sugerencias: cand.slice(0, 5).map(function(c){ return c.x; })};
}

// Si algo falla, se dice en el panel en vez de quedar en silencio
let ultimaBusqueda = null;
async function buscarComuna(q, elegida){
  ultimaBusqueda = {q: q, elegida: elegida || null};
  try{ await buscarComunaAdentro(q, elegida); }
  catch(e){
    document.getElementById("clinRes").innerHTML =
      '<p class="clin-vacio">Algo falló al buscar: ' + esc(String(e && e.message || e)) +
      '. <button type="button" class="link-carga" data-diag="error">copiar diagnóstico</button></p>';
    diag.error = {mensaje: String(e && e.message || e), pila: String(e && e.stack || "").slice(0, 1500)};
  }
}
// Cuando el listado de i-dental termina de leerse en segundo plano, la
// búsqueda que está en pantalla se repite sola para mostrarlo.
try{
  chrome.storage.onChanged.addListener(function(cambios, zona){
    if(zona !== "local" || !(cambios.red_edental || cambios.ede_intento) || !ultimaBusqueda) return;
    if(document.getElementById("panelClin").hidden) return;
    if(norm(document.getElementById("comuna").value) !== norm(ultimaBusqueda.q) && !ultimaBusqueda.elegida) return;
    buscarComuna(ultimaBusqueda.q, ultimaBusqueda.elegida);
  });
}catch(e){}

async function buscarComunaAdentro(q, elegida){
  const id = ++busquedaId;
  pintarResultados({cargando: true, comuna: q});

  // 1. Con mapeo guardado, la respuesta es inmediata y no se consulta nada
  const m = await leerMapeo();
  if(id !== busquedaId) return;
  if(m){
    const r = elegida ? {comuna: m.comunas.find(function(c){ return norm(c.nombre) === norm(elegida.nombre); }), sugerencias: []}
                      : elegirComuna(q, m.comunas);
    mostrarEleccion(r);
    if(!r.comuna){ pintarResultados({sinElegir: true, comuna: q, nada: !r.sugerencias.length}); return; }
    const c = r.comuna;
    pintarResultados({
      comuna: c.nombre, mapeo: m,
      uno: {lista: c.uno, url: c.slug ? RED.unosalud.comuna(c.slug) : RED.unosalud.sitio, error: "", sinPagina: !c.uno.length},
      ede: {lista: c.ede, error: m.resumen.edeError, total: m.resumen.sucursalesEde}
    });
    return;
  }

  // 2. Sin mapeo: se lee en vivo. Las comunas candidatas son las de Uno Salud
  //    más las que aparecen en el listado de i-dental. Uno Salud no espera a
  //    i-dental: si i-dental aún no está guardado (la primera lectura tarda
  //    unos segundos), se muestra Uno Salud y i-dental llega después.
  const indice = await indiceUnoSalud();
  if(id !== busquedaId) return;
  let ede = await edentalGuardado();
  const pEde = ede ? null : clinicasEdental();
  const conocidas = indice.map(function(x){ return x.nombre; });
  function agrupar(){
    const porComuna = {};
    indice.forEach(function(x){ porComuna[norm(x.nombre)] = {nombre: x.nombre, slug: x.slug, ede: []}; });
    ((ede && ede.lista) || []).forEach(function(c){
      const u = ubicarClinica(c, conocidas);
      if(!u.comuna) return;
      const k = norm(u.comuna);
      if(!porComuna[k]) porComuna[k] = {nombre: u.comuna, slug: "", ede: []};
      porComuna[k].ede.push(Object.assign({}, c, u.porSeccion ? {porSeccion: true} : {}));
    });
    return porComuna;
  }
  function elegir(porComuna){
    const candidatos = Object.keys(porComuna).map(function(k){ return porComuna[k]; });
    if(elegida) return {comuna: porComuna[norm(elegida.nombre)] || {nombre: elegida.nombre, slug: elegida.slug, ede: []}, sugerencias: []};
    if(candidatos.length) return elegirComuna(q, candidatos);
    return {comuna: {nombre: q.trim(), slug: norm(q).replace(/\s+/g, "-"), ede: []}, sugerencias: []};  // sin nada leído
  }
  function edeDe(c){
    return {lista: c.ede, error: ede.error, total: (ede.lista || []).length, pendiente: !!ede.pendiente};
  }

  let r = elegir(agrupar());
  // La comuna puede tener sólo i-dental: sin calce en Uno Salud se espera el listado
  if(!r.comuna && pEde){
    pintarResultados({cargando: true, comuna: q, ede: true});
    ede = await pEde;
    if(id !== busquedaId) return;
    r = elegir(agrupar());
  }
  mostrarEleccion(r);
  if(!r.comuna){ pintarResultados({sinElegir: true, comuna: q, nada: !r.sugerencias.length}); return; }

  const c = r.comuna;
  const uno = c.slug ? await clinicasUnoSalud(c) : {lista: [], url: RED.unosalud.sitio, error: "", sinPagina: true};
  if(id !== busquedaId) return;
  pintarResultados({comuna: c.nombre, uno: uno, ede: ede ? edeDe(c) : {cargando: true, lista: []}});
  if(ede) return;

  ede = await pEde;
  if(id !== busquedaId) return;
  const c2 = agrupar()[norm(c.nombre)] || {ede: []};
  pintarResultados({comuna: c.nombre, uno: uno, ede: edeDe(c2)});
}

function mostrarEleccion(r){
  const elegida = r.comuna;
  pintarSugerencias(elegida ? r.sugerencias.filter(function(s){ return norm(s.nombre) !== norm(elegida.nombre); }).slice(0, 4)
                            : r.sugerencias, !!elegida);
}

function pintarSugerencias(lista, hayElegida){
  const c = document.getElementById("sugComunas");
  if(!lista.length){ c.innerHTML = ""; return; }
  c.innerHTML = '<span class="sug-t">' + (hayElegida ? "¿O era…?" : "¿Cuál comuna?") + '</span>' +
    lista.map(function(x){
      return '<button type="button" class="sug" data-slug="' + esc(x.slug) + '" data-nombre="' + esc(x.nombre) + '">' + esc(x.nombre) + '</button>';
    }).join("");
}

function tarjetaHTML(c){
  return '<div class="clin">' +
    '<div class="clin-n">' + esc(c.nombre) + '</div>' +
    (c.direccion ? '<div class="clin-d">' + esc(c.direccion) + '</div>' : '') +
    ((c.telefono || c.horario || c.url) ? '<div class="clin-m">' +
      (c.telefono ? '<span class="dist">' + esc(c.telefono) + '</span>' : '') +
      (c.horario ? '<span class="dist">' + esc(c.horario) + '</span>' : '') +
      (urlSegura(c.url) ? '<a class="fuente" href="' + esc(c.url) + '" target="_blank" rel="noopener">ficha &#8599;</a>' : '') +
    '</div>' : '') +
  '</div>';
}

function bloqueRed(red, comuna, r){
  const nom = RED[red].nombre;
  const lista = r.lista || [];
  let estado;
  if(r.cargando){
    return '<div class="redblq"><div class="redcab"><span class="red ' + red + '">' + nom + '</span>' +
      '<span class="redn">leyendo…</span></div>' +
      '<p class="clin-vacio">Leyendo el listado de ' + nom + '. La primera vez tarda unos segundos: se abre y se cierra sola una pestaña de fondo. Después queda guardado una semana.</p></div>';
  }
  if(r.pendiente){
    return '<div class="redblq"><div class="redcab"><span class="red ' + red + '">' + nom + '</span>' +
      '<span class="redn">cargando aparte…</span>' +
      '<a class="fuente" href="' + esc(RED[red].sitio) + '" target="_blank" rel="noopener">ver en el sitio &#8599;</a></div>' +
      '<p class="clin-vacio">El listado de ' + nom + ' se está cargando aparte (unos segundos, una sola vez por semana). Aparece aquí solo, sin volver a buscar.</p></div>';
  }
  if(r.error) estado = "sin respuesta";
  else if(lista.length) estado = lista.length + (lista.length === 1 ? " sucursal" : " sucursales");
  else if(red === "edental" && !r.total) estado = "sin listado";
  else estado = "ninguna en " + esc(comuna);
  let h = '<div class="redblq"><div class="redcab">' +
    '<span class="red ' + red + '">' + nom + '</span>' +
    '<span class="redn">' + estado + '</span>' +
    '<a class="fuente" href="' + esc(red === "unosalud" && r.url ? r.url : RED[red].sitio) + '" target="_blank" rel="noopener">ver en el sitio &#8599;</a>' +
    '</div>';
  if(r.error){
    h += '<p class="clin-vacio">' + (ESWEB
      ? 'Desde la página web no se pueden consultar otros sitios. En la extensión de Chrome sí.'
      : 'No pude leer el sitio: ' + esc(r.error) + '.') +
      (ESWEB ? '' : ' <button type="button" class="link-carga" data-diag="' + red + '">copiar diagnóstico</button>') + '</p>';
  }else if(!lista.length){
    let motivo;
    if(red === "unosalud" && r.sinPagina) motivo = "Uno Salud no tiene sucursales en esta comuna.";
    else if(red === "edental" && !r.total) motivo = "No encontré el listado de clínicas en el sitio de i-dental.";
    else if(red === "edental") motivo = "i-dental no tiene sucursales en esta comuna.";
    else motivo = "No encontré sucursales en la página de esta comuna.";
    h += '<p class="clin-vacio">' + motivo +
         (red === "unosalud" && r.sinPagina || red === "edental" && r.total ? '' :
          ' <button type="button" class="link-carga" data-diag="' + red + '">copiar diagnóstico</button>') + '</p>';
  }else{
    if(lista.some(function(c){ return c.porSeccion; })){
      h += '<p class="clin-vacio">El sitio no dice la comuna de alguna de estas clínicas: aparece bajo el título <strong>' +
           esc(comuna) + '</strong>. Confirma la dirección antes de dársela al cliente.</p>';
    }
    h += lista.map(tarjetaHTML).join("");
  }
  return h + '</div>';
}

function pintarResultados(e){
  const caja = document.getElementById("clinRes");
  if(!e){ caja.innerHTML = ""; return; }
  if(e.cargando){
    caja.innerHTML = '<p class="clin-vacio">Buscando sucursales en ' + esc(e.comuna) + '…' +
      (e.ede ? ' Leyendo el listado de i-dental: la primera vez tarda unos segundos.' : '') + '</p>';
    return;
  }
  if(e.sinElegir){
    caja.innerHTML = e.nada
      ? '<p class="clin-vacio">No encuentro <strong>' + esc(e.comuna) + '</strong> entre las comunas con sucursales de Uno Salud o i-dental. Revisa cómo se escribe.</p>'
      : '';
    return;
  }
  caja.innerHTML = '<p class="clin-titulo">Sucursales en <strong>' + esc(e.comuna) + '</strong></p>' +
    bloqueRed("unosalud", e.comuna, e.uno) +
    bloqueRed("edental", e.comuna, e.ede) +
    (e.mapeo
      ? '<p class="capturado">Del mapeo del ' + fmt(new Date(e.mapeo.generado)) + ' (' + e.mapeo.resumen.comunas + ' comunas). ' +
        '<button type="button" class="link-carga" data-abrir-mapeo="1">ver mapeo completo</button></p>'
      : '<p class="capturado">Leído en este momento de unosalud.cl y e-dentalsys.com. ' +
        '<button type="button" class="link-carga" data-abrir-mapeo="1">Haz el mapeo completo</button> para que responda al instante.</p>');
}

async function copiarDiagnostico(red, btn){
  const info = {red: red, cuando: new Date().toISOString(), indice: diag.indice || null, lectura: diag[red] || null};
  if(red === "edental"){
    info.ultimaPestana = await new Promise(function(res){ almacen.leer("diag_edental_vivo", res); });
  }
  const texto = "DIAGNOSTICO BUSCADOR " + red.toUpperCase() + "\n" + JSON.stringify(info, null, 1);
  try{ await navigator.clipboard.writeText(texto); btn.textContent = "copiado: pégalo en el chat"; }
  catch(e){ btn.textContent = "no se pudo copiar"; }
}


/* ---------- eventos ---------- */
function confirmarDosToques(btn, aviso, accion){
  if(btn.dataset.armado === "1"){
    btn.dataset.armado = ""; btn.textContent = btn.dataset.original; accion(); return;
  }
  btn.dataset.original = btn.textContent;
  btn.dataset.armado = "1";
  btn.textContent = aviso;
  setTimeout(function(){
    if(btn.dataset.armado === "1"){ btn.dataset.armado = ""; btn.textContent = btn.dataset.original; }
  }, 3500);
}

// Nuevo cliente: todo a cero. Titular solo, Plan Urgencias, sin nada escrito.
function reiniciar(){
  almacen.borrar("estado");
  busquedaId++;
  clearTimeout(temporizador);
  nCargas = 0;
  planElegido = PLAN_POR_DEFECTO;
  planForzado = false;
  guionAbierto = false;
  envio = "linea";
  pasos = {basico: 0, full: 0, ninos: 0};
  document.getElementById("hijos").innerHTML = "";
  document.getElementById("comuna").value = "";
  document.getElementById("sugComunas").innerHTML = "";
  document.getElementById("clinRes").innerHTML = "";
  document.getElementById("panelClin").hidden = true;
  document.getElementById("abrirClin").classList.remove("open");
  pintarBloqueCargas();
  marcarEnvio();
  pintarGuardado(null);
  calcular();
}

document.getElementById("ufReload").addEventListener("click", cargarUF);
document.getElementById("ufManual").addEventListener("input", function(){
  const v = parseFloat(this.value.replace(/\./g, "").replace(",", "."));
  if(v > 0){
    const cent = Math.round(v * 100), f = fmt(hoy());
    guardar(cent, f);
    cacheUF = {c: cent, f: f};
    pintarUF(cent, f, ESWEB ? "escrita a mano" : "manual");
    avisarUFVieja();
  }
});
document.getElementById("tieneCargas").addEventListener("change", function(){
  nCargas = this.checked ? Math.max(1, nCargas) : 0;
  pintarBloqueCargas();
  calcular(); guardarEstado();
  if(this.checked){ const ed = document.querySelector("#hijos .edad"); if(ed) ed.focus(); }
});
document.getElementById("conteo").addEventListener("click", function(e){
  const b = e.target.closest("button");
  if(!b) return;
  nCargas = +b.dataset.n;
  pintarBloqueCargas();
  calcular(); guardarEstado();
});
document.getElementById("abrirClin").addEventListener("click", function(){
  const panel = document.getElementById("panelClin");
  const abierto = !panel.hidden;
  panel.hidden = abierto;
  this.classList.toggle("open", !abierto);
  if(!abierto) document.getElementById("comuna").focus();
  guardarEstado();
});
document.getElementById("comuna").addEventListener("input", function(){ alEscribirComuna(); guardarEstado(); });
document.getElementById("comuna").addEventListener("keydown", function(e){
  if(e.key === "Enter"){ e.preventDefault(); clearTimeout(temporizador); if(norm(this.value).length >= 3) buscarComuna(this.value); }
});
document.getElementById("sugComunas").addEventListener("click", function(e){
  const b = e.target.closest("button.sug");
  if(!b) return;
  document.getElementById("comuna").value = b.dataset.nombre;
  guardarEstado();
  buscarComuna(b.dataset.nombre, {slug: b.dataset.slug, nombre: b.dataset.nombre});
});
function abrirMapeo(){
  try{ chrome.tabs.create({url: chrome.runtime.getURL("mapeo.html")}); }
  catch(e){ window.open("mapeo.html", "_blank"); }
}
document.getElementById("clinRes").addEventListener("click", function(e){
  const d = e.target.closest("[data-diag]");
  if(d){ copiarDiagnostico(d.dataset.diag, d); return; }
  if(e.target.closest("[data-abrir-mapeo]")) abrirMapeo();
});
document.getElementById("abrirMapeo").addEventListener("click", abrirMapeo);
document.getElementById("envio").addEventListener("click", function(e){
  const b = e.target.closest("button");
  if(!b) return;
  envio = b.dataset.envio;
  marcarEnvio();
  pintarGuion(); guardarEstado();
});
document.getElementById("tbody").addEventListener("click", function(e){
  const tr = e.target.closest("tr");
  if(!tr || !tr.dataset.plan || tr.classList.contains("veta")) return;
  const porNombre = !!e.target.closest(".nomplan");
  const mismoPlan = (tr.dataset.plan === planElegido);
  planElegido = tr.dataset.plan;
  planForzado = false;
  if(porNombre) guionAbierto = !(guionAbierto && mismoPlan);
  calcular(); guardarEstado();
});
document.getElementById("cerrarGuion").addEventListener("click", function(){
  guionAbierto = false;
  pintarGuion(); guardarEstado();
});
document.getElementById("letraMenos").addEventListener("click", function(){
  prefs.letra = Math.max(80, prefs.letra - 10); aplicarPrefs(); guardarPrefs(); marcarPasos(true);
});
document.getElementById("letraMas").addEventListener("click", function(){
  prefs.letra = Math.min(220, prefs.letra + 10); aplicarPrefs(); guardarPrefs(); marcarPasos(true);
});
document.getElementById("contraste").addEventListener("click", function(e){
  const b = e.target.closest("button");
  if(!b) return;
  prefs.contraste = b.dataset.c; aplicarPrefs(); guardarPrefs();
});
document.getElementById("guiada").addEventListener("click", function(){
  prefs.guiada = !prefs.guiada; aplicarPrefs(); guardarPrefs(); marcarPasos(prefs.guiada);
});
document.getElementById("pasoAnt").addEventListener("click", function(){ moverPaso(-1); });
document.getElementById("pasoSig").addEventListener("click", function(){ moverPaso(1); });
document.getElementById("guionCuerpo").addEventListener("click", function(e){
  const el = e.target.closest(".paso");
  if(!el || !prefs.guiada) return;
  pasos[planElegido] = +el.dataset.i;          // pinchar una frase la deja como actual
  marcarPasos(false); guardarEstado();
});
// Flechas ↑ ↓ en cualquier parte, salvo mientras se escribe en un campo
document.addEventListener("keydown", function(e){
  if(!guionAbierto || !prefs.guiada || e.altKey || e.ctrlKey || e.metaKey) return;
  const t = e.target;
  const escribiendo = t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable ||
                      (t.tagName === "INPUT" && !/^(checkbox|radio|button|submit)$/i.test(t.type)));
  if(escribiendo) return;
  if(e.key === "ArrowDown" || e.key === "PageDown"){ e.preventDefault(); moverPaso(1); }
  else if(e.key === "ArrowUp" || e.key === "PageUp"){ e.preventDefault(); moverPaso(-1); }
  else if(e.key === "Home"){ e.preventDefault(); pasos[planElegido] = 0; marcarPasos(true); guardarEstado(); }
  else if(e.key === "End"){ e.preventDefault(); pasos[planElegido] = 9999; marcarPasos(true); guardarEstado(); }
});

document.getElementById("limpiar").addEventListener("click", function(){
  confirmarDosToques(this, "¿Seguro? Toca otra vez", reiniciar);
});
document.getElementById("copiar").addEventListener("click", function(){
  if(!ultimaCotizacion) return;
  const b = this;
  navigator.clipboard.writeText(ultimaCotizacion).then(function(){
    b.textContent = "Copiado";
    setTimeout(function(){ b.textContent = "Copiar"; }, 1200);
  }, function(){ b.textContent = "No se pudo"; setTimeout(function(){ b.textContent = "Copiar"; }, 1500); });
});

/* ---------- arranque ---------- */
// La barra del script queda pegada bajo la cabecera, cuyo alto cambia con
// la letra, el subtítulo y al mostrarse (oculta mide 0): se sigue en vivo.
(function(){
  const g = document.getElementById("guion"), cab = g.querySelector(".guion-cab");
  try{ new ResizeObserver(function(){ g.style.setProperty("--gb-top", cab.offsetHeight + "px"); }).observe(cab); }catch(e){}
})();
// La pestaña de mapeo necesita leer otros sitios: en la web no aplica
if(ESWEB) document.getElementById("lineaMapeo").hidden = true;
almacen.leer("prefs", function(v){
  // Anchos de cuando era un popup de 800 px: pasan al normal de la página
  if(v && v.ancho && v.ancho <= 432) delete v.ancho;
  if(v) Object.assign(prefs, v);
  aplicarPrefs();
  if(guionAbierto) marcarPasos(false);
});
almacen.leer("uf", function(u){
  if(u){ cacheUF = u; if(UF === null) pintarUF(u.c, u.f, ESWEB ? "escrita a mano" : "guardado"); }
  restaurarEstado(function(){ cargarUF(); });
});
marcarEnvio();
pintarBloqueCargas();
calcular();
