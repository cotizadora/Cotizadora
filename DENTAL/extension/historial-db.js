/* ============================================================
   HISTORIAL DE CLIENTES — base de datos permanente
   Cada cliente que cae en Vicidial queda registrado aquí, para
   siempre. La comparten:
   - el service worker (captura automática desde Vicidial y
     respaldos diarios),
   - la cotizadora (plan cotizado, tipificación y nota),
   - la pestaña Historial (la planilla).

   IndexedDB del origen de la extensión, con "unlimitedStorage".
   Nada se borra de verdad: "eliminar" sólo oculta (eliminado:true)
   y se puede restaurar. Cada cambio queda en registro.historial.

   Registro:
   { id, lead, creado, actualizado, llamadas:[ts], ejecutivo,
     cliente:{rut,nombre,apellido,fono,fono2,email,direccion,comuna,
              ciudad,region,fechaNac,genero,ciclo,propension,seguros,cta},
     cargas:[{nombre,parentesco,fecha}],
     cotizacion:{plan,compos,uf,clp,envio,edades,cuando} | null,
     estado, agenda:{fecha,hora,estadoAnterior} | null,
     observacion, fav, eliminado, editados:{campo:true},
     historial:[{ts,accion,quien,cambios}] }
   ============================================================ */

/* ---------- utilidades de los datos de Vicidial ---------- */
// Fecha del FORM a dd/mm/aaaa; "DD/MM/YYYY" (vacío) o algo inválido -> ""
function fechaVici(v){
  v = String(v || "").trim();
  let m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if(m) return m[1].padStart(2, "0") + "/" + m[2].padStart(2, "0") + "/" + m[3];
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m && m[1] !== "0000") return m[3] + "/" + m[2] + "/" + m[1];
  return "";
}
// Formato chileno: 19758650 + 8 -> 19.758.650-8
function rutConPuntos(num, dv){
  num = String(num || "").replace(/[^0-9kK]/g, "");
  dv = String(dv || "").trim();
  if(!num) return "";
  if(!dv && num.length > 7){ dv = num.slice(-1); num = num.slice(0, -1); }
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dv ? "-" + dv.toUpperCase() : "");
}
// Campos crudos de la pantalla de Vicidial ({nombre_en_minúsculas: valor}) ->
// cliente. Lo de la pestaña FORM de la campaña manda; si viene vacío, los
// campos estándar de Vicidial. Los "0" se ignoran.
function clienteDesdeCampos(f, agente){
  function val(){ for(let i = 0; i < arguments.length; i++){ const v = f[arguments[i]]; if(v && v !== "0") return String(v).trim(); } return ""; }
  const ap = [val("apellido_pat"), val("apellido_mat")].filter(Boolean).join(" ");
  const c = {
    lead: val("lead_id"),
    nombre: val("nombres", "nombre", "first_name"),
    apellido: ap || val("apellidos", "last_name"),
    rut: val("rut") ? rutConPuntos(val("rut"), val("dv")) : rutConPuntos(val("vendor_lead_code")),
    fono: val("fono1", "phone_number"),
    fono2: val("fono2", "alt_phone"),
    comuna: val("comuna", "province"),
    ciudad: val("ciudad", "city"),
    region: val("region", "state"),
    email: val("email"),
    genero: (val("sexo", "gender").charAt(0) || "").toUpperCase(),
    apellidoPat: val("apellido_pat") || val("last_name").split(" ")[0] || "",
    direccion: val("direccion", "address1"),
    fechaNac: fechaVici(val("fecha_nac", "date_of_birth")),
    cta: val("cta_cte"),
    ciclo: val("ciclo_vida"),
    propension: val("propension"),
    seguros: val("seguros_actuales"),
    mesSinCosto: val("mes_sin_costo"),
    agente: agente || "",
    cargas: []
  };
  c.info = [["Ciclo de vida", c.ciclo], ["Propensión", c.propension], ["Seguros actuales", c.seguros], ["Mes sin costo", c.mesSinCosto]]
           .filter(function(x){ return x[1]; });
  for(let i = 1; i <= 4; i++){
    const fecha = fechaVici(val("fec_nac" + i)), nombre = val("carga" + i), parentesco = val("parentesco" + i), rut = val("rut" + i);
    if(fecha || nombre || rut) c.cargas.push({fecha: fecha, nombre: nombre, parentesco: parentesco});
  }
  return c;
}

