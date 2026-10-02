/* ============================================================
   PLANILLA DEL HISTORIAL
   Misma forma de trabajo que la planilla de la cotizadora de
   Equifax: búsqueda, filtros, orden por columna, barra de fórmula
   con copiado al pinchar, edición con doble clic y en ventana,
   tipificación en menú, agenda, favoritos, selección múltiple con
   acciones masivas, historial de cambios por fila, duplicados,
   exportar/importar y respaldos.
   ============================================================ */
const $ = function(id){ return document.getElementById(id); };
function esc(t){ return String(t == null ? "" : t).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
function norm(t){ return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function dos(n){ return String(n).padStart(2, "0"); }
function fechaHora(ts){ if(!ts) return ""; const d = new Date(ts); return dos(d.getDate()) + "/" + dos(d.getMonth() + 1) + "/" + d.getFullYear() + " " + dos(d.getHours()) + ":" + dos(d.getMinutes()); }
function hoyISO(){ const d = new Date(); return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate()); }
function nombrePropio(t){
  t = String(t || "").replace(/\s+/g, " ").trim();
  if(!t || (t !== t.toUpperCase() && t !== t.toLowerCase())) return t;
  return t.toLowerCase().replace(/(^|[\s-])(\S)/g, function(m, a, b){ return a + b.toUpperCase(); });
}

let toastT = null;
function toast(t){ const e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(function(){ e.classList.remove("on"); }, 2200); }

/* ---------- columnas ----------
   campo: dónde vive el dato ("cliente.x" o raíz). editable: doble clic. */
const COLS = [
  {k: "fecha",       h: "Fecha",        v: function(r){ return fechaHora(r.creado); }, orden: function(r){ return r.creado; }},
  {k: "rut",         h: "RUT",          campo: "cliente.rut"},
  {k: "nombre",      h: "Nombres",      campo: "cliente.nombre", ver: nombrePropio},
  {k: "apellido",    h: "Apellidos",    campo: "cliente.apellido", ver: nombrePropio},
  {k: "fono",        h: "Teléfono",     campo: "cliente.fono"},
  {k: "fono2",       h: "Teléfono 2",   campo: "cliente.fono2"},
  {k: "email",       h: "Correo",       campo: "cliente.email"},
  {k: "comuna",      h: "Comuna",       campo: "cliente.comuna", ver: nombrePropio},
  {k: "cargas",      h: "Cargas",       v: textoCargas, orden: function(r){ return (r.cargas || []).length; }},
  {k: "plan",        h: "Plan cotizado",v: function(r){ return r.cotizacion ? r.cotizacion.plan : ""; }},
  {k: "uf",          h: "UF",           v: function(r){ return r.cotizacion ? r.cotizacion.uf : ""; }, num: true},
  {k: "clp",         h: "Mensual",      v: function(r){ return r.cotizacion ? r.cotizacion.clp : ""; }, num: true},
  {k: "llamadas",    h: "Llamadas",     v: function(r){ return (r.llamadas || []).length; }, num: true},
  {k: "ultima",      h: "Última llamada", v: function(r){ const l = r.llamadas || []; return fechaHora(l[l.length - 1]); }, orden: function(r){ const l = r.llamadas || []; return l[l.length - 1] || 0; }},
  {k: "observacion", h: "Observación",  campo: "observacion", obs: true},
  {k: "ejecutivo",   h: "Ejecutivo",    campo: "ejecutivo"},
  {k: "lead",        h: "Lead",         campo: "lead", num: true}
];
function textoCargas(r){
  const c = r.cargas || [];
  if(r.cotizacion && r.cotizacion.edades) return r.cotizacion.edades;
  if(!c.length) return "";
  return c.length + ": " + c.map(function(x){ return x.fecha || "?"; }).join(", ");
}
function leer(r, col){
  let v;
  if(col.v) v = col.v(r);
  else if(col.campo.indexOf("cliente.") === 0) v = (r.cliente || {})[col.campo.slice(8)];
  else v = r[col.campo];
  v = v == null ? "" : String(v);
  return col.ver ? col.ver(v) : v;
}
function letra(i){ let s = ""; i++; while(i > 0){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/* ---------- estado de la vista ---------- */
const V = {q: "", estado: "", agenda: "", fav: false, elim: false, campo: "fecha", dir: -1, sel: new Set(), filas: [], todos: []};

function agendaEstado(r){
  if(!r.agenda || !r.agenda.fecha) return "";
  const cuando = new Date(r.agenda.fecha + "T" + (r.agenda.hora || "00:00"));
  if(cuando.getTime() < Date.now()) return "vencida";
  if(r.agenda.fecha === hoyISO()) return "hoy";
  return "futura";
}
function filtrar(rs){
  const q = norm(V.q).trim();
  return rs.filter(function(r){
    if(!!r.eliminado !== V.elim) return false;
    if(V.estado && r.estado !== V.estado) return false;
    if(V.fav && !r.fav) return false;
    if(V.agenda){
      const a = agendaEstado(r);
      if(V.agenda === "con" && !a) return false;
      if(V.agenda === "hoy" && !(r.agenda && r.agenda.fecha === hoyISO())) return false;
      if(V.agenda === "vencidos" && a !== "vencida") return false;
    }
    if(!q) return true;
    const c = r.cliente || {};
    const texto = norm([c.rut, (c.rut || "").replace(/\./g, ""), c.nombre, c.apellido, c.fono, c.fono2, c.email, c.comuna,
                        r.observacion, r.lead, r.ejecutivo, HDB.ETIQUETA[r.estado], r.cotizacion && r.cotizacion.plan].join(" "));
    return q.split(/\s+/).every(function(p){ return texto.indexOf(p) >= 0; });
  });
}
function ordenar(rs){
  const col = COLS.find(function(c){ return c.k === V.campo; });
  const val = function(r){
    if(V.campo === "estado") return HDB.ETIQUETA[r.estado] || "";
    if(V.campo === "id") return r.id;
    if(V.campo === "agenda") return r.agenda && r.agenda.fecha ? r.agenda.fecha + (r.agenda.hora || "") : "";
    if(col && col.orden) return col.orden(r);
    if(col && col.num){ const n = parseFloat(String(leer(r, col)).replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? -Infinity : n; }
    return col ? norm(leer(r, col)) : "";
  };
  return rs.slice().sort(function(a, b){ const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * V.dir || (b.id - a.id); });
}

/* ---------- pintar ---------- */
function opcionesEstado(actual){
  return HDB.ESTADOS.map(function(e){ return '<option value="' + e[0] + '"' + (e[0] === actual ? " selected" : "") + ">" + esc(e[1]) + "</option>"; }).join("");
}
function pintar(){
  const filas = ordenar(filtrar(V.todos));
  V.filas = filas;
  const visibles = V.todos.filter(function(r){ return !r.eliminado; }).length;
  $("cuenta").textContent = filas.length + " de " + visibles + " cliente" + (visibles === 1 ? "" : "s") + (V.elim ? " (eliminados)" : "");
  $("vacio").hidden = filas.length > 0;
  $("tablaCaja").hidden = !filas.length;
  const fl = function(k){ return V.campo === k ? (V.dir > 0 ? " ▲" : " ▼") : ""; };
  let h = '<thead><tr><th class="col-sel"><input type="checkbox" id="selTodo" title="Seleccionar todo lo visible"></th>' +
          '<th class="col-id" data-orden="id">#' + fl("id") + "</th>" +
          COLS.map(function(c){ return '<th data-orden="' + c.k + '">' + esc(c.h) + fl(c.k) + "</th>"; }).join("") +
          '<th data-orden="estado">Tipificación' + fl("estado") + '</th><th data-orden="agenda">Agenda' + fl("agenda") + "</th><th>Acciones</th></tr></thead><tbody>";
  filas.forEach(function(r){
    const ag = agendaEstado(r);
    h += '<tr data-id="' + r.id + '" class="' + (r.eliminado ? "eliminada " : "") + (V.sel.has(r.id) ? "sel " : "") + (ag === "vencida" ? "vencida" : "") + '">' +
      '<td class="col-sel"><input type="checkbox" class="selFila"' + (V.sel.has(r.id) ? " checked" : "") + "></td>" +
      '<td class="col-id">' + r.id + '<span class="estrella' + (r.fav ? " on" : "") + '" title="Favorito">★</span></td>' +
      COLS.map(function(c, i){
        const v = leer(r, c);
        return '<td data-col="' + c.k + '" data-ref="' + letra(i) + r.id + '" class="' + (c.num ? "num" : "") + (c.obs ? " obs" : "") + '" title="' + esc(v) + '">' + esc(v) + "</td>";
      }).join("") +
      '<td><select class="tipif ' + (HDB.TONO[r.estado] || "neutro") + '">' + opcionesEstado(r.estado) + "</select></td>" +
      '<td><span class="ag ' + ag + '">' + (r.agenda && r.agenda.fecha ? esc(r.agenda.fecha.split("-").reverse().join("/") + " " + (r.agenda.hora || "")) : "") + "</span></td>" +
      '<td class="col-acc">' +
        '<button data-acc="agenda" class="' + (r.agenda ? "tiene" : "") + '" title="Agendar llamada">📅</button>' +
        '<button data-acc="editar" title="Editar datos">✎</button>' +
        (r.eliminado ? '<button data-acc="restaurar" title="Restaurar">♻</button>' : '<button data-acc="eliminar" title="Eliminar (se puede restaurar)">🗑</button>') +
        '<button data-acc="menu" title="Más acciones">⋮</button>' +
      "</td></tr>";
  });
  $("tabla").innerHTML = h + "</tbody>";
  const todo = $("selTodo");
  if(todo) todo.checked = filas.length > 0 && filas.every(function(r){ return V.sel.has(r.id); });
  pintarMasiva();
}
function pintarMasiva(){
  const n = V.sel.size;
  $("masiva").hidden = n === 0;
  $("masivaCuenta").textContent = n + " seleccionado" + (n === 1 ? "" : "s");
}

let cargando = null;
function recargar(){
  if(cargando) return cargando;
  cargando = HDB.todos().then(function(rs){
    V.todos = rs;
    const ids = new Set(rs.map(function(r){ return r.id; }));
    V.sel.forEach(function(id){ if(!ids.has(id)) V.sel.delete(id); });
    pintar();
  }).finally(function(){ cargando = null; });
  return cargando;
}
let recargaT = null;
HDB.alCambiar(function(){ clearTimeout(recargaT); recargaT = setTimeout(recargar, 250); });
// La agenda vence con el reloj: repintar cada minuto
setInterval(pintar, 60000);

function porId(id){ return V.todos.find(function(r){ return r.id === id; }); }
function idDe(el){ const tr = el.closest("tr[data-id]"); return tr ? parseInt(tr.getAttribute("data-id"), 10) : null; }

/* ---------- clics en la tabla ---------- */
$("tabla").addEventListener("click", function(e){
  const th = e.target.closest("th[data-orden]");
  if(th){
    const k = th.getAttribute("data-orden");
    if(V.campo === k) V.dir = -V.dir; else { V.campo = k; V.dir = k === "fecha" || k === "ultima" ? -1 : 1; }
    pintar(); return;
  }
  if(e.target.id === "selTodo"){
    V.filas.forEach(function(r){ if(e.target.checked) V.sel.add(r.id); else V.sel.delete(r.id); });
    pintar(); return;
  }
  const id = idDe(e.target);
  if(id == null) return;
  if(e.target.classList.contains("selFila")){
    if(e.target.checked) V.sel.add(id); else V.sel.delete(id);
    e.target.closest("tr").classList.toggle("sel", e.target.checked);
    pintarMasiva(); return;
  }
  if(e.target.classList.contains("estrella")){
    const r = porId(id); HDB.actualizar(id, {fav: !r.fav}); return;
  }
  const b = e.target.closest("button[data-acc]");
  if(b){ accion(b.getAttribute("data-acc"), id, b); return; }
  const td = e.target.closest("td[data-col]");
  if(td){
    const prev = $("tabla").querySelector("td.activa"); if(prev) prev.classList.remove("activa");
    td.classList.add("activa");
    $("celdaRef").textContent = td.getAttribute("data-ref");
    $("celdaVal").textContent = td.textContent;
    if(td.classList.contains("obs")){ abrirObs(id); return; }
    // Copiado al pinchar, como en la planilla de Equifax
    if(td.textContent.trim() && navigator.clipboard){
      const col = COLS.find(function(c){ return c.k === td.getAttribute("data-col"); });
      navigator.clipboard.writeText(td.textContent).then(function(){ toast((col ? col.h : "Dato") + " copiado"); }, function(){});
    }
  }
});
$("tabla").addEventListener("change", function(e){
  if(!e.target.classList.contains("tipif")) return;
  const id = idDe(e.target);
  const r = porId(id);
  const patch = {estado: e.target.value};
  // Salir de "Agendado" a otra tipificación quita la agenda
  if(r && r.agenda && e.target.value !== "agendado" && e.target.value !== "agendado_futuro") patch.agenda = null;
  HDB.actualizar(id, patch, "tipificado").then(function(){ toast("Tipificación: " + HDB.ETIQUETA[e.target.value]); });
});
// Doble clic: editar en la misma celda
$("tabla").addEventListener("dblclick", function(e){
  const td = e.target.closest("td[data-col]");
  if(!td) return;
  const col = COLS.find(function(c){ return c.k === td.getAttribute("data-col"); });
  if(!col || !col.campo || col.obs) return;
  const id = idDe(td), r = porId(id), actual = col.campo.indexOf("cliente.") === 0 ? ((r.cliente || {})[col.campo.slice(8)] || "") : (r[col.campo] || "");
  td.innerHTML = '<input class="editor" value="' + esc(actual) + '">';
  const inp = td.querySelector("input"); inp.focus(); inp.select();
  let hecho = false;
  function cerrar(guardar){
    if(hecho) return; hecho = true;
    const nv = inp.value.trim();
    if(guardar && nv !== actual){
      const patch = {};
      if(col.campo.indexOf("cliente.") === 0){ patch.cliente = {}; patch.cliente[col.campo.slice(8)] = nv; } else patch[col.campo] = nv;
      HDB.actualizar(id, patch, "editado").then(function(){ toast("Actualizado"); });
    }else pintar();
  }
  inp.addEventListener("keydown", function(ev){ if(ev.key === "Enter"){ ev.preventDefault(); cerrar(true); } else if(ev.key === "Escape"){ ev.preventDefault(); cerrar(false); } });
  inp.addEventListener("blur", function(){ cerrar(true); });
});

/* ---------- acciones por fila ---------- */
function accion(a, id, boton){
  if(a === "agenda") abrirAgenda(id);
  else if(a === "editar") abrirEditar(id);
  else if(a === "eliminar") confirmar("🗑 Eliminar cliente", "Se oculta de la planilla, pero no se borra: puedes verlo con <b>Eliminados</b> y restaurarlo cuando quieras.", "🗑 Eliminar", function(){ HDB.eliminar(id).then(function(){ toast("Eliminado (se puede restaurar)"); }); });
  else if(a === "restaurar") HDB.restaurar(id).then(function(){ toast("Restaurado"); });
  else if(a === "menu") abrirMenu(id, boton);
}
function abrirMenu(id, boton){
  const r = porId(id), m = $("menuFila");
  m.innerHTML =
    '<button data-m="editar">✎ Editar datos…</button>' +
    '<button data-m="agenda">📅 Agendar llamada…</button>' +
    '<button data-m="obs">📝 Observación…</button>' +
    '<button data-m="hist">🕘 Historial de cambios</button>' +
    '<button data-m="duplicar">⧉ Duplicar</button>' +
    '<button data-m="exportar">⬇ Exportar solo este</button>' +
    '<button data-m="fav">' + (r.fav ? "☆ Quitar de favoritos" : "★ Marcar favorito") + "</button>" +
    (r.eliminado ? '<button data-m="restaurar">♻ Restaurar</button>' : '<button data-m="eliminar" class="peligro">🗑 Eliminar</button>');
  m.dataset.id = id;
  const b = boton.getBoundingClientRect();
  m.style.top = Math.min(b.bottom + 4, window.innerHeight - 320) + "px";
  m.style.left = Math.max(8, Math.min(b.right - 230, window.innerWidth - 240)) + "px";
  m.classList.add("on");
}
$("menuFila").addEventListener("click", function(e){
  const b = e.target.closest("button[data-m]"); if(!b) return;
  const id = parseInt(this.dataset.id, 10), r = porId(id), q = b.getAttribute("data-m");
  this.classList.remove("on");
  if(q === "editar") abrirEditar(id);
  else if(q === "agenda") abrirAgenda(id);
  else if(q === "obs") abrirObs(id);
  else if(q === "hist") abrirHist(id);
  else if(q === "duplicar") HDB.duplicar(id).then(function(n){ toast("Duplicado como #" + n); });
  else if(q === "exportar") descargar(JSON.stringify({formato: "dental-historial", version: 1, exportadoEn: new Date().toISOString(), total: 1, registros: [r]}, null, 1), "cliente-" + id + ".json", "application/json");
  else if(q === "fav") HDB.actualizar(id, {fav: !r.fav});
  else accion(q, id);
});
document.addEventListener("click", function(e){ if(!e.target.closest("#menuFila") && !e.target.closest('[data-acc="menu"]')) $("menuFila").classList.remove("on"); });

/* ---------- ventanas ---------- */
function abrir(id){ $(id).classList.add("on"); }
function cerrarTodo(){ document.querySelectorAll(".modal.on").forEach(function(m){ m.classList.remove("on"); }); $("menuFila").classList.remove("on"); }
document.querySelectorAll(".modal").forEach(function(m){
  m.addEventListener("click", function(e){ if(e.target === m || e.target.closest("[data-cerrar]")) m.classList.remove("on"); });
});
document.addEventListener("keydown", function(e){
  if(e.key !== "Escape") return;
  if(document.querySelector(".modal.on")) cerrarTodo();
  else if(V.sel.size){ V.sel.clear(); pintar(); }
});
let confirmarFn = null;
function confirmar(titulo, html, boton, fn){
  $("mConfTit").textContent = titulo; $("mConfTexto").innerHTML = html; $("mConfOk").textContent = boton;
  confirmarFn = fn; abrir("mConfirmar");
}
$("mConfOk").addEventListener("click", function(){ $("mConfirmar").classList.remove("on"); if(confirmarFn) confirmarFn(); confirmarFn = null; });

// Editar datos: todos los campos del cliente
const CAMPOS_EDITAR = [["rut", "RUT"], ["nombre", "Nombres"], ["apellido", "Apellidos"], ["fono", "Teléfono"], ["fono2", "Teléfono 2"],
  ["email", "Correo"], ["direccion", "Dirección"], ["comuna", "Comuna"], ["ciudad", "Ciudad"], ["region", "Región"],
  ["fechaNac", "Fecha de nacimiento"], ["genero", "Sexo (M/F)"], ["cta", "Cta. Cte. (últimos dígitos)"],
  ["ciclo", "Ciclo de vida"], ["propension", "Propensión"], ["seguros", "Seguros actuales"]];
let editId = null;
function abrirEditar(id){
  const r = porId(id); if(!r) return;
  editId = id;
  const c = r.cliente || {};
  $("mEditarTit").textContent = "✎ Editar #" + id + " — " + nombrePropio([c.nombre, c.apellido].join(" "));
  $("mEditarCuerpo").innerHTML = '<div class="rejilla">' +
    CAMPOS_EDITAR.map(function(x){ return '<label>' + x[1] + '<input data-c="' + x[0] + '" value="' + esc(c[x[0]] || "") + '"></label>'; }).join("") +
    '<label>Tipificación<select data-r="estado">' + opcionesEstado(r.estado) + "</select></label>" +
    '<label>Ejecutivo<input data-r="ejecutivo" value="' + esc(r.ejecutivo || "") + '"></label>' +
    '<label>Lead<input data-r="lead" value="' + esc(r.lead || "") + '"></label>' +
    '<label class="ancho">Observación<textarea data-r="observacion" rows="3">' + esc(r.observacion || "") + "</textarea></label>" +
    "</div>" +
    (r.cotizacion ? '<p class="nota">Cotización: <b>' + esc(r.cotizacion.plan) + "</b> · " + esc(r.cotizacion.compos) + " · " + esc(r.cotizacion.uf) + " · " + esc(r.cotizacion.clp) +
      (r.cotizacion.envio ? " · póliza " + esc(r.cotizacion.envio) : "") + "</p>" : "") +
    ((r.cargas || []).length ? '<p class="nota">Cargas: ' + r.cargas.map(function(x){ return esc([nombrePropio(x.nombre), x.parentesco ? "(" + nombrePropio(x.parentesco) + ")" : "", x.fecha].filter(Boolean).join(" ")); }).join(" · ") + "</p>" : "");
  abrir("mEditar");
}
$("mEditarGuardar").addEventListener("click", function(){
  const r = porId(editId); if(!r) return;
  const patch = {cliente: {}};
  $("mEditarCuerpo").querySelectorAll("[data-c]").forEach(function(el){
    const k = el.getAttribute("data-c"), v = el.value.trim();
    if(v !== ((r.cliente || {})[k] || "")) patch.cliente[k] = v;
  });
  if(!Object.keys(patch.cliente).length) delete patch.cliente;
  $("mEditarCuerpo").querySelectorAll("[data-r]").forEach(function(el){
    const k = el.getAttribute("data-r"), v = el.value.trim();
    if(v !== (r[k] || "")) patch[k] = v;
  });
  $("mEditar").classList.remove("on");
  if(Object.keys(patch).length) HDB.actualizar(editId, patch, "editado").then(function(){ toast("Datos guardados"); });
});

// Historial de cambios de una fila
const NOMBRES_CAMPO = {estado: "Tipificación", observacion: "Observación", ejecutivo: "Ejecutivo", agenda: "Agenda", cotizacion: "Cotización", eliminado: "Eliminado"};
CAMPOS_EDITAR.forEach(function(x){ NOMBRES_CAMPO[x[0]] = x[1]; });
function abrirHist(id){
  const r = porId(id); if(!r) return;
  $("mHistTit").textContent = "🕘 Historial #" + id + " — " + nombrePropio([(r.cliente || {}).nombre, (r.cliente || {}).apellido].join(" "));
  const ll = (r.llamadas || []).map(fechaHora).join(" · ");
  $("mHistCuerpo").innerHTML = '<p class="nota"><b>Llamadas registradas (' + (r.llamadas || []).length + "):</b> " + esc(ll) + "</p>" +
    (r.historial || []).slice().reverse().map(function(h){
      const ks = Object.keys(h.cambios || {});
      return '<div class="hist-it"><b>' + esc(h.accion) + "</b><small>" + esc(fechaHora(h.ts)) + (h.quien ? " · " + esc(h.quien) : "") + "</small>" +
        (ks.length ? "<ul>" + ks.map(function(k){
          let a = h.cambios[k][0], b = h.cambios[k][1];
          if(k === "estado"){ a = HDB.ETIQUETA[a] || a; b = HDB.ETIQUETA[b] || b; }
          return "<li>" + esc(NOMBRES_CAMPO[k] || k) + ": <del>" + esc(a || "—") + "</del> → <ins>" + esc(b || "—") + "</ins></li>";
        }).join("") + "</ul>" : "") + "</div>";
    }).join("");
  abrir("mHist");
}

// Agenda
let agId = null;
function abrirAgenda(id){
  const r = porId(id); if(!r) return;
  agId = id;
  $("mAgendaTit").textContent = "📅 Agendar — " + nombrePropio([(r.cliente || {}).nombre, (r.cliente || {}).apellido].join(" "));
  $("agFecha").value = r.agenda ? r.agenda.fecha : hoyISO();
  $("agHora").value = r.agenda ? (r.agenda.hora || "10:00") : "10:00";
  $("agQuitar").hidden = !r.agenda;
  abrir("mAgenda");
}
$("agGuardar").addEventListener("click", function(){
  const r = porId(agId); if(!r || !$("agFecha").value) return;
  const anterior = r.agenda ? r.agenda.estadoAnterior : r.estado;
  HDB.actualizar(agId, {agenda: {fecha: $("agFecha").value, hora: $("agHora").value, estadoAnterior: anterior}, estado: "agendado"}, "agendado")
    .then(function(){ toast("Agendado"); });
  $("mAgenda").classList.remove("on");
});
$("agQuitar").addEventListener("click", function(){
  const r = porId(agId); if(!r) return;
  HDB.actualizar(agId, {agenda: null, estado: (r.agenda && r.agenda.estadoAnterior) || "sin_tipificar"}, "agenda quitada").then(function(){ toast("Agenda quitada"); });
  $("mAgenda").classList.remove("on");
});

// Observación
let obsId = null;
function abrirObs(id){
  const r = porId(id); if(!r) return;
  obsId = id;
  $("mObsTit").textContent = "📝 Observación — " + nombrePropio([(r.cliente || {}).nombre, (r.cliente || {}).apellido].join(" "));
  $("obsTexto").value = r.observacion || "";
  abrir("mObs");
  setTimeout(function(){ $("obsTexto").focus(); }, 50);
}
$("obsGuardar").addEventListener("click", function(){
  HDB.actualizar(obsId, {observacion: $("obsTexto").value.trim()}, "observación").then(function(){ toast("Observación guardada"); });
  $("mObs").classList.remove("on");
});

/* ---------- acciones masivas ---------- */
HDB.ESTADOS.forEach(function(e){
  $("masivaEstado").insertAdjacentHTML("beforeend", '<option value="' + e[0] + '">' + esc(e[1]) + "</option>");
  $("fEstado").insertAdjacentHTML("beforeend", '<option value="' + e[0] + '">' + esc(e[1]) + "</option>");
});
$("masivaEstado").addEventListener("change", function(){
  const v = this.value; if(!v) return;
  const ids = Array.from(V.sel);
  Promise.all(ids.map(function(id){ return HDB.actualizar(id, {estado: v}, "tipificado (en grupo)"); }))
    .then(function(){ toast(ids.length + " tipificados como " + HDB.ETIQUETA[v]); });
  this.value = "";
});
$("masivaEliminar").addEventListener("click", function(){
  const ids = Array.from(V.sel);
  confirmar("🗑 Eliminar " + ids.length + " cliente(s)", "Se ocultan, pero no se borran: puedes verlos con <b>Eliminados</b> y restaurarlos.", "🗑 Eliminar", function(){
    Promise.all(ids.map(function(id){ return HDB.eliminar(id); })).then(function(){ V.sel.clear(); toast(ids.length + " eliminados (se pueden restaurar)"); });
  });
});
$("masivaRestaurar").addEventListener("click", function(){
  const ids = Array.from(V.sel);
  Promise.all(ids.map(function(id){ return HDB.restaurar(id); })).then(function(){ V.sel.clear(); toast(ids.length + " restaurados"); });
});
$("masivaExcel").addEventListener("click", function(){ exportarExcel(V.todos.filter(function(r){ return V.sel.has(r.id); }), "seleccion"); });
$("masivaQuitar").addEventListener("click", function(){ V.sel.clear(); pintar(); });

/* ---------- filtros ---------- */
let buscarT = null;
$("buscar").addEventListener("input", function(){ const v = this.value; clearTimeout(buscarT); buscarT = setTimeout(function(){ V.q = v; pintar(); }, 150); });
$("fEstado").addEventListener("change", function(){ V.estado = this.value; pintar(); });
$("fAgenda").addEventListener("change", function(){ V.agenda = this.value; pintar(); });
$("fFav").addEventListener("change", function(){ V.fav = this.checked; pintar(); });
$("fElim").addEventListener("change", function(){ V.elim = this.checked; V.sel.clear(); pintar(); });

/* ---------- exportar ---------- */
function descargar(texto, nombre, tipo){
  const url = URL.createObjectURL(new Blob([texto], {type: tipo}));
  const a = document.createElement("a"); a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
}
function columnasExportar(){
  return COLS.concat([
    {k: "estado", h: "Tipificación", v: function(r){ return HDB.ETIQUETA[r.estado] || ""; }},
    {k: "agenda", h: "Agenda", v: function(r){ return r.agenda && r.agenda.fecha ? r.agenda.fecha.split("-").reverse().join("/") + " " + (r.agenda.hora || "") : ""; }},
    {k: "direccion", h: "Dirección", campo: "cliente.direccion"}, {k: "region", h: "Región", campo: "cliente.region"},
    {k: "fechaNac", h: "Fecha de nacimiento", campo: "cliente.fechaNac"}, {k: "envio", h: "Envío póliza", v: function(r){ return r.cotizacion ? r.cotizacion.envio || "" : ""; }},
    {k: "ciclo", h: "Ciclo de vida", campo: "cliente.ciclo"}, {k: "propension", h: "Propensión", campo: "cliente.propension"},
    {k: "seguros", h: "Seguros actuales", campo: "cliente.seguros"}, {k: "fav", h: "Favorito", v: function(r){ return r.fav ? "sí" : ""; }}
  ]);
}
function exportarExcel(rs, sufijo){
  const cols = columnasExportar();
  const head = "<tr><th>#</th>" + cols.map(function(c){ return '<th style="background:#217346;color:#fff;">' + esc(c.h) + "</th>"; }).join("") + "</tr>";
  const body = rs.map(function(r){ return "<tr><td>" + r.id + "</td>" + cols.map(function(c){ return '<td style="mso-number-format:\'@\'">' + esc(leer(r, c)) + "</td>"; }).join("") + "</tr>"; }).join("");
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1" cellspacing="0">' + head + body + "</table></body></html>";
  descargar("﻿" + html, "historial-dental-" + hoyISO() + (sufijo ? "-" + sufijo : "") + ".xls", "application/vnd.ms-excel");
  toast("Exportado a Excel (" + rs.length + " fila" + (rs.length === 1 ? "" : "s") + ")");
}
$("bExcel").addEventListener("click", function(){ exportarExcel(V.filas); });
$("bCsv").addEventListener("click", function(){
  const cols = columnasExportar();
  const q = function(v){ v = String(v == null ? "" : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const lineas = [["#"].concat(cols.map(function(c){ return c.h; })).map(q).join(";")]
    .concat(V.filas.map(function(r){ return [r.id].concat(cols.map(function(c){ return leer(r, c); })).map(q).join(";"); }));
  descargar("﻿" + lineas.join("\r\n"), "historial-dental-" + hoyISO() + ".csv", "text/csv");
  toast("Exportado a CSV (" + V.filas.length + " filas)");
});
$("bExportar").addEventListener("click", function(){
  HDB.exportar().then(function(d){ descargar(JSON.stringify(d), "historial-dental-base-" + hoyISO() + ".json", "application/json"); toast("Base exportada (" + d.total + " registros)"); });
});

/* ---------- importar (JSON propio o CSV) ---------- */
$("bImportar").addEventListener("click", function(){ $("archivo").click(); });
$("archivo").addEventListener("change", function(){
  const f = this.files && this.files[0]; this.value = "";
  if(!f) return;
  f.text().then(function(t){
    let lista;
    if(/\.json$/i.test(f.name) || /^\s*[\[{]/.test(t)){
      try{ lista = JSON.parse(t); }catch(e){ toast("El archivo no es un respaldo válido"); return; }
    }else lista = desdeCsv(t);
    const n = Array.isArray(lista) ? lista.length : ((lista && lista.registros) || []).length;
    confirmar("📥 Importar " + n + " registro(s)", "Se agregan los nuevos y, si alguno ya existe, se queda con la versión más reciente. <b>No se borra nada.</b> Antes se guarda un punto de restauración.", "📥 Importar", function(){
      HDB.respaldar("antes de importar " + f.name).then(function(){ return HDB.importar(lista); }).then(function(res){
        toast("Importado: " + res.nuevos + " nuevos, " + res.actualizados + " actualizados, " + res.iguales + " sin cambios");
      });
    });
  });
});
// CSV con encabezados (separador ; o ,). Reconoce los nombres más comunes.
function desdeCsv(t){
  t = t.replace(/^﻿/, "");
  const sep = (t.split("\n")[0].match(/;/g) || []).length >= (t.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for(let i = 0; i < t.length; i++){
    const ch = t[i];
    if(comillas){ if(ch === '"' && t[i + 1] === '"'){ campo += '"'; i++; } else if(ch === '"') comillas = false; else campo += ch; }
    else if(ch === '"') comillas = true;
    else if(ch === sep){ fila.push(campo); campo = ""; }
    else if(ch === "\n"){ fila.push(campo.replace(/\r$/, "")); filas.push(fila); fila = []; campo = ""; }
    else campo += ch;
  }
  if(campo || fila.length){ fila.push(campo); filas.push(fila); }
  if(filas.length < 2) return [];
  const cab = filas[0].map(function(h){ return norm(h).replace(/[^a-z0-9]/g, ""); });
  const MAPA = {rut: "rut", nombres: "nombre", nombre: "nombre", apellidos: "apellido", apellido: "apellido", apellidopat: "apellido",
    telefono: "fono", fono: "fono", fono1: "fono", celular: "fono", telefono2: "fono2", fono2: "fono2", correo: "email", email: "email",
    comuna: "comuna", ciudad: "ciudad", region: "region", direccion: "direccion", fechadenacimiento: "fechaNac", fechanac: "fechaNac"};
  const estPorEtiqueta = {};
  HDB.ESTADOS.forEach(function(e){ estPorEtiqueta[norm(e[1])] = e[0]; estPorEtiqueta[e[0]] = e[0]; });
  return filas.slice(1).filter(function(f){ return f.some(function(x){ return x.trim(); }); }).map(function(f){
    const r = {cliente: {}, creado: Date.now(), actualizado: Date.now()};
    cab.forEach(function(h, i){
      const v = (f[i] || "").trim(); if(!v) return;
      if(MAPA[h]) r.cliente[MAPA[h]] = r.cliente[MAPA[h]] ? r.cliente[MAPA[h]] + " " + v : v;
      else if(h === "apellidomat") r.cliente.apellido = (r.cliente.apellido ? r.cliente.apellido + " " : "") + v;
      else if(h === "tipificacion" || h === "estado") r.estado = estPorEtiqueta[norm(v)] || "sin_tipificar";
      else if(h === "observacion" || h === "nota") r.observacion = v;
      else if(h === "lead" || h === "leadid") r.lead = v;
      else if(h === "ejecutivo") r.ejecutivo = v;
    });
    return r;
  });
}

/* ---------- duplicados ---------- */
$("bDuplicados").addEventListener("click", function(){
  confirmar("🧹 Eliminar duplicados", "Se deja una sola fila por cliente (mismo RUT): la más reciente, sumándole las llamadas de las otras. Las demás se ocultan y se pueden restaurar desde <b>Eliminados</b>.", "🧹 Consolidar", function(){
    HDB.respaldar("antes de consolidar duplicados").then(HDB.consolidarDuplicados).then(function(res){
      toast(res.grupos ? res.grupos + " cliente(s) consolidados, " + res.ocultos + " fila(s) ocultas" : "No hay duplicados");
    });
  });
});

/* ---------- respaldos ---------- */
function pintarRespaldos(){
  Promise.all([HDB.configRespaldo(), HDB.listarRespaldos(), HDB.meta("ultimoArchivo")]).then(function(x){
    const cfg = x[0], lista = x[1], ua = x[2];
    $("rAuto").checked = cfg.auto; $("rCada").value = cfg.cadaHoras; $("rMax").value = cfg.maximo; $("rArchivo").checked = cfg.archivo;
    $("rUltimo").innerHTML = ua ? "Último archivo en Descargas/DENTAL-respaldos: <b>historial-dental-" + esc(ua.fecha) + ".json</b> (" + ua.total + " registros, " + fechaHora(ua.ts) + ")." : "Aún no se ha guardado ningún archivo de respaldo.";
    $("rLista").innerHTML = lista.length ? lista.map(function(p){
      return '<div class="it"><span><b>' + esc(fechaHora(new Date(p.ts).getTime())) + "</b> · " + esc(p.motivo) + " · " + p.total + ' registros</span>' +
        '<button data-r-bajar="' + esc(p.ts) + '">⬇ Descargar</button><button data-r-rest="' + esc(p.ts) + '">♻ Restaurar</button></div>';
    }).join("") : '<div class="it"><span>Aún no hay puntos de restauración.</span></div>';
  });
}
$("bRespaldos").addEventListener("click", function(){ pintarRespaldos(); abrir("mRespaldos"); });
$("rGuardarCfg").addEventListener("click", function(){
  HDB.meta("cfgRespaldo", {auto: $("rAuto").checked, cadaHoras: Math.max(1, parseInt($("rCada").value, 10) || 24),
                           maximo: Math.max(1, parseInt($("rMax").value, 10) || 30), archivo: $("rArchivo").checked})
    .then(function(){ toast("Configuración guardada"); pintarRespaldos(); });
});
$("rCrear").addEventListener("click", function(){ HDB.respaldar("manual").then(function(){ toast("Punto de restauración creado"); pintarRespaldos(); }); });
$("rArchivoAhora").addEventListener("click", function(){
  try{
    chrome.runtime.sendMessage({tipo: "respaldoArchivo", motivo: "manual"}, function(r){
      if(chrome.runtime.lastError || !r || r.error) toast("No se pudo guardar el archivo");
      else { toast("Archivo guardado en Descargas/DENTAL-respaldos (" + r.total + " registros)"); pintarRespaldos(); }
    });
  }catch(e){ toast("No se pudo guardar el archivo"); }
});
$("rLista").addEventListener("click", function(e){
  const b = e.target.closest("button"); if(!b) return;
  const ts = b.getAttribute("data-r-bajar") || b.getAttribute("data-r-rest");
  if(b.hasAttribute("data-r-bajar")){
    HDB.leerRespaldo(ts).then(function(d){ if(d) descargar(JSON.stringify(d), "historial-dental-punto-" + ts.slice(0, 16).replace(/[:T]/g, "-") + ".json", "application/json"); });
  }else{
    confirmar("♻ Restaurar punto", "Se recuperan los registros de ese momento (y su versión de cada cliente si es más reciente). <b>No se borra lo que se agregó después.</b> Antes se guarda un punto con lo actual.", "♻ Restaurar", function(){
      HDB.restaurarRespaldo(ts).then(function(res){ toast(res ? "Restaurado: " + res.nuevos + " recuperados, " + res.actualizados + " actualizados" : "No se pudo restaurar"); pintarRespaldos(); });
    });
  }
});

/* ---------- letra y tema ---------- */
function prefs(){ try{ return JSON.parse(localStorage.getItem("historialPrefs") || "{}"); }catch(e){ return {}; } }
function guardarPrefs(p){ try{ localStorage.setItem("historialPrefs", JSON.stringify(Object.assign(prefs(), p))); }catch(e){} }
function aplicarPrefs(){
  const p = prefs(), f = p.letra || "grande";
  document.body.classList.remove("f-normal", "f-grande", "f-xl");
  document.body.classList.add("f-" + f);
  document.querySelectorAll(".grupo [data-f]").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-f") === f); });
  document.body.classList.toggle("oscuro", !!p.oscuro);
  $("tema").textContent = p.oscuro ? "☀ Tema claro" : "🌙 Tema oscuro";
}
document.querySelectorAll(".grupo [data-f]").forEach(function(b){ b.addEventListener("click", function(){ guardarPrefs({letra: b.getAttribute("data-f")}); aplicarPrefs(); }); });
$("tema").addEventListener("click", function(){ guardarPrefs({oscuro: !prefs().oscuro}); aplicarPrefs(); });

aplicarPrefs();
recargar();
