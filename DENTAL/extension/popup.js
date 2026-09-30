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
  const hayAlgo = nCargas > 0 || envio !== "linea" || cargas.some(function(c){ return c.edad || c.fecha; });
  if(!hayAlgo){ almacen.borrar("estado"); pintarGuardado(null); return; }
  const estado = {
    n: nCargas,
    plan: planElegido,
    abierto: !document.getElementById("panelVerif").hidden,
    guion: guionAbierto,
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
    ". Se mantiene aunque cierres el popup.";
}

function restaurarEstado(cb){
  almacen.leer("estado", function(e){
    if(!e){ if(cb) cb(); return; }
    restaurando = true;
    nCargas = e.n || 0;
    planElegido = e.plan || PLAN_POR_DEFECTO;
    guionAbierto = (e.guion !== false);
    envio = e.envio || "linea";
    marcarEnvio();
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


  document.getElementById("abrirVerif").classList.toggle("hay", menores > 0);

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
  if(evaluados > nCargas){
    clase = "aviso warn";
    texto = (nCargas === 0
      ? "Marcaste 0 cargas, así que se cotiza sólo al titular. Hay "+evaluados+" edad"+(evaluados===1?"":"es")+" escrita"+(evaluados===1?"":"s")+": si esa persona entra, sube el número de cargas."
      : "Marcaste "+nCargas+" carga"+(nCargas===1?"":"s")+" pero hay "+evaluados+" edades escritas. El precio va por el número de cargas.");
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
  {t:"Apertura", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Muy buenos días / tardes, usted habla con <em>[su nombre]</em>. Lo llamo por ser cliente Bci. ¿Cómo está?</p>'+
    '<p>El motivo de mi llamado es entregarle una información importante, son buenas noticias, y no le quitaré mucho tiempo. '+
    'Queremos agradecer su permanencia como cliente y contarle que Bci pone a su disposición una completa cobertura dental, '+
    'que le cubrirá hasta el 100% en los tratamientos dentales más frecuentes. Y lo mejor es que la atención es exclusiva en la '+
    'red de clínicas <strong>Uno Salud Dental</strong>, más de 80 clínicas a lo largo de todo Chile.</p>'; }},

  {t:"Urgencias, a costo $0", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Tendrá los siguientes tratamientos de urgencia dental <strong>sin costo</strong>, en caso de dolor, inflamación o sangrado. Por ejemplo:</p>'+
    '<ul><li>Extracciones simples</li>'+
    '<li>Trepanación, que es la primera parte del tratamiento de conducto</li>'+
    '<li>Colocación de cemento o tapadura temporal</li>'+
    '<li>Urgencia protésica: recementación de corona, puentes, incrustaciones y reparación de prótesis</li></ul>'+
    '<p class="nota">Sin tope. Carencia de 48 horas hábiles.</p>'; }},

  {t:"Prevención", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Además le cubrimos tratamientos de prevención: evaluación y diagnóstico, radiografías pieza a pieza, y una '+
    '<strong>limpieza profunda</strong> (profilaxis más remoción de cálculos supragingivales), para remover la placa '+
    'bacteriana y el sarro acumulados entre los dientes.</p>'+
    '<p>Los odontólogos recomiendan una limpieza al menos una vez al año, y usted la tendría sin costo con nosotros '+
    'dentro de 30 días.</p>'; }},

  {t:"Tratamientos con copago", p:["full","ninos"], html:function(d){ return ''+
    '<p>Para los tratamientos más complejos, que de forma particular suelen ser los más costosos, también podrá acceder '+
    'dentro de 30 días, con copagos claros y fijos conocidos antes de realizarlos:</p>'+
    '<ul><li><strong>5 tapaduras en resina al año</strong>, a $12.000 cada una. En otras clínicas son unos $45.000.</li>'+
    '<li><strong>2 tratamientos de conducto al año</strong>, en muelas, premolares o dientes anteriores, a $12.000 cada uno. '+
    'El valor referencial en otras clínicas va de $150.000 a $300.000.</li></ul>'+
    '<p>Y hasta un <strong>65% de descuento</strong> en: extracción de muelas del juicio, planos de relajación para el bruxismo, '+
    'cambio de tapadura de amalgama a resina, tapaduras de resina adicionales y tratamientos de conducto adicionales.</p>'; }},

  {t:"Odontología para niños", p:["ninos"], clase:"clave", html:function(d){ return ''+
    '<p>Y como usted tiene niños menores de 14 años, le entregamos <strong>11 procedimientos adicionales</strong> asociados a '+
    'dientes temporales, a costo cero y sin tope, que podrá utilizar dentro de 30 días.</p>'; }},

  {t:"Programas de salud y bienestar", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Además, sin costo, accede al <strong>Programa de Salud y Bienestar de Bci</strong>, con 13 programas: telemedicina, '+
    'salud mental, nutrición, kinesiología, fonoaudiología, entre otros. Uso ilimitado y atención multicanal.</p>'+
    '<p>Para acceder debe descargar la aplicación <strong>Care Assistance</strong> y seguir las instrucciones que recibirá en el '+
    'correo de bienvenida.</p>'; }},

  {t:"Muerte accidental", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Complementando lo anterior, existe una protección frente a accidentes personales que terminen en fallecimiento '+
    '(sólo titular), que entrega una indemnización a sus herederos legales de <span class="dato">50 UF</span>'+
    (d.ap ? ', unos <span class="dato">'+d.ap+'</span>' : '')+'. Dinero de libre disposición.</p>'+
    '<p>Es una cobertura completa, ¿verdad?</p>'; }},

  {t:"Sin reembolsos", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Lo mejor es que no trabajamos con reembolso, así que puede olvidarse de comprar bonos y de los papeleos. '+
    'Usted agenda la primera hora llamando al <strong>227501096</strong>, en cualquiera de las clínicas de la red Uno Salud, '+
    'donde le aplicarán todos los descuentos y valores automáticamente en su presupuesto.</p>'; }},

  {t:"Requisitos", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Usted cumple con los requisitos, ya que es mayor de 18 años y menor de 70 años. La permanencia máxima es hasta '+
    'un día antes de cumplir los 71 años.</p>'+
    (d.cargas > 0
      ? '<p>Puede incorporar adicionales, cónyuge e hijos. La edad mínima de ingreso de sus hijos es de <strong>14 días</strong> '+
        'y la permanencia es hasta los <strong>24 años y 0 días</strong>. Sus adicionales contarían con la cobertura dental y los programas.</p>'+
        '<p class="nota">Necesito de cada adicional: nombre completo, RUT, fecha de nacimiento y parentesco. Los cuatro datos.</p>'
      : ''); }},

  {t:"El precio", p:["basico","full","ninos"], clase:"clave", html:function(d){ return ''+
    '<p>Lo más importante: todas las coberturas, asistencias y beneficios mencionados tienen un costo de '+
    '<span class="dato">'+d.uf+' UF</span> fijas, que son <span class="dato">'+d.clp+'</span> aproximadamente, '+
    'que se cargarán automáticamente en su cuenta Bci terminada en los dígitos <em>[XXX]</em>, en su próximo estado de cuenta.</p>'+
    '<p class="nota">'+d.plan+' · '+d.compos+' · calculado con la UF de hoy, $'+d.ufdia+'.</p>'+
    '<p>Además, este mes tenemos una promoción especial: la compañía le otorga <em>[X]</em> cuota sin costo durante el primer '+
    'año de vigencia. ¿Qué fecha de cargo le acomoda? ¿Lo incorporo, verdad?</p>'; }},

  {t:"Si duda o lo rechaza", p:["full"], clase:"ojo", html:function(d){ return ''+
    '<p>Como no queremos que se quede sin cobertura y lo tome por sorpresa un dolor de muelas, le ofrecemos por sólo '+
    '<span class="dato">'+(d.clpBasico || '—')+'</span> mensuales, es decir <span class="dato">'+(d.ufBasico || '—')+' UF</span>, '+
    'todas las urgencias dentales que ya le mencioné, más los tratamientos de prevención.</p>'+
    '<p class="nota">Es el Plan Urgencias. Pincha esa fila para leer su script.</p>'; }},

  {t:"Si quiere más cobertura", p:["basico"], clase:"ojo", html:function(d){ return ''+
    '<p>Si además quiere cubrir tapaduras y tratamientos de conducto, tenemos el Plan Full por '+
    '<span class="dato">'+(d.clpFull || '—')+'</span> mensuales: agrega 5 tapaduras y 2 tratamientos de conducto al año '+
    'con copago de $12.000 cada uno, y hasta 65% de descuento en el resto.</p>'+
    '<p class="nota">Pincha la fila del Plan 3 Full para leer su script completo.</p>'; }},

  {t:"Por qué no puede quedar en un plan menor", p:["ninos"], clase:"ojo", html:function(d){ return ''+
    '<p class="nota">Recordatorio interno, no se lee al cliente: hay un menor de 14 años en el grupo. La odontología infantil '+
    'sólo existe en este plan, así que no corresponde ofrecer Urgencias ni Full.</p>'; }},

  {t:"Pregunta de contratación · textual", p:["basico","full","ninos"], clase:"clave", html:function(d){ return ''+
    '<p>Antes de continuar le informo que, para su tranquilidad y respaldo, esta conversación está siendo grabada.</p>'+
    '<p>Señor o señora <em>[apellido]</em>, entonces con fecha <em>[DD/MM/AA]</em>, ¿acepta la contratación en forma '+
    'voluntaria del <strong>Seguro Dental Modular Bci</strong>, con las coberturas detalladas anteriormente, con un valor '+
    'mensual de <span class="dato">'+d.uf+' UF</span> fijas, <span class="dato">'+d.clp+'</span> aproximadamente, '+
    'IVA incluido? ¿Acepta?</p>'+
    '<p class="nota">Sólo vale “sí”, “acepto” o “de acuerdo”. No sirve “ok”, “ya” ni “correcto”.</p>'; }},

  {t:"Validación de datos", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Entonces, para cumplir con la normativa y poder realizar el correcto envío de su póliza, le voy a solicitar '+
    'que me corrobore si los datos que tengo en pantalla están vigentes y correctos.</p>'+
    '<ul><li>Fecha de nacimiento</li><li>Domicilio completo</li><li>Teléfono de contacto</li>'+
    '<li>Correo electrónico <span class="nota">(fundamental para enviar la póliza vía email)</span></li>'+
    '<li>Nombre completo y RUT</li></ul>'+
    (d.cargas > 0 ? '<p class="nota">De cada asegurado adicional: nombre completo, RUT, fecha de nacimiento y parentesco. Los cuatro son obligatorios.</p>' : ''); }},

  {t:"Medio de pago · póliza en línea", p:["basico","full","ninos"], envio:"linea", clase:"clave", html:function(d){ return ''+
    '<p>“Sr./Sra. <em>[apellido]</em>, usted ¿autoriza el cargo de la prima mensual del seguro, el que será '+
    'descontado de su cuenta corriente <em>[N.º medio de pago]</em> del banco Bci? ¿Acepta?”</p>'+
    '<p class="nota">Esperar respuesta. Esta es la opción para el cliente que tiene cuenta Bci.</p>'; }},

  {t:"Medio de pago · link de pago", p:["basico","full","ninos"], envio:"link", clase:"clave", html:function(d){ return ''+
    '<p class="nota">Pago débito: cobro inmediato. Pago crédito: próximo ciclo de facturación.</p>'+
    '<p>“Sr./Sra. <em>[apellido]</em>, en este momento le llegará a su correo electrónico un correo con el asunto '+
    '<strong>Multicotizador – Pago de primera cuota</strong>, donde encontrará el link de pago, en naranjo: '+
    '<strong>Pagar aquí</strong>.</p>'+
    '<p>Autoriza el cargo de la prima mensual del Seguro Dental, el que será descontado en la forma de pago que '+
    'usted seleccione cuando ingrese al link enviado a su correo. ¿Acepta?”</p>'+
    '<p class="nota">Esperar respuesta.</p>'+
    '<p>“Si no puede realizar el pago en este momento, le comento que este link tiene una vigencia de '+
    '<strong>48 horas</strong>. Mientras no realice el pago, este seguro no está vigente y no puede hacer uso de '+
    'las asistencias y las coberturas.”</p>'; }},

  {t:"Después del pago", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>“Lo invitamos a siempre estar al día en el pago de su prima mensual, para así poder utilizar su cobertura '+
    'cuando la necesite.</p>'+
    '<p>Haremos llegar a su correo electrónico dentro de unos minutos, cuando registre su medio de pago, su póliza '+
    'de seguro y todas las comunicaciones relativas a esta.”</p>'; }},

  {t:"Exclusiones", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Estas son algunas de las principales exclusiones. No se cubre cuando el origen sean: guerra, peleas o riñas, actos '+
    'delictivos, suicidio o intento, intoxicación o efecto de drogas, conducción en estado de ebriedad, negligencia o '+
    'imprudencia, servicio en fuerzas armadas o policiales, sismos de grado 8 o superior, o vuelo en aeronave de itinerario '+
    'no regular.</p>'+
    '<p>En el programa dental se excluyen cirugías de alta complejidad, cirugías para implantes fuera de la red Uno Salud, '+
    'costos de laboratorio y medicación.</p>'; }},

  {t:"Cierre normativo", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>Las condiciones generales están registradas en la CMF bajo el código <strong>POL 3 2013 0085 Alt. A</strong> para '+
    'muerte accidental y <strong>POL 3 2019 0055</strong> para la cobertura dental.</p>'+
    '<p>Bci Seguros Vida y Bci Corredores de Seguros tratarán sus datos para evaluar y mejorar sus servicios. '+
    '¿Autoriza el tratamiento de los mismos?</p>'+
    '<p>El código de operación asociado a esta venta es <em>[RUT o ID de venta]</em>. Guárdelo para futuras consultas. '+
    'La grabación constituye prueba de la información entregada y de la aceptación del contrato.</p>'+
    '<p>La vigencia comienza hoy, es anual y renovable automáticamente. Puede retractarse dentro de 10 días desde que '+
    'reciba la póliza, sin causa ni cargo, con devolución de la prima pagada.</p>'+
    '<p class="nota">Centro de Respuesta Inmediata 600 6000 292. Asistencia dental 227501096.</p>'; }},

  {t:"Encuesta EPA", p:["basico","full","ninos"], html:function(d){ return ''+
    '<p>“Don o señorita <em>[nombre]</em>, para finalizar lo derivaré a una pequeña encuesta de 2 preguntas para que '+
    'califique mi atención en esta llamada, ¿de acuerdo? Que tenga buen día.”</p>'+
    '<p class="nota">En el sistema: Transfer-Conf → ingroup ENCUESTA_EPA → CLOSER LOCAL, y luego tipificar. '+
    'Obligatoria salvo derivación a IVR por pago con tarjeta de crédito.</p>'; }}
];