/* ---------- la base ---------- */
const HDB = (function(){
  const NOMBRE = "dental_historial", VERSION = 1;
  const CAMPOS_CLIENTE = ["rut", "nombre", "apellido", "fono", "fono2", "email", "direccion", "comuna", "ciudad",
                          "region", "fechaNac", "genero", "ciclo", "propension", "seguros", "cta"];
  // Una misma persona que vuelve a caer después de este tiempo cuenta como otra llamada
  const NUEVA_LLAMADA = 30 * 60 * 1000;

  // Tipificaciones: las de la cotizadora de Equifax, adaptadas al seguro dental.
  // tono: bueno / neutro / malo (colores en la planilla y la cotizadora).
  const ESTADOS = [
    ["sin_tipificar",   "Sin tipificar",                 "neutro"],
    ["venta",           "Venta cerrada",                 "bueno"],
    ["interesado",      "Cliente interesado",            "bueno"],
    ["link_enviado",    "Link de pago enviado",          "bueno"],
    ["negociacion",     "En negociación",                "bueno"],
    ["agendado",        "Agendado",                      "neutro"],
    ["agendado_futuro", "Agendado para llamar a futuro", "neutro"],
    ["no_contesta",     "No contesta",                   "neutro"],
    ["buzon_voz",       "Buzón de voz",                  "neutro"],
    ["no_quiere",       "No quiere",                     "malo"],
    ["ya_tiene",        "Ya tiene seguro dental",        "malo"],
    ["no_califica",     "No califica",                   "malo"],
    ["cliente_molesto", "Cliente molesto",               "malo"],
    ["corta_llamada",   "Corta llamada",                 "malo"],
    ["numero_equivocado","Número equivocado",            "malo"]
  ];
  const ETIQUETA = {}, TONO = {};
  ESTADOS.forEach(function(e){ ETIQUETA[e[0]] = e[1]; TONO[e[0]] = e[2]; });

  let dbp = null;
  function abrir(){
    if(dbp) return dbp;
    dbp = new Promise(function(res, rej){
      const req = indexedDB.open(NOMBRE, VERSION);
      req.onupgradeneeded = function(e){
        const db = e.target.result;
        const os = db.createObjectStore("clientes", {keyPath: "id", autoIncrement: true});
        os.createIndex("lead", "lead", {unique: false});
        os.createIndex("rut", "cliente.rut", {unique: false});
        db.createObjectStore("respaldos", {keyPath: "ts"});
        db.createObjectStore("meta", {keyPath: "k"});
      };
      req.onsuccess = function(){ res(req.result); };
      req.onerror = function(){ dbp = null; rej(req.error); };
    });
    return dbp;
  }
  function tx(store, modo, fn){
    return abrir().then(function(db){
      return new Promise(function(res, rej){
        const t = db.transaction(store, modo), os = t.objectStore(store);
        let salida;
        Promise.resolve(fn(os, function(v){ salida = v; })).catch(rej);
        t.oncomplete = function(){ res(salida); };
        t.onerror = function(){ rej(t.error); };
        t.onabort = function(){ rej(t.error); };
      });
    });
  }
  function pedir(req){ return new Promise(function(res, rej){ req.onsuccess = function(){ res(req.result); }; req.onerror = function(){ rej(req.error); }; }); }

  // Aviso a las otras ventanas (planilla, cotizadora) de que algo cambió
  let canal = null;
  try{ canal = new BroadcastChannel("dental-historial"); }catch(e){}
  // El canal no le entrega el aviso a quien lo manda: la propia ventana se
  // entera por su lista local.
  const locales = [];
  function avisar(id){
    const m = {cambio: true, id: id || null};
    try{ canal && canal.postMessage(m); }catch(e){}
    locales.forEach(function(fn){ setTimeout(function(){ fn(m); }, 0); });
  }
  function alCambiar(fn){
    locales.push(fn);
    try{ canal && canal.addEventListener("message", function(e){ fn(e.data || {}); }); }catch(e){}
  }

  function todos(){ return tx("clientes", "readonly", function(os, fin){ return pedir(os.getAll()).then(fin); }); }
  function obtener(id){ return tx("clientes", "readonly", function(os, fin){ return pedir(os.get(id)).then(fin); }); }
  function porLead(lead){
    if(!lead) return Promise.resolve(null);
    return tx("clientes", "readonly", function(os, fin){
      return pedir(os.index("lead").getAll(String(lead))).then(function(rs){
        rs = (rs || []).filter(function(r){ return !r.eliminado; }).sort(function(a, b){ return b.actualizado - a.actualizado; });
        fin(rs[0] || null);
      });
    });
  }
  function guardar(reg){ return tx("clientes", "readwrite", function(os, fin){ return pedir(os.put(reg)).then(fin); }); }

  function nuevo(){
    const ahora = Date.now();
    return {lead: "", creado: ahora, actualizado: ahora, llamadas: [ahora], ejecutivo: "",
            cliente: {}, cargas: [], cotizacion: null, estado: "sin_tipificar", agenda: null,
            observacion: "", fav: false, eliminado: false, editados: {}, historial: []};
  }
  function diff(a, b){
    const cambios = {};
    ["estado", "observacion", "ejecutivo"].forEach(function(k){ if((a[k] || "") !== (b[k] || "")) cambios[k] = [a[k] || "", b[k] || ""]; });
    CAMPOS_CLIENTE.forEach(function(k){
      const x = (a.cliente || {})[k] || "", y = (b.cliente || {})[k] || "";
      if(x !== y) cambios[k] = [x, y];
    });
    const ag = function(r){ return r.agenda && r.agenda.fecha ? r.agenda.fecha + " " + (r.agenda.hora || "") : ""; };
    if(ag(a) !== ag(b)) cambios.agenda = [ag(a), ag(b)];
    const ct = function(r){ return r.cotizacion ? r.cotizacion.plan + " · " + r.cotizacion.compos + " · " + r.cotizacion.uf : ""; };
    if(ct(a) !== ct(b)) cambios.cotizacion = [ct(a), ct(b)];
    if(!!a.eliminado !== !!b.eliminado) cambios.eliminado = [a.eliminado ? "sí" : "no", b.eliminado ? "sí" : "no"];
    return cambios;
  }
  function anotar(reg, accion, cambios, quien){
    reg.historial = reg.historial || [];
    reg.historial.push({ts: Date.now(), accion: accion, quien: quien || reg.ejecutivo || "", cambios: cambios || {}});
  }

  /* Cliente leído de Vicidial -> crea o completa su registro.
     Lo que el ejecutivo editó a mano no se pisa. */
  function capturar(c, extra){
    extra = extra || {};
    if(!c || !(c.lead || c.rut || c.nombre)) return Promise.resolve(null);
    const buscar = c.lead ? porLead(c.lead) : Promise.resolve(null);
    return buscar.then(function(existente){
      const reg = existente ? JSON.parse(JSON.stringify(existente)) : nuevo();
      const antes = existente ? JSON.parse(JSON.stringify(existente)) : null;
      const ahora = Date.now();
      reg.lead = c.lead || reg.lead || "";
      const ejecutivo = extra.ejecutivo || c.agente || "";
      if(ejecutivo && (!reg.ejecutivo || /^\d+$/.test(reg.ejecutivo))) reg.ejecutivo = ejecutivo;
      CAMPOS_CLIENTE.forEach(function(k){
        const v = c[k];
        if(v && !reg.editados[k] && reg.cliente[k] !== v) reg.cliente[k] = v;
      });
      if(c.cargas && c.cargas.length && !reg.editados.cargas) reg.cargas = c.cargas;
      const ultima = reg.llamadas[reg.llamadas.length - 1] || 0;
      if(existente && ahora - ultima > NUEVA_LLAMADA) reg.llamadas.push(ahora);
      if(!existente){
        anotar(reg, "registrado", {}, ejecutivo);
      }else{
        const cambios = diff(antes, reg);
        if(!Object.keys(cambios).length && reg.llamadas.length === antes.llamadas.length) return existente;
        if(Object.keys(cambios).length) anotar(reg, "actualizado desde Vicidial", cambios, ejecutivo);
      }
      reg.actualizado = ahora;
      return guardar(reg).then(function(id){ reg.id = id; avisar(id); return reg; });
    });
  }

  /* Cambio hecho por el ejecutivo (planilla o cotizadora). patch puede traer
     cliente:{...}, cargas, cotizacion, estado, agenda, observacion, fav,
     eliminado, ejecutivo. */
  function actualizar(id, patch, accion, quien){
    return obtener(id).then(function(reg){
      if(!reg) return null;
      const antes = JSON.parse(JSON.stringify(reg));
      Object.keys(patch).forEach(function(k){
        if(k === "cliente"){
          Object.keys(patch.cliente).forEach(function(c){
            reg.cliente[c] = patch.cliente[c];
            if(accion !== "cotización") reg.editados[c] = true;
          });
        }else{
          reg[k] = patch[k];
          if(k === "cargas") reg.editados.cargas = true;
        }
      });
      const cambios = diff(antes, reg);
      const soloFav = Object.keys(patch).length === 1 && "fav" in patch;
      if(!Object.keys(cambios).length && !soloFav) return reg;
      if(!soloFav) anotar(reg, accion || "editado", cambios, quien);
      reg.actualizado = Date.now();
      return guardar(reg).then(function(){ avisar(id); return reg; });
    });
  }
  function eliminar(id, quien){ return actualizar(id, {eliminado: true}, "eliminado", quien); }
  function restaurar(id, quien){ return actualizar(id, {eliminado: false}, "restaurado", quien); }
  function duplicar(id){
    return obtener(id).then(function(reg){
      if(!reg) return null;
      const copia = JSON.parse(JSON.stringify(reg));
      delete copia.id;
      copia.creado = copia.actualizado = Date.now();
      copia.historial = [];
      anotar(copia, "duplicado de #" + id, {});
      return guardar(copia).then(function(nid){ avisar(nid); return nid; });
    });
  }

  /* Duplicados: un mismo RUT en varias filas. Se conserva la más reciente
     y las otras se ocultan (reversible), anotando a cuál se consolidaron. */
  function consolidarDuplicados(){
    return todos().then(function(rs){
      const grupos = {};
      rs.filter(function(r){ return !r.eliminado && r.cliente && r.cliente.rut; }).forEach(function(r){
        const k = r.cliente.rut.replace(/[^0-9kK]/g, "").toUpperCase();
        (grupos[k] = grupos[k] || []).push(r);
      });
      const ops = [];
      let nGrupos = 0;
      Object.keys(grupos).forEach(function(k){
        const g = grupos[k].sort(function(a, b){ return b.actualizado - a.actualizado; });
        if(g.length < 2) return;
        nGrupos++;
        const queda = g[0];
        g.slice(1).forEach(function(r){
          queda.llamadas = (queda.llamadas || []).concat(r.llamadas || []).sort();
          ops.push(actualizar(r.id, {eliminado: true}, "consolidado en #" + queda.id));
        });
        ops.push(actualizar(queda.id, {llamadas: queda.llamadas}, "consolidado"));
      });
      return Promise.all(ops).then(function(){ return {grupos: nGrupos, ocultos: ops.length - nGrupos}; });
    });
  }

  /* ---------- exportar / importar ---------- */
  function exportar(){
    return todos().then(function(rs){
      return {formato: "dental-historial", version: 1, exportadoEn: new Date().toISOString(), total: rs.length, registros: rs};
    });
  }
  // Fusiona sin borrar nada: lo que ya existe (mismo id y mismo lead, o mismo
  // lead) se queda con la versión más reciente; lo nuevo se agrega.
  function importar(datos){
    const lista = Array.isArray(datos) ? datos : (datos && datos.registros) || [];
    return todos().then(function(rs){
      const porId = {}, porLeadMap = {};
      rs.forEach(function(r){ porId[r.id] = r; if(r.lead) porLeadMap[r.lead] = r; });
      let nuevos = 0, actualizados = 0, iguales = 0;
      const ops = lista.map(function(x){
        if(!x || typeof x !== "object") return null;
        const reg = Object.assign(nuevo(), x);
        reg.cliente = Object.assign({}, x.cliente || {});
        const yo = (x.id && porId[x.id] && (!x.lead || porId[x.id].lead === x.lead)) ? porId[x.id] : (x.lead && porLeadMap[x.lead]) || null;
        if(yo){
          if((x.actualizado || 0) > (yo.actualizado || 0)){ reg.id = yo.id; actualizados++; return guardar(reg); }
          iguales++; return null;
        }
        delete reg.id; nuevos++;
        anotar(reg, "importado", {});
        return guardar(reg);
      }).filter(Boolean);
      return Promise.all(ops).then(function(){ avisar(); return {nuevos: nuevos, actualizados: actualizados, iguales: iguales}; });
    });
  }

  /* ---------- respaldos internos (puntos de restauración) ---------- */
  function meta(k, v){
    if(v === undefined) return tx("meta", "readonly", function(os, fin){ return pedir(os.get(k)).then(function(r){ fin(r ? r.v : null); }); });
    return tx("meta", "readwrite", function(os){ return pedir(os.put({k: k, v: v})); });
  }
  function configRespaldo(){
    return meta("cfgRespaldo").then(function(c){ return Object.assign({auto: true, cadaHoras: 24, maximo: 30, archivo: true}, c || {}); });
  }
  function respaldar(motivo){
    return Promise.all([exportar(), configRespaldo()]).then(function(x){
      const datos = x[0], cfg = x[1];
      const punto = {ts: new Date().toISOString(), motivo: motivo || "automático", total: datos.total, datos: datos};
      return tx("respaldos", "readwrite", function(os){ return pedir(os.put(punto)); })
        .then(function(){ return listarRespaldos(); })
        .then(function(lista){
          const sobran = lista.slice(cfg.maximo);
          if(!sobran.length) return punto;
          return tx("respaldos", "readwrite", function(os){ sobran.forEach(function(p){ os.delete(p.ts); }); }).then(function(){ return punto; });
        });
    });
  }
  function listarRespaldos(){
    return tx("respaldos", "readonly", function(os, fin){
      return pedir(os.getAll()).then(function(rs){
        fin(rs.map(function(p){ return {ts: p.ts, motivo: p.motivo, total: p.total}; }).sort(function(a, b){ return a.ts < b.ts ? 1 : -1; }));
      });
    });
  }
  function leerRespaldo(ts){ return tx("respaldos", "readonly", function(os, fin){ return pedir(os.get(ts)).then(function(p){ fin(p ? p.datos : null); }); }); }
  // Restaurar fusiona el punto con lo actual (no borra lo que se agregó después),
  // y antes guarda un punto con lo actual por si acaso.
  function restaurarRespaldo(ts){
    return respaldar("antes de restaurar " + ts).then(function(){ return leerRespaldo(ts); }).then(function(d){
      if(!d) return null;
      return importar(d);
    });
  }

  return {ESTADOS: ESTADOS, ETIQUETA: ETIQUETA, TONO: TONO, CAMPOS_CLIENTE: CAMPOS_CLIENTE,
          todos: todos, obtener: obtener, porLead: porLead, capturar: capturar, actualizar: actualizar,
          eliminar: eliminar, restaurar: restaurar, duplicar: duplicar, consolidarDuplicados: consolidarDuplicados,
          exportar: exportar, importar: importar, meta: meta, configRespaldo: configRespaldo,
          respaldar: respaldar, listarRespaldos: listarRespaldos, leerRespaldo: leerRespaldo,
          restaurarRespaldo: restaurarRespaldo, alCambiar: alCambiar, avisar: avisar};
})();