let guionAbierto = false;   // se abre sólo al pinchar el nombre del plan
/* Por defecto se lee la opción de póliza en línea, porque el cliente tiene
   cuenta Bci. Si no la tiene, se le envía el link de pago. */
let envio = "linea";

function pintarGuion(){
  const app = document.getElementById("app");
  app.classList.toggle("abierto", guionAbierto);
  if(!guionAbierto) return;

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
}

/* ============================================================
   BUSCADOR DE CLÍNICAS POR COMUNA
   Tolera tildes, mayúsculas, la ñ y hasta dos letras mal
   escritas, porque el nombre se escribe al vuelo mientras el
   cliente habla. Los datos viven en clinicas.js.
   ============================================================ */
function norm(txt){
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // fuera las tildes y la ñ
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Distancia de edición, con corte temprano: si ya se pasó del máximo, no sigue
function distancia(a, b, max){
  if(Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [], fila = [];
  for(let j = 0; j <= b.length; j++) prev[j] = j;
  for(let i = 1; i <= a.length; i++){
    fila = [i];
    let mejor = i;
    for(let j = 1; j <= b.length; j++){
      const costo = a.charCodeAt(i-1) === b.charCodeAt(j-1) ? 0 : 1;
      fila[j] = Math.min(prev[j] + 1, fila[j-1] + 1, prev[j-1] + costo);
      if(fila[j] < mejor) mejor = fila[j];
    }
    if(mejor > max) return max + 1;
    prev = fila;
  }
  return prev[b.length];
}

// Puntaje: cuanto más bajo, mejor coincidencia
function puntaje(consulta, candidato){
  const q = norm(consulta), c = norm(candidato);
  if(!q || !c) return null;
  if(c === q) return 0;
  if(c.startsWith(q)) return 1;
  if(c.indexOf(q) !== -1) return 2;
  const max = q.length <= 4 ? 1 : 2;      // en nombres cortos, menos tolerancia
  const d = distancia(q, c, max);
  return d <= max ? 3 + d : null;
}

function comunasConClinica(){
  const vistas = {};
  (CLINICAS.lista || []).forEach(function(cl){
    const k = norm(cl.comuna);
    if(k && !vistas[k]) vistas[k] = cl.comuna;
  });
  return vistas;
}

// Kilómetros entre dos coordenadas
function km(aLat, aLng, bLat, bLng){
  const R = 6371, r = Math.PI/180;
  const dLat = (bLat-aLat)*r, dLng = (bLng-aLng)*r;
  const x = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(aLat*r)*Math.cos(bLat*r)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// Punto de referencia de una comuna: su centro declarado, o el promedio de
// las clínicas que tiene. Si no hay ninguna de las dos cosas, null.
function puntoComuna(nombre){
  const k = norm(nombre);
  const c = CLINICAS.comunas && CLINICAS.comunas[k];
  if(c && typeof c.lat === "number" && typeof c.lng === "number") return {lat:c.lat, lng:c.lng};
  const dentro = (CLINICAS.lista || []).filter(function(x){
    return norm(x.comuna) === k && typeof x.lat === "number" && typeof x.lng === "number";
  });
  if(!dentro.length) return null;
  return {
    lat: dentro.reduce(function(a,x){ return a + x.lat; }, 0) / dentro.length,
    lng: dentro.reduce(function(a,x){ return a + x.lng; }, 0) / dentro.length
  };
}

function regionDe(nombre){
  const k = norm(nombre);
  const c = CLINICAS.comunas && CLINICAS.comunas[k];
  if(c && c.region) return c.region;
  const cl = (CLINICAS.lista || []).filter(function(x){ return norm(x.comuna) === k; })[0];
  return cl ? cl.region : null;
}

function buscarClinicas(consulta){
  const lista = CLINICAS.lista || [];
  if(!lista.length) return {estado:"sin-datos"};
  if(norm(consulta).length < 2) return {estado:"corto"};

  // 1. ¿Qué comuna quiso escribir?
  const comunas = comunasConClinica();
  const cand = [];
  Object.keys(comunas).forEach(function(k){
    const pt = puntaje(consulta, k);
    if(pt !== null) cand.push({clave:k, nombre:comunas[k], pt:pt});
  });
  cand.sort(function(a,b){ return a.pt - b.pt || a.nombre.localeCompare(b.nombre); });

  // 2. Clínicas en esa comuna
  if(cand.length && cand[0].pt <= 2){
    const exacta = cand[0];
    const aqui = lista.filter(function(x){ return norm(x.comuna) === exacta.clave; });
    const otras = cand.slice(1, 4).filter(function(c){ return c.pt <= 2; });
    return {estado:"encontrada", comuna:exacta.nombre, clinicas:aqui, alternativas:otras};
  }

  // 3. Casi: se escribió con errores, pero se entiende
  if(cand.length){
    const q = cand[0];
    const aqui = lista.filter(function(x){ return norm(x.comuna) === q.clave; });
    return {estado:"aproximada", comuna:q.nombre, clinicas:aqui,
            alternativas:cand.slice(1, 4)};
  }

  // 4. No hay clínica en esa comuna: lo más cercano que se pueda decir
  const punto = puntoComuna(consulta);
  if(punto){
    const cerca = lista
      .filter(function(x){ return typeof x.lat === "number" && typeof x.lng === "number"; })
      .map(function(x){ return {cl:x, d:km(punto.lat, punto.lng, x.lat, x.lng)}; })
      .sort(function(a,b){ return a.d - b.d; })
      .slice(0, 5);
    if(cerca.length) return {estado:"cercanas", comuna:consulta, cercanas:cerca};
  }
  const reg = regionDe(consulta);
  if(reg){
    const enRegion = lista.filter(function(x){ return x.region === reg; }).slice(0, 6);
    if(enRegion.length) return {estado:"region", comuna:consulta, region:reg, clinicas:enRegion};
  }
  return {estado:"nada", comuna:consulta};
}

function pintarClinicas(){
  const caja = document.getElementById("clinRes");
  const consulta = document.getElementById("comuna").value;
  const r = buscarClinicas(consulta);

  function tarjeta(cl, dist){
    return '<div class="clin">'+
      '<div class="clin-n">'+cl.nombre+'</div>'+
      '<div class="clin-d">'+(cl.direccion || "")+(cl.comuna ? " · "+cl.comuna : "")+'</div>'+
      '<div class="clin-m">'+
        '<span class="red '+(cl.red||"")+'">'+(cl.red === "edental" ? "E-dental" : "Uno Salud")+'</span>'+
        (cl.telefono ? '<span class="dist">'+cl.telefono+'</span>' : '')+
        (dist !== undefined ? '<span class="dist">a '+dist.toFixed(1).replace(".",",")+' km</span>' : '')+
      '</div></div>';
  }
  function alternativas(lista){
    if(!lista || !lista.length) return "";
    return '<p class="sugerencias">¿O quisiste decir '+lista.map(function(c){
      return '<button type="button" data-comuna="'+c.nombre+'">'+c.nombre+'</button>';
    }).join(", ")+'?</p>';
  }

  let html = "";
  if(r.estado === "sin-datos"){
    html = '<p class="clin-vacio">Todavía no hay listado de clínicas cargado. '+
           'Sácalo de <strong>unosalud.cl/clinicas</strong> y <strong>e-dentalsys.com</strong>, '+
           'y <button type="button" class="link-carga" id="abrirCarga">pégalo aquí</button>.</p>';
  }else if(r.estado === "corto"){
    html = '<p class="clin-vacio">Escribe al menos dos letras.</p>';
  }else if(r.estado === "encontrada" || r.estado === "aproximada"){
    html = (r.estado === "aproximada" ? '<p class="clin-vacio">Entendí <strong>'+r.comuna+'</strong>.</p>' : '')+
           r.clinicas.map(function(c){ return tarjeta(c); }).join("") +
           alternativas(r.alternativas);
  }else if(r.estado === "cercanas"){
    html = '<p class="clin-vacio">No hay clínica en <strong>'+r.comuna+'</strong>. Las más cercanas:</p>'+
           r.cercanas.map(function(x){ return tarjeta(x.cl, x.d); }).join("");
  }else if(r.estado === "region"){
    html = '<p class="clin-vacio">No hay clínica en <strong>'+r.comuna+'</strong>. '+
           'Estas son las de la región '+r.region+'. <em>Sin coordenadas no puedo ordenarlas por distancia.</em></p>'+
           r.clinicas.map(function(c){ return tarjeta(c); }).join("");
  }else{
    html = '<p class="clin-vacio">No encuentro ninguna comuna parecida a <strong>'+
           (consulta||"")+'</strong>.</p>';
  }
  if(CLINICAS.capturado && r.estado !== "sin-datos"){
    html += '<p class="capturado">Listado cargado el '+CLINICAS.capturado+' · '+
            (CLINICAS.lista||[]).length+' clínicas · '+
            '<button type="button" class="link-carga" id="abrirCarga">actualizar</button></p>';
  }
  caja.innerHTML = html;
  const ab = document.getElementById("abrirCarga");
  if(ab) ab.addEventListener("click", function(){
    const c = document.getElementById("cargador");
    c.hidden = !c.hidden;
    if(!c.hidden) document.getElementById("pegado").focus();
  });
}

/* ============================================================
   CARGA DEL LISTADO DE CLÍNICAS
   El listado no viene con la extensión. Se pega acá y queda
   guardado en el navegador, así el ejecutivo no depende de que
   alguien reempaquete la extensión para actualizarlo.
   ============================================================ */
let redCarga = "unosalud";

function num(v){
  if(v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}
function limpio(v){
  const t = String(v === null || v === undefined ? "" : v).trim();
  return t === "" || t.toLowerCase() === "null" ? null : t;
}

// Acepta JSON (arreglo, u objeto con lista) o una línea por clínica con |
function interpretar(texto, red){
  const filas = [], errores = [];
  const t = texto.trim();
  if(!t) return {filas:filas, errores:["No pegaste nada."]};

  let crudo = null;
  if(t[0] === "[" || t[0] === "{"){
    try{
      const j = JSON.parse(t);
      crudo = Array.isArray(j) ? j : (j.lista || j.clinicas || null);
      if(!crudo) errores.push("El JSON no trae un arreglo ni un campo 'lista'.");
    }catch(e){
      errores.push("El JSON está mal formado: " + e.message);
    }
  }
  if(crudo){
    crudo.forEach(function(o, i){
      const nombre = limpio(o.nombre || o.name);
      const comuna = limpio(o.comuna);
      if(!nombre || !comuna){ errores.push("Fila "+(i+1)+": falta nombre o comuna."); return; }
      filas.push({
        nombre: nombre,
        direccion: limpio(o.direccion || o.direccion_completa || o.address),
        comuna: comuna,
        region: limpio(o.region),
        telefono: limpio(o.telefono || o.fono),
        red: limpio(o.red) || red,
        lat: num(o.lat), lng: num(o.lng)
      });
    });
    return {filas:filas, errores:errores};
  }

  // Texto plano separado por |
  t.split(/\r?\n/).forEach(function(linea, i){
    const l = linea.trim();
    if(!l) return;
    const c = l.split("|").map(function(x){ return x.trim(); });
    if(c.length < 3){ errores.push("Línea "+(i+1)+": necesita al menos nombre, dirección y comuna."); return; }
    if(!c[0] || !c[2]){ errores.push("Línea "+(i+1)+": falta nombre o comuna."); return; }
    filas.push({
      nombre:c[0], direccion:limpio(c[1]), comuna:c[2], region:limpio(c[3]),
      telefono:limpio(c[4]), red:red, lat:num(c[5]), lng:num(c[6])
    });
  });
  return {filas:filas, errores:errores};
}

function guardarClinicas(){
  almacen.escribir("clinicas_datos", {
    capturado: CLINICAS.capturado,
    lista: CLINICAS.lista,
    comunas: CLINICAS.comunas
  });
}

function cargarPegado(){
  const caja = document.getElementById("cargaRes");
  const r = interpretar(document.getElementById("pegado").value, redCarga);

  if(!r.filas.length){
    caja.innerHTML = '<span class="mal">No se pudo cargar nada.</span><br>' +
                     r.errores.slice(0,5).map(function(e){ return "· "+e; }).join("<br>");
    return;
  }
  // Reemplaza sólo la red que se está cargando, para poder cargarlas por separado
  const otras = (CLINICAS.lista || []).filter(function(x){ return x.red !== redCarga; });
  CLINICAS.lista = otras.concat(r.filas);
  const d = new Date();
  CLINICAS.capturado = String(d.getDate()).padStart(2,"0")+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+d.getFullYear();
  guardarClinicas();

  const conCoord = r.filas.filter(function(x){ return x.lat !== null && x.lng !== null; }).length;
  let msg = '<span class="ok">Cargadas '+r.filas.length+' clínicas de '+
            (redCarga === "edental" ? "E-dental" : "Uno Salud")+'.</span>';
  msg += '<br>Con coordenadas: '+conCoord+' de '+r.filas.length+
         (conCoord < r.filas.length ? ' · sin coordenadas no se puede ordenar por distancia' : '');
  msg += '<br>Total en la extensión: '+CLINICAS.lista.length+' clínicas.';
  if(r.errores.length){
    msg += '<br><span class="mal">'+r.errores.length+' línea(s) rechazada(s):</span><br>'+
           r.errores.slice(0,4).map(function(e){ return "· "+e; }).join("<br>");
  }
  caja.innerHTML = msg;
  document.getElementById("pegado").value = "";
  pintarClinicas();
}

function borrarClinicas(){
  if(!confirm("¿Borrar todo el listado de clínicas guardado?")) return;
  CLINICAS.lista = [];
  CLINICAS.comunas = {};
  CLINICAS.capturado = null;
  almacen.borrar("clinicas_datos");
  document.getElementById("cargaRes").innerHTML = '<span class="mal">Listado borrado.</span>';
  pintarClinicas();
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
document.getElementById("abrirClin").addEventListener("click", function(){
  const panel = document.getElementById("panelClin");
  const abierto = !panel.hidden;
  panel.hidden = abierto;
  this.classList.toggle("open", !abierto);
  if(!abierto){ pintarClinicas(); document.getElementById("comuna").focus(); }
});
document.getElementById("comuna").addEventListener("input", pintarClinicas);
document.getElementById("redCarga").addEventListener("click", function(e){
  const b = e.target.closest("button");
  if(!b) return;
  redCarga = b.dataset.red;
  [].forEach.call(this.querySelectorAll("button"), function(x){ x.classList.toggle("on", x===b); });
});
document.getElementById("btnCargar").addEventListener("click", cargarPegado);
document.getElementById("btnBorrar").addEventListener("click", borrarClinicas);
document.getElementById("clinRes").addEventListener("click", function(e){
  const b = e.target.closest("button[data-comuna]");
  if(!b) return;
  document.getElementById("comuna").value = b.dataset.comuna;
  pintarClinicas();
});
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
  planForzado = false;                  // elección del ejecutivo, no imposición

  // El script se despliega sólo al pinchar el nombre. Pinchar el nombre del
  // plan que ya está abierto lo cierra.
  if(porNombre) guionAbierto = !(guionAbierto && mismoPlan);

  calcular(); guardarEstado();
});
document.getElementById("cerrarGuion").addEventListener("click", function(){
  guionAbierto = false;
  pintarGuion();
  guardarEstado();
});
document.getElementById("limpiar").addEventListener("click", function(){
  if(!confirm("¿Borrar los datos de este cliente y empezar de cero?")) return;
  almacen.borrar("estado");
  nCargas = 0; planElegido = PLAN_POR_DEFECTO; planForzado = false;
  guionAbierto = false; envio = "linea"; marcarEnvio();
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
almacen.leer("clinicas_datos", function(d){
  if(d && d.lista && d.lista.length){
    CLINICAS.lista = d.lista;
    CLINICAS.comunas = d.comunas || {};
    CLINICAS.capturado = d.capturado || null;
    const pc = document.getElementById("panelClin");
    if(pc && !pc.hidden) pintarClinicas();
  }
});
almacen.leer("uf", function(u){
  if(u){ cacheUF = u; if(UF===null) pintarUF(u.c, u.f, "guardado"); }
  restaurarEstado(function(){ cargarUF(); });
});
marcarEnvio();
calcular();
