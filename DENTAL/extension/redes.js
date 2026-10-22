/* ============================================================
   MOTOR DE LECTURA DE LAS REDES
   Compartido por el popup (buscador) y la pestaña de mapeo.
   ============================================================ */

/* ---------- guardado ----------
   chrome.storage en la extensión; localStorage si se abre como
   archivo suelto o como página web. */
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

/* ============================================================
   SUCURSALES POR COMUNA, LEÍDAS DE LOS SITIOS DE CADA RED
   La extensión corre en el Chrome del ejecutivo, así que lee
   unosalud.cl y e-dentalsys.com directamente (los permisos están
   en el manifest). Lo leído se guarda un día, para no consultar
   el sitio en cada llamada.
   ============================================================ */
const RED = {
  unosalud: {
    nombre: "Uno Salud Dental",
    sitio: "https://www.unosalud.cl/region-comuna/",
    indices: ["https://www.unosalud.cl/region-comuna/", "https://www.unosalud.cl/clinicas/"],
    comuna: function(slug){ return "https://www.unosalud.cl/region-comuna/" + slug + "/"; }
  },
  edental: {
    nombre: "e-Dental",
    sitio: "https://www.e-dentalsys.com/#clinicas",
    portada: "https://www.e-dentalsys.com/"
  }
};
const DIA = 24 * 60 * 60 * 1000;
const diag = {};   // lo que vio la última lectura de cada red, para depurar

/* ---------- texto ---------- */
function norm(t){
  return String(t || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function esc(t){
  return String(t == null ? "" : t).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function urlSegura(u){ return /^https:\/\//i.test(String(u || "")) ? u : ""; }
function humanizar(slug){
  return String(slug || "").split("-").filter(Boolean).map(function(w){
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}
function txt(el){ return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : ""; }

// Texto de un bloque separado en líneas, cortando donde corta el diseño
const BLOQUE = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|SECTION|TABLE|TBODY|TD|TH|TR|UL)$/;
function lineas(el){
  const out = []; let buf = "";
  function cortar(){ const t = buf.replace(/\s+/g, " ").trim(); if(t) out.push(t); buf = ""; }
  (function rec(n){
    n.childNodes.forEach(function(c){
      if(c.nodeType === 3){ buf += c.textContent; return; }
      if(c.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT|SVG|BUTTON|IFRAME|SELECT|TEMPLATE)$/.test(c.tagName)) return;
      const b = BLOQUE.test(c.tagName);
      if(b) cortar();
      rec(c);
      if(b) cortar();
    });
  })(el);
  cortar();
  return out;
}

const RE_FONO = /(\+?56[\s-]?)?(600[\s-]?\d{3}[\s-]?\d{4}|\(?22?\)?[\s-]?\d{3,4}[\s-]?\d{4}|9[\s-]?\d{4}[\s-]?\d{4})/;
function pareceHorario(l){
  return /(lunes|martes|miercoles|jueves|viernes|sabado|domingo|\blun\b|\bvie\b|\bsab\b)/.test(norm(l)) &&
         /\d{1,2}[:.]\d{2}/.test(l);
}
function pareceDireccion(l){
  if(l.length < 6 || l.length > 160 || !/\d/.test(l)) return false;
  if(pareceHorario(l)) return false;
  const sinFono = l.replace(RE_FONO, "").trim();
  if(!/[a-záéíóúñ]{3,}/i.test(sinFono)) return false;          // sólo un teléfono
  if(/^(tel|fono|telefono|whatsapp|llama)/.test(norm(l))) return false;
  return /(\bav\b|av\.|avenida|calle|pasaje|camino|paseo|alameda|mall|local|piso|esquina|esq\.|n°|nº|#|\bsur\b|\bnorte\b|oriente|poniente)/i.test(l) ||
         /[a-záéíóúñ]{3,}[^0-9]{0,40}\d{2,5}/i.test(l);
}

/* ---------- búsqueda tolerante ---------- */
function distancia(a, b, max){
  if(Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [], fila = [];
  for(let j = 0; j <= b.length; j++) prev[j] = j;
  for(let i = 1; i <= a.length; i++){
    fila = [i]; let mejor = i;
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
function puntaje(consulta, candidato){
  const q = norm(consulta), c = norm(candidato);
  if(!q || !c) return null;
  if(c === q) return 0;
  if(c.startsWith(q)) return 1;
  if(c.indexOf(q) !== -1) return 2;
  const max = q.length <= 4 ? 1 : 2;
  const d = distancia(q, c, max);
  return d <= max ? 3 + d : null;
}

/* Las 346 comunas de Chile [nombre, provincia, región] (fuente: paquete npm dpacl,
   División Político Administrativa de Chile). Sirve para saber si lo que se
   buscó es una comuna real: si no tiene sucursales, no se cambia por otra de
   nombre parecido (Talca ≠ Talcahuano) y se ofrecen las de su provincia o región. */
const REGIONES_CL = ["Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso", "Metropolitana de Santiago", "Libertador General Bernardo O'Higgins", "Maule", "Ñuble", "Biobío", "La Araucanía", "Los Ríos", "Los Lagos", "Aysén del General Carlos Ibañez del Campo", "Magallanes y de la Antártica Chilena"];
const COMUNAS_CL = [["Arica", 1, 1],["Camarones", 1, 1],["General Lagos", 2, 1],["Putre", 2, 1],["Alto Hospicio", 3, 2],["Iquique", 3, 2],["Camiña", 4, 2],["Colchane", 4, 2],["Huara", 4, 2],["Pica", 4, 2],["Pozo Almonte", 4, 2],["Antofagasta", 5, 3],["Mejillones", 5, 3],["Sierra Gorda", 5, 3],["Taltal", 5, 3],["Calama", 6, 3],["Ollagüe", 6, 3],["San Pedro de Atacama", 6, 3],["María Elena", 7, 3],["Tocopilla", 7, 3],["Chañaral", 8, 4],["Diego de Almagro", 8, 4],["Caldera", 9, 4],["Copiapó", 9, 4],["Tierra Amarilla", 9, 4],["Alto del Carmen", 10, 4],["Freirina", 10, 4],["Huasco", 10, 4],["Vallenar", 10, 4],["Canela", 11, 5],["Illapel", 11, 5],["Los Vilos", 11, 5],["Salamanca", 11, 5],["Andacollo", 12, 5],["Coquimbo", 12, 5],["La Higuera", 12, 5],["La Serena", 12, 5],["Paihuaco", 12, 5],["Vicuña", 12, 5],["Combarbalá", 13, 5],["Monte Patria", 13, 5],["Ovalle", 13, 5],["Punitaqui", 13, 5],["Río Hurtado", 13, 5],["Isla de Pascua", 14, 6],["Calle Larga", 15, 6],["Los Andes", 15, 6],["Rinconada de Los Andes", 15, 6],["San Esteban", 15, 6],["Limache", 16, 6],["Olmué", 16, 6],["Quilpué", 16, 6],["Villa Alemana", 16, 6],["Cabildo", 17, 6],["La Ligua", 17, 6],["Papudo", 17, 6],["Petorca", 17, 6],["Zapallar", 17, 6],["Hijuelas", 18, 6],["La Calera", 18, 6],["La Cruz", 18, 6],["Nogales", 18, 6],["Quillota", 18, 6],["Algarrobo", 19, 6],["Cartagena", 19, 6],["El Quisco", 19, 6],["El Tabo", 19, 6],["San Antonio", 19, 6],["Santo Domingo", 19, 6],["Catemu", 20, 6],["Llaillay", 20, 6],["Panquehue", 20, 6],["Putaendo", 20, 6],["San Felipe", 20, 6],["Santa María", 20, 6],["Casablanca", 21, 6],["Concón", 21, 6],["Juan Fernandéz", 21, 6],["Puchuncaví", 21, 6],["Quintero", 21, 6],["Valparaíso", 21, 6],["Viña del Mar", 21, 6],["Colina", 22, 7],["Lampa", 22, 7],["Tiltil", 22, 7],["Pirque", 23, 7],["Puente Alto", 23, 7],["San José de Maipo", 23, 7],["Buin", 24, 7],["Calera de Tango", 24, 7],["Paine", 24, 7],["San Bernardo", 24, 7],["Alhué", 25, 7],["Curacaví", 25, 7],["María Pinto", 25, 7],["Melipilla", 25, 7],["San Pedro", 25, 7],["Cerrillos", 26, 7],["Cerro Navia", 26, 7],["Conchalí", 26, 7],["El Bosque", 26, 7],["Estación Central", 26, 7],["Huechuraba", 26, 7],["Independencia", 26, 7],["La Cisterna", 26, 7],["La Granja", 26, 7],["La Florida", 26, 7],["La Pintana", 26, 7],["La Reina", 26, 7],["Las Condes", 26, 7],["Lo Barnechea", 26, 7],["Lo Espejo", 26, 7],["Lo Prado", 26, 7],["Macul", 26, 7],["Maipú", 26, 7],["Ñuñoa", 26, 7],["Pedro Aguirre Cerda", 26, 7],["Peñalolén", 26, 7],["Providencia", 26, 7],["Pudahuel", 26, 7],["Quilicura", 26, 7],["Quinta Normal", 26, 7],["Recoleta", 26, 7],["Renca", 26, 7],["San Miguel", 26, 7],["San Joaquín", 26, 7],["San Ramón", 26, 7],["Santiago", 26, 7],["Vitacura", 26, 7],["El Monte", 27, 7],["Isla de Maipo", 27, 7],["Padre Hurtado", 27, 7],["Peñaflor", 27, 7],["Talagante", 27, 7],["Codegua", 28, 8],["Coínco", 28, 8],["Coltauco", 28, 8],["Doñihue", 28, 8],["Graneros", 28, 8],["Las Cabras", 28, 8],["Machalí", 28, 8],["Malloa", 28, 8],["Olivar", 28, 8],["Peumo", 28, 8],["Pichidegua", 28, 8],["Quinta de Tilcoco", 28, 8],["Rancagua", 28, 8],["Requínoa", 28, 8],["Rengo", 28, 8],["San Francisco de Mostazal", 28, 8],["San Vicente de Tagua Tagua", 28, 8],["La Estrella", 29, 8],["Litueche", 29, 8],["Marchigüe", 29, 8],["Navidad", 29, 8],["Paredones", 29, 8],["Pichilemu", 29, 8],["Chépica", 30, 8],["Chimbarongo", 30, 8],["Lolol", 30, 8],["Nancagua", 30, 8],["Palmilla", 30, 8],["Peralillo", 30, 8],["Placilla", 30, 8],["Pumanque", 30, 8],["San Fernando", 30, 8],["Santa Cruz", 30, 8],["Cauquenes", 31, 9],["Chanco", 31, 9],["Pelluhue", 31, 9],["Curicó", 32, 9],["Hualañé", 32, 9],["Licantén", 32, 9],["Molina", 32, 9],["Rauco", 32, 9],["Romeral", 32, 9],["Sagrada Familia", 32, 9],["Teno", 32, 9],["Vichuquén", 32, 9],["Colbún", 33, 9],["Linares", 33, 9],["Longaví", 33, 9],["Parral", 33, 9],["Retiro", 33, 9],["San Javier de Loncomilla", 33, 9],["Villa Alegre", 33, 9],["Yerbas Buenas", 33, 9],["Constitución", 34, 9],["Curepto", 34, 9],["Empedrado", 34, 9],["Maule", 34, 9],["Pelarco", 34, 9],["Pencahue", 34, 9],["Río Claro", 34, 9],["San Clemente", 34, 9],["San Rafael", 34, 9],["Talca", 34, 9],["Bulnes", 35, 10],["Chillán", 35, 10],["Chillán Viejo", 35, 10],["El Carmen", 35, 10],["Pemuco", 35, 10],["Pinto", 35, 10],["Quillón", 35, 10],["San Ignacio", 35, 10],["Yungay", 35, 10],["Cobquecura", 36, 10],["Coelemu", 36, 10],["Ninhue", 36, 10],["Portezuelo", 36, 10],["Quirihue", 36, 10],["Ránquil", 36, 10],["Treguaco", 36, 10],["Coihueco", 37, 10],["Ñiquén", 37, 10],["San Carlos", 37, 10],["San Fabián", 37, 10],["San Nicolás", 37, 10],["Arauco", 38, 11],["Cañete", 38, 11],["Contulmo", 38, 11],["Curanilahue", 38, 11],["Lebu", 38, 11],["Los Álamos", 38, 11],["Tirúa", 38, 11],["Alto Biobío", 39, 11],["Antuco", 39, 11],["Cabrero", 39, 11],["Laja", 39, 11],["Los Ángeles", 39, 11],["Muichén", 39, 11],["Nacimiento", 39, 11],["Negrele", 39, 11],["Quilaco", 39, 11],["Quilleco", 39, 11],["San Rosendo", 39, 11],["Santa Bárbara", 39, 11],["Tucapel", 39, 11],["Yumbel", 39, 11],["Chiguayante", 40, 11],["Concepción", 40, 11],["Coronel", 40, 11],["Florida", 40, 11],["Hualpén", 40, 11],["Hualqui", 40, 11],["Lota", 40, 11],["Penco", 40, 11],["San Pedro de la Paz", 40, 11],["Santa Juana", 40, 11],["Talcahuano", 40, 11],["Tomé", 40, 11],["Carahue", 41, 12],["Cholchol", 41, 12],["Cunco", 41, 12],["Curarrehue", 41, 12],["Freire", 41, 12],["Galvarino", 41, 12],["Gorbea", 41, 12],["Lautaro", 41, 12],["Loncoche", 41, 12],["Melipeuco", 41, 12],["Nueva Imperial", 41, 12],["Padre Las Casas", 41, 12],["Perquenco", 41, 12],["Pitrufquén", 41, 12],["Pucón", 41, 12],["Saavedra", 41, 12],["Temuco", 41, 12],["Teodoro Schmidt", 41, 12],["Toltén", 41, 12],["Vilcún", 41, 12],["Villarrica", 41, 12],["Angol", 42, 12],["Collipulli", 42, 12],["Curacautín", 42, 12],["Ercilla", 42, 12],["Lonquimay", 42, 12],["Los Sauces", 42, 12],["Lumaco", 42, 12],["Purén", 42, 12],["Renaico", 42, 12],["Traiguén", 42, 12],["Victoria", 42, 12],["Futrono", 43, 13],["La Unión", 43, 13],["Lago Ranco", 43, 13],["Río Bueno", 43, 13],["Corral", 44, 13],["Lanco", 44, 13],["Los Lagos", 44, 13],["Máfil", 44, 13],["Mariquína", 44, 13],["Paillaco", 44, 13],["Panguipulli", 44, 13],["Valdivia", 44, 13],["Ancud", 45, 14],["Castro", 45, 14],["Chonchi", 45, 14],["Curaco de Vélez", 45, 14],["Dalcahue", 45, 14],["Puqueldón", 45, 14],["Queilén", 45, 14],["Quellón", 45, 14],["Quemchi", 45, 14],["Quinchao", 45, 14],["Calbuco", 46, 14],["Cochamó", 46, 14],["Fresia", 46, 14],["Frutillar", 46, 14],["Llanquihue", 46, 14],["Los Muermos", 46, 14],["Maullín", 46, 14],["Puerto Montt", 46, 14],["Puerto Varas", 46, 14],["Osorno", 47, 14],["Puerto Octay", 47, 14],["Purranque", 47, 14],["Puyehue", 47, 14],["Río Negro", 47, 14],["San Pablo", 47, 14],["San Juan de la Costa", 47, 14],["Chaitén", 48, 14],["Futaleufú", 48, 14],["Hualaihué", 48, 14],["Palena", 48, 14],["Aysén", 49, 15],["Cisnes", 49, 15],["Guaitecas", 49, 15],["Cochrane", 50, 15],["O'Higgins", 50, 15],["Tortel", 50, 15],["Coyhaique", 51, 15],["Lago Verde", 51, 15],["Chile Chico", 52, 15],["Río Ibáñez", 52, 15],["Antártica", 53, 16],["Cabo de Hornos", 53, 16],["Laguna Blanca", 54, 16],["Punta Arenas", 54, 16],["Río Verde", 54, 16],["San Gregorio", 54, 16],["Porvenir", 55, 16],["Primavera", 55, 16],["Timaukel", 55, 16],["Natales", 56, 16],["Torres del Paine", 56, 16]];
// Otras formas de escribir la misma comuna (Vicidial, costumbre)
const ALIAS_COMUNA = {"til til": "tiltil", "llay llay": "llaillay", "calera": "la calera", "coihaique": "coyhaique",
  "marchihue": "marchigue", "paihuano": "paihuaco", "paiguano": "paihuaco", "trehuaco": "treguaco", "aisen": "aysen",
  "puerto aysen": "aysen", "santiago centro": "santiago", "stgo centro": "santiago", "rinconada": "rinconada de los andes"};
// La comuna real que corresponde a lo escrito (sólo nombre exacto), o null
let indiceComunasCL = null;
function comunaReal(t){
  if(!indiceComunasCL){
    indiceComunasCL = {};
    COMUNAS_CL.forEach(function(c){ indiceComunasCL[norm(c[0])] = {nombre: c[0], provincia: c[1], region: c[2], regionNombre: REGIONES_CL[c[2] - 1] || ""}; });
  }
  const q = norm(t);
  return indiceComunasCL[ALIAS_COMUNA[q] || q] || null;
}

/* Red e-Dental (listado de e-Dental, "Encuentra tu clínica", octubre 2026): 206 clínicas en 74 comunas.
   [cadena U=Uno Salud / E=otra clínica e-Dental, n° Uno Salud, nombre, dirección, comuna oficial] */
const RED_DENTAL = [
["E", 0, "CLÍNICA VICHUQUÉN", "Coquimbo #838", "Antofagasta"],
["E", 0, "LUMINIS ODONTOLOGIA (Ex - Kaizen)", "Manuel Orella #610, Oficina 1404", "Antofagasta"],
["E", 0, "DENTALCARE ANTOFAGASTA", "Avenida O´Higgins #1338, oficina 301", "Antofagasta"],
["U", 59, "UNO SALUD ANTOFAGASTA 2", "Calle Almirante Juan José Latorre #2318", "Antofagasta"],
["U", 62, "UNO SALUD ANTOFAGASTA LA PORTADA", "Calle Pedro Aguirre Cerda #10578, Local N° 12, 13, 14 y 102", "Antofagasta"],
["U", 19, "UNO SALUD ANTOFAGASTA", "Manuel Antonio Matta #2001, local 2", "Antofagasta"],
["E", 0, "DENTAL PREMIUM", "Pedro León Gallo #1909 A", "Calama"],
["E", 0, "DENTAL PREMIUM VIVAR", "Calle Vivar #1498 C", "Calama"],
["E", 0, "COLDENTS GRANADEROS (Ex - Startdent Calama)", "Av. Granaderos #1629", "Calama"],
["E", 0, "COLDENTS", "Vicuña Mackenna #1917", "Calama"],
["U", 58, "UNO SALUD CALAMA", "Calle Eleuterio Ramirez #1961", "Calama"],
["E", 0, "ODONTOLOGÍA ARICA", "General Lagos #666", "Arica"],
["U", 49, "UNO SALUD ARICA", "Avenida Diego Portales #157, Local 116 y 202", "Arica"],
["E", 0, "AZURDENT", "Vallejos #316, oficina 22", "Copiapó"],
["U", 84, "UNO SALUD COPIAPÓ", "Calle O´Higgins #640, Local 3", "Copiapó"],
["E", 0, "ORALDENT VALLENAR", "Aconcagua #960", "Vallenar"],
["E", 0, "STARTDENT ILLAPEL", "Calle Constitución #260", "Illapel"],
["E", 0, "INDENTAL", "Avenida Videla #340, oficina 506", "Coquimbo"],
["U", 42, "UNO SALUD COQUIMBO", "Baquedano#86, Local TM1288-1292-170", "Coquimbo"],
["E", 0, "CLÍNICA DAVINI (Ex-Medident La Serena)", "Avenida Gabriel González Videla #1661", "La Serena"],
["E", 0, "ORTHODEM LA SERENA", "Calle Amunategui #785, Oficina 214 y 327", "La Serena"],
["U", 81, "UNO SALUD LA SERENA 2 CENTRO", "Avenida José Manuel Balmaceda #555, Local 2", "La Serena"],
["U", 22, "UNO SALUD LA SERENA", "Balmaceda #1115", "La Serena"],
["E", 0, "ORTHODEM OVALLE", "Calle Socos #44, oficina 204", "Ovalle"],
["E", 0, "DENTCARE", "Antonio Varas #979 oficina 902 A y B", "Temuco"],
["E", 0, "FIDELIS", "Antonio Varas #989, oficina 506", "Temuco"],
["E", 0, "CLINICA DENTAL MARÓ", "Hochstetter # 599 oficina 303", "Temuco"],
["E", 0, "MILENIUM ODONTOLOGÍA INTEGRAL", "Antonio Varas #989 piso 20", "Temuco"],
["E", 0, "ODONTOLÓGICA ESPECIALIDADES", "Manuel Bulnes #853", "Temuco"],
["U", 74, "UNO SALUD TEMUCO 3 CAUPOLICAN", "Calle Manuel Montt #462, Local 03", "Temuco"],
["U", 20, "UNO SALUD TEMUCO", "Andres Bello #850", "Temuco"],
["U", 48, "UNO SALUD TEMUCO ALEMANIA", "Avenida Alemania #0890,Local 5", "Temuco"],
["E", 0, "CLÍNICA DENTAL SAN PEDRO", "Camilo Henríquez #301, oficina 202", "Villarrica"],
["E", 0, "CLÍNICA AYEI", "Arturo Pratt #99, local C", "Angol"],
["E", 0, "CENTRO MÉDICO Y DENTAL CHILHUE CASTRO", "Galvarino Riveros #1277", "Castro"],
["E", 0, "SUR SALUD CALBUCO", "Ernesto Riquelme #92", "Calbuco"],
["E", 0, "SEENS", "Antonio varias #55, Oficina 804", "Puerto Montt"],
["E", 0, "SUR SALUD PUERTO MONTT", "Pedro Montt #160, Oficina 31", "Puerto Montt"],
["E", 0, "CLÍNICA O&E PUERTO MONTT", "Benavente #550, oficina 701", "Puerto Montt"],
["U", 50, "UNO SALUD PUERTO MONTT 2", "Calle Benavente #308, piso 5", "Puerto Montt"],
["U", 12, "UNO SALUD PUERTO MONTT", "Illapel #10, locales 1-10", "Puerto Montt"],
["U", 76, "UNO SALUD PUERTO MONTT 3 PARQUE INDUSTRIAL", "Avenida Parque Industrial #450, Local 101", "Puerto Montt"],
["U", 86, "UNO SALUD PUERTO VARAS", "Santa Rosa # 539", "Puerto Varas"],
["E", 0, "VITALIS", "Freire #624, oficina 307", "Osorno"],
["E", 0, "DENTIMAGEN OSORNO", "Arturo Pratt #551", "Osorno"],
["U", 37, "UNO SALUD OSORNO", "Lord Cochrane #627-629", "Osorno"],
["E", 0, "CLÍNICA RAMIS", "Beauchef #683", "Valdivia"],
["E", 0, "ADVANCE DENTAL", "Carampangue #455, oficinas 3 y 4", "Valdivia"],
["E", 0, "CLÍNICA SUIZA", "Arturo Prat # 675, A", "Valdivia"],
["U", 27, "UNO SALUD VALDIVIA", "Ismael Valdes #365", "Valdivia"],
["E", 0, "DENTALMED (Ex-Dental Clinic Iquique)", "Vivar #720, local 406", "Iquique"],
["E", 0, "CLINICA ORIENTE", "Avenida Arturo Pratt #1170, oficina 710", "Iquique"],
["E", 0, "CLÍNICA DR. WILLIAMS HUERTA", "Avenida Arturo Prat #1170, oficina 709", "Iquique"],
["U", 36, "UNO SALUD IQUIQUE", "Serrano #630", "Iquique"],
["E", 0, "DENTIMAGEN LOS ANDES", "Maipú #330, oficina 24", "Los Andes"],
["E", 0, "CLÍNICA DENTAL CORDILLERA", "Freire #676, oficina 6", "Los Andes"],
["E", 0, "BOLLEK LA LIGUA", "Ortiz de Rosas #668", "La Ligua"],
["E", 0, "DIAGNODENT", "Prat #451, Box 7", "La Calera"],
["U", 95, "UNO SALUD LA CALERA", "José Joaquín Pérez # 232", "La Calera"],
["E", 0, "PLUSS DENTAL LIMACHE", "Baquedano #71, B", "Limache"],
["E", 0, "BOLLEK QUILLOTA", "Maipú #380", "Quillota"],
["U", 69, "UNO SALUD QUILLOTA", "Calle La Concepción #351", "Quillota"],
["E", 0, "CLINICA NÜN SAN ANTONIO", "Gregorio Mira #240", "San Antonio"],
["U", 87, "UNO SALUD SAN ANTONIO", "Avenida Centenario # 22", "San Antonio"],
["E", 0, "DENTIMAGEN SAN FELIPE", "Yungay #206", "San Felipe"],
["U", 73, "UNO SALUD SAN FELIPE", "Calle Arturo Prat #692", "San Felipe"],
["E", 0, "REN CLÍNICA DENTAL (Ex- Blanca Estela)", "Reñaca Norte #25, oficina 1305", "Concón"],
["E", 0, "CHARLY DENT", "Avenida Los Carrera #347", "Quilpué"],
["U", 63, "UNO SALUD QUILPUÉ", "Avenida Los Carrera # 406 Local 2", "Quilpué"],
["E", 0, "RISUS", "Pratt #749, piso 2", "Valparaíso"],
["U", 9, "UNO SALUD VALPARAISO", "Blanco #1297", "Valparaíso"],
["U", 75, "UNO SALUD VALPARAISO PEDRO MONTT", "Las Heras #478, Piso 1, 2 y 3", "Valparaíso"],
["E", 0, "CENTRO ODONTOLÓGICO BUENOS AIRES (Ex-Traumamed)", "Buenos Aires #967", "Villa Alemana"],
["U", 55, "UNO SALUD VILLA ALEMANA", "Avenida Valparaiso #945", "Villa Alemana"],
["E", 0, "CLÍNICA ODONTOLÓGICA MONTEBLANCO", "7 Norte #645 oficina 312", "Viña del Mar"],
["E", 0, "VIVADENTIS", "9 Norte #761, Oficina 403", "Viña del Mar"],
["E", 0, "BOLLEK VIÑA DEL MAR", "11 Norte #611", "Viña del Mar"],
["U", 4, "UNO SALUD VIÑA DEL MAR 13 NORTE", "Trece Norte #798", "Viña del Mar"],
["U", 65, "UNO SALUD VIÑA LIBERTAD", "Avenida Libertad #1097", "Viña del Mar"],
["U", 78, "UNO SALUD VIÑA 4 ECUADOR", "Calle Ecuador #80, Local 2", "Viña del Mar"],
["U", 41, "UNO SALUD VIÑA DEL MAR CENTRO", "Avenida Valparaiso #1070, Local 102-2004", "Viña del Mar"],
["E", 0, "NATURALDENT", "Colon #141, oficina 201", "Los Ángeles"],
["E", 0, "CENTRO ODONTOLÓGICO CK", "Almagro #250, oficinas 806 y 811", "Los Ángeles"],
["U", 31, "UNO SALUD LOS ANGELES", "Valdivia #485", "Los Ángeles"],
["U", 79, "UNO SALUD LOS ANGELES 2 AV. ALEMANIA", "Avenida Alemania #610, Locales 5 y 6", "Los Ángeles"],
["E", 0, "MURANO", "Cochrane #418", "Concepción"],
["E", 0, "ORALMED", "Anibal Pinto #295, Oficinas 407 y 408", "Concepción"],
["E", 0, "CLÍNICA O&E CONCEPCIÓN", "San Martin #1373", "Concepción"],
["E", 0, "PREMIUMDENT (Ex-clínica Dr. Jorge Maldonado)", "Anibal Pinto #295, oficina 702", "Concepción"],
["U", 39, "UNO SALUD CONCEPCION FREIRE", "Freire #820", "Concepción"],
["U", 8, "UNO SALUD CONCEPCION COCHRANE", "Cochrane #635, local 106", "Concepción"],
["U", 77, "UNO SALUD CONCEPCION 3 BARROS ARANA", "Calle Angol #518", "Concepción"],
["E", 0, "SALUD DENTAL", "Manuel Montt #256, Oficina 303", "Coronel"],
["U", 61, "UNO SALUD CORONEL", "Manuel Montt #327, Local 1", "Coronel"],
["U", 101, "UNO SALUD HUALPÉN", "Av. Colón # 7948", "Hualpén"],
["U", 53, "UNO SALUD SAN PEDRO DE LA PAZ", "Calle Michimalonco #1147", "San Pedro de la Paz"],
["E", 0, "BIOTOTAL", "Sargento Aldea #349, oficina 13", "Talcahuano"],
["U", 38, "UNO SALUD TALCAHUANO", "Cristóbal Colon #3236, oficina E", "Talcahuano"],
["E", 0, "DIGITALDENT(Ex-clínica de estética dental)", "Calle Constitución #418", "Chillán"],
["E", 0, "CENTRO ODONTOLOGICO INTEGRAL", "Constitución #664, oficina 511", "Chillán"],
["U", 67, "UNO SALUD CHILLÁN 2", "Calle Sargento Aldea # 823, local 1", "Chillán"],
["U", 43, "UNO SALUD CHILLAN", "Calle Constitución #486", "Chillán"],
["U", 93, "UNO SALUD MACHALÍ", "Avenida San Juan #2184", "Machalí"],
["E", 0, "ODENTIS", "O'Carrol #654", "Rancagua"],
["E", 0, "MEDIC CENTER RANCAGUA", "Nueva Einstein #290, oficina 412", "Rancagua"],
["U", 7, "UNO SALUD RANCAGUA J.CARRERA", "Javiera Carrera #957", "Rancagua"],
["U", 80, "UNO SALUD RANCAGUA 3 PASEO INDEPENDENCIA", "Calle Paseo Independencia #477", "Rancagua"],
["U", 25, "UNO SALUD RANCAGUA CENTRO", "Calle Campos #221, Locales 2 y 3", "Rancagua"],
["E", 0, "CLÍNICA DENTAL DRA. MAUDY AQUITE", "Avenida Manso de Velasco #1009, oficina 1, piso 2", "San Fernando"],
["E", 0, "CLINICA DENTAL BASSAN", "Chillán #612, oficina 201", "San Fernando"],
["U", 35, "UNO SALUD SAN FERNANDO", "Avenida Bernardo O´higgins #701, locales N° 110/114/118/122/126 y 130", "San Fernando"],
["E", 0, "CLÍNICA DENTAL CURICÓ", "Carmen #487, oficina 404", "Curicó"],
["E", 0, "ADENT CURICÓ", "Carmen #775, oficina 304", "Curicó"],
["E", 0, "CLINICA ODONTOLOGICA VILLOTA", "Villota #663", "Curicó"],
["U", 28, "UNO SALUD CURICO", "Manuel Montt #455 local 104-105 A", "Curicó"],
["E", 0, "DENTOMÉDICA ODONTOLOGÍA", "Max Jara #361", "Linares"],
["E", 0, "AC DENTAL (Ex - SAMY)", "Yumbel # 525 A", "Linares"],
["U", 46, "UNO SALUD LINARES", "Calle Chacabuco #575", "Linares"],
["E", 0, "CLÍNICA DENTAL GANZ (Ex- Sanident)", "1 Sur 7 Oriente #1417, Oficina 22, Piso 3", "Talca"],
["E", 0, "CLÍNICA LAS CRUCES", "30 oriente, esquina 4 1/2 norte", "Talca"],
["E", 0, "ODONTO IMAGEN", "Calle 10, oriente #1165", "Talca"],
["E", 0, "CIMA DENTAL", "Calle 6 Oriente #1060, oficina 2, piso 2", "Talca"],
["U", 44, "UNO SALUD TALCA ORIENTE", "Avenida San Miguel #3050, Local 7 y 8", "Talca"],
["U", 72, "UNO SALUD TALCA 3 LA FLORIDA", "Avenida Colín #665, Local 1", "Talca"],
["U", 23, "UNO SALUD TALCA CENTRO", "Uno Norte #1601", "Talca"],
["E", 0, "CLÍNICA DENTAL LIPANOVIC", "Pedro Aguirre Cerda #1100 local B", "Lampa"],
["U", 92, "UNO SALUD BUIN", "Avenida José Manuel Balmaceda # 2", "Buin"],
["E", 0, "CENTRO MEDICO Y DENTAL ECUAMED", "Arturo Pratt # 675", "Melipilla"],
["E", 0, "CLÍNICA MEDENTYS MELIPILLA", "Ugalde #495, Oficina 402", "Melipilla"],
["U", 45, "UNO SALUD MELIPILLA", "Plaza de Armas #561-565", "Melipilla"],
["U", 71, "UNO SALUD CERRILLOS", "Camino a Melipilla #7003, Local A-2", "Cerrillos"],
["U", 5, "UNO SALUD ESTACION CENTRAL", "Paseo Arauco Estación San Francisco de Borja #22, local S-122 A", "Estación Central"],
["U", 91, "UNO SALUD PEDRO FONTOVA", "Avenida Pedro Fontova # 6651", "Huechuraba"],
["U", 57, "UNO SALUD INDEPENDENCIA", "Avenida Independencia #565, Local BV-03", "Independencia"],
["U", 26, "UNO SALUD LA CISTERNA", "Américo Vespucio #33 locales 312 al 315", "La Cisterna"],
["E", 0, "SMILEDENT", "Avenida Vicuña Mackenna #7255, Oficina 406", "La Florida"],
["E", 0, "BOLLEK LA FLORIDA", "Avenida Vicuña Mackenna #9354", "La Florida"],
["U", 15, "UNO SALUD LA FLORIDA F. ROA", "Froilán Roa #894", "La Florida"],
["U", 40, "UNO SALUD BELLAVISTA FLORIDA", "Avenida Vicuña Mackenna Poniente #7372, Local A-1", "La Florida"],
["U", 94, "UNO SALUD SANTA AMALIA", "Avenida Santa Amalia # 1763", "La Florida"],
["E", 0, "CLÍNICA O&E LA REINA", "Echeñique #5839, local 3", "La Reina"],
["U", 21, "UNO SALUD LA REINA", "Príncipe de Gales #6938", "La Reina"],
["E", 0, "OPRA", "Los Militares #5620, Oficina 401", "Las Condes"],
["E", 0, "180° LAS CONDES", "Avenida Nueva Tajamar #481, oficina 502", "Las Condes"],
["U", 3, "UNO SALUD MANQUEHUE", "Manquehue Sur #430, local 1-A", "Las Condes"],
["U", 32, "UNO SALUD PADRE HURTADO", "Avenida Padre Hurtado Sur #1621,Locales 24-25-26", "Las Condes"],
["U", 34, "UNO SALUD ESCUELA MILITAR", "Avenida Apoquindo #4579, Local 6", "Las Condes"],
["U", 51, "UNO SALUD LA DEHESA", "Avenida El Rodeo #12850, Local 60", "Lo Barnechea"],
["U", 33, "UNO SALUD MACUL", "Avenida José Pedro Alessandri #2555", "Macul"],
["E", 0, "ODONTOS SH", "Avenida Pajaritos #3462", "Maipú"],
["E", 0, "180° MAIPÚ", "Avenida Pajaritos #3195, oficina 401", "Maipú"],
["E", 0, "BOLLEK MAIPÚ", "Avenida Pajaritos #2624, local 20", "Maipú"],
["E", 0, "ODONTOLOGÍA CORDILLERA MAIPÚ", "Avenida Pajaritos #3195, Oficina 306", "Maipú"],
["U", 68, "UNO SALUD MAIPU 3 EL ROSAL", "Avenid Americo Vespucio #1076, locales 6, 18, 19, 20, 21, 22", "Maipú"],
["U", 60, "UNO SALUD MAIPU MONUMENTO", "Calle Monumento #2196, Locales 4 y 5, 15 a, 16, 17 18, 19 , 20, 21", "Maipú"],
["U", 98, "UNO SALUD MAIPÚ SILVA CARVALLO", "Av. Alfredo Silva Carvallo #1415", "Maipú"],
["E", 0, "ODONTOCERO", "Vicuña Mackenna #856", "Ñuñoa"],
["E", 0, "DENTAL SHAPER", "Avenida Pedro de Valdivia #3420, oficina 28", "Ñuñoa"],
["U", 64, "UNO SALUD CHILE-ESPAÑA", "Avenida Presidente José Pedro Alessandri #43", "Ñuñoa"],
["U", 89, "UNO SALUD PLAZA EGAÑA", "Avenida Irarrázabal 5442", "Ñuñoa"],
["U", 24, "UNO SALUD ÑUÑOA", "Av. Irarrázaval #2401", "Ñuñoa"],
["E", 0, "CLÍNICA DENTAL TOBALABA", "Mariano Sanchez Fontecilla #2066", "Peñalolén"],
["U", 54, "UNO SALUD PEÑALOLEN", "Avenida Consistorial #2701, Locales B28/B29", "Peñalolén"],
["E", 0, "DENTUS", "Paseo Las Palmas #2212, oficina F65", "Providencia"],
["E", 0, "CLÍNICA DELLA BOCCA (Ex-clínica Dr. Ariel Mariani)", "Guardia vieja #181, oficina 702", "Providencia"],
["E", 0, "DENTIMAGEN LYON", "Nueva de Lyon #0110", "Providencia"],
["E", 0, "C&M DENTAL", "Nueva Providencia #1860, oficina 33", "Providencia"],
["U", 1, "UNO SALUD COYANCURA LOS LEONES", "Coyancura #2229", "Providencia"],
["U", 30, "UNO SALUD TOBALABA", "Hernando de Aguirre #215, local 101", "Providencia"],
["U", 10, "UNO SALUD LA CONCEPCION PROVIDENCIA", "La Concepción #201, local 102", "Providencia"],
["U", 52, "UNO SALUD MANUEL MONTT", "Manuel Montt #217", "Providencia"],
["U", 83, "UNO SALUD PUDAHUEL SUR", "Avenida Teniente Cruz #0015, Locales 3-26-27-28-29-30", "Pudahuel"],
["E", 0, "MORDENT", "Avenida Lo Cruzat #0473", "Quilicura"],
["E", 0, "CLINICA GVG (Ex-Fiorani)", "Avenida Manuel Antonio Matta #712, local E", "Quilicura"],
["U", 56, "UNO SALUD QUILICURA", "José Francisco Vergara #409, Local 1 y 9", "Quilicura"],
["E", 0, "CENTRO ODONTOLÓGICO CAMPBELL Y ESPECIALISTAS", "AV. CARRASCAL #4442", "Quinta Normal"],
["U", 90, "UNO SALUD RECOLETA", "Av. Recoleta # 446", "Recoleta"],
["E", 0, "CLÍNICA O&E SAN MIGUEL", "El Llano Subercaseaux #4005, local 2", "San Miguel"],
["U", 66, "UNO SALUD GRAN AVENIDA", "Gran Avenida José Miguel Carrera #5553, Locales 5-12-13-14-15 y 16", "San Miguel"],
["U", 17, "UNO SALUD SAN MIGUEL", "Llano Subercaseaux # 3811", "San Miguel"],
["U", 99, "UNO SALUD SAN RAMÓN", "AV. SANTA ROSA # 9233", "San Ramón"],
["E", 0, "ODONTOLOGÍA CORDILLERA SANTIAGO", "Monjitas #527, oficina 1305", "Santiago"],
["E", 0, "DENTALONE", "San Francisco #531, local 13, Piso 2", "Santiago"],
["E", 0, "DENTIMAGEN YUNGAY", "Catedral #2552", "Santiago"],
["E", 0, "DENTIMAGEN SANTA ANA", "Guardia Marina Riquelme #401", "Santiago"],
["E", 0, "BOLLEK MIRAFLORES", "Miraflores #156", "Santiago"],
["U", 2, "UNO SALUD MONEDA", "Moneda #953", "Santiago"],
["U", 11, "UNO SALUD SANTA LUCIA", "Santa Rosa #12, local 14", "Santiago"],
["U", 16, "UNO SALUD TEATINOS", "Teatinos #333", "Santiago"],
["U", 82, "UNO SALUD NATANIEL COX", "Nataniel Cox #35, Local 1", "Santiago"],
["U", 29, "UNO SALUD MERCED", "Merced #501, piso 2", "Santiago"],
["U", 6, "UNO SALUD VITACURA", "Vitacura #5250, local 101", "Vitacura"],
["U", 100, "UNO SALUD PADRE HURTADO", "Av. Camino a Melipilla #2390", "Padre Hurtado"],
["E", 0, "CLÍNICA MEDENTYS TALAGANTE", "Darwin Vargas #842", "Talagante"],
["E", 0, "CLÍNICA O&E TALAGANTE", "Avenida Avenida Bernardo O´Higgins #200, local 207 A", "Talagante"],
["E", 0, "DENTIMAGEN SAN BERNARDO", "Covadonga #121", "San Bernardo"],
["U", 85, "UNO SALUD SAN BERNARDO 2", "Av. Libertador Bernardo O´Higgins # 453", "San Bernardo"],
["U", 14, "UNO SALUD SAN BERNARDO", "Eyzaguirre # 650", "San Bernardo"],
["E", 0, "DENTAL OFFICE", "Concha y Toro #7, oficina 41", "Puente Alto"],
["E", 0, "ODONTOLOGÍA CORDILLERA PUENTE", "Avenida Concha y Toro #2279", "Puente Alto"],
["U", 70, "UNO SALUD PLAZA PUENTE ALTO", "Avenida Concha y Toro #95", "Puente Alto"],
["U", 18, "UNO SALUD PUENTE ALTO", "Concha y Toro #625 local 4-13-14-15", "Puente Alto"],
["U", 47, "UNO SALUD PUENTE ALTO ELISA CORREA", "Avenida Concha y Toro #3955, Local 13", "Puente Alto"],
["U", 106, "UNO SALUD PUENTE ALTO LOS TOROS", "Av. Los Toros # 5441", "Puente Alto"],
["U", 88, "UNO SALUD PUNTA ARENAS", "Julio Roca #940", "Punta Arenas"],
["E", 0, "ODONTOLOGÍA OYARZÚN PUNTA ARENAS", "PDTE. JUAN MANUEL BALMACEDA #198-A", "Punta Arenas"]
];
// Comunas con clínica según la red integrada: {nombre, uno:[…], ede:[…]}
let comunasRedDental = null;
function redDentalPorComuna(){
  if(comunasRedDental) return comunasRedDental;
  const m = {};
  RED_DENTAL.forEach(function(f){
    const k = norm(f[4]);
    if(!m[k]) m[k] = {nombre: f[4], slug: "", uno: [], ede: []};
    const c = {nombre: f[2], direccion: f[3], telefono: "", horario: "", url: ""};
    (f[0] === "U" ? m[k].uno : m[k].ede).push(c);
  });
  comunasRedDental = Object.keys(m).map(function(k){ return m[k]; });
  return comunasRedDental;
}
function totalesRedDental(){
  const u = RED_DENTAL.filter(function(f){ return f[0] === "U"; }).length;
  return {uno: u, ede: RED_DENTAL.length - u, total: RED_DENTAL.length, comunas: redDentalPorComuna().length};
}

/* ---------- red y caché ---------- */
async function traer(url){
  const ctl = new AbortController();
  const t = setTimeout(function(){ ctl.abort(); }, 12000);
  try{
    const r = await fetch(url, {signal: ctl.signal, credentials: "omit"});
    const html = await r.text();
    return {ok: r.ok, status: r.status, html: html, url: r.url || url};
  }catch(e){
    return {ok: false, status: 0, html: "", url: url,
            error: e.name === "AbortError" ? "el sitio tardó demasiado" : "no hubo respuesta del sitio"};
  }finally{ clearTimeout(t); }
}
function docDe(html){ return new DOMParser().parseFromString(html, "text/html"); }
function cacheLeer(clave, maxEdad){
  return new Promise(function(res){
    almacen.leer(clave, function(v){ res(v && v.t && (Date.now() - v.t) < maxEdad ? v.d : null); });
  });
}
function cacheEscribir(clave, d){ almacen.escribir(clave, {t: Date.now(), d: d}); }
function muestraHTML(doc){
  const b = doc.body ? doc.body.cloneNode(true) : null;
  if(!b) return "";
  b.querySelectorAll("script,style,noscript,svg,iframe,link,meta").forEach(function(x){ x.remove(); });
  return b.innerHTML.replace(/\s+/g, " ").slice(0, 12000);
}

/* ---------- lectura de datos estructurados (JSON-LD) ---------- */
function desdeJsonLd(doc){
  const out = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){
    let j; try{ j = JSON.parse(s.textContent); }catch(e){ return; }
    const pila = Array.isArray(j) ? j.slice() : [j];
    while(pila.length){
      const o = pila.pop();
      if(!o || typeof o !== "object") continue;
      ["@graph","location","department","subOrganization"].forEach(function(k){
        if(Array.isArray(o[k])) pila.push.apply(pila, o[k]);
      });
      const tipo = [].concat(o["@type"] || []).join(" ");
      if(!/Dentist|MedicalClinic|MedicalBusiness|LocalBusiness|Hospital/i.test(tipo)) continue;
      const ad = o.address;
      const dir = !ad ? "" : (typeof ad === "string" ? ad :
                  [ad.streetAddress, ad.addressLocality].filter(Boolean).join(", "));
      if(dir && o.name){
        out.push({nombre: String(o.name), direccion: dir, telefono: o.telephone || "", horario: "",
                  url: urlSegura(o.url), texto: o.name + " " + dir});
      }
    }
  });
  return out;
}

/* ---------- tarjetas: la caja que rodea a una clínica ---------- */
const GENERICO = /^(ver|ver mas|agenda|agendar|reserva|reservar|mas info|mas informacion|como llegar|llamar|whatsapp|ir|detalle|conoce mas|leer mas|ver ficha|ver clinica)$/;
function fuera(el){ return !!el.closest("header,nav,footer,[role=navigation],.menu,[class*='menu'],[id*='menu']"); }

function tarjetaDe(a, esEnlace){
  let n = a, previo = null;
  for(let i = 0; i < 8 && n && n.tagName !== "BODY"; i++){
    const propios = new Set([].filter.call(n.querySelectorAll ? n.querySelectorAll("a[href]") : [], esEnlace)
      .map(function(x){ return (x.getAttribute("href") || "").replace(/[#?].*$/, "").replace(/\/+$/, ""); }));
    if(propios.size > 1) return previo;              // ya abarca otra clínica: me quedo con el anterior
    if(lineas(n).some(pareceDireccion)) return n;
    previo = n; n = n.parentElement;
  }
  return null;
}

function datosDeTarjeta(card, a, base){
  const ls = lineas(card);
  const h = card.querySelector("h1,h2,h3,h4,h5,h6,strong,b,.title,[class*='titulo'],[class*='title'],[class*='nombre']");
  let nombre = h ? txt(h) : "";
  if(GENERICO.test(norm(nombre)) || nombre.length > 90 || pareceDireccion(nombre)) nombre = "";
  if(!nombre && a){ const t = txt(a); if(t && !GENERICO.test(norm(t)) && t.length < 80 && !pareceDireccion(t)) nombre = t; }
  if(!nombre){
    nombre = ls.find(function(l){
      return !pareceDireccion(l) && !RE_FONO.test(l) && !pareceHorario(l) && !GENERICO.test(norm(l)) && l.length < 70;
    }) || "";
  }
  const direccion = ls.find(pareceDireccion) || "";
  const fono = ls.join("  ").match(RE_FONO);
  let url = "";
  if(a){ try{ url = urlSegura(new URL(a.getAttribute("href"), base).href); }catch(e){} }
  return {nombre: nombre, direccion: direccion, telefono: fono ? fono[0].trim() : "",
          horario: ls.filter(pareceHorario).slice(0, 2).join(" · "), url: url, texto: ls.join(" ")};
}

// Último recurso: un título con una dirección justo debajo
function desdeEncabezados(doc){
  const out = [], vistas = {};
  doc.querySelectorAll("h2,h3,h4,h5").forEach(function(h){
    if(fuera(h)) return;
    const nombre = txt(h);
    if(!nombre || nombre.length > 80 || GENERICO.test(norm(nombre))) return;
    let ls = [], n = h.nextElementSibling, k = 0;
    while(n && k < 5 && !/^H[1-5]$/.test(n.tagName)){ ls = ls.concat(lineas(n)); n = n.nextElementSibling; k++; }
    const dir = ls.find(pareceDireccion);
    if(!dir || vistas[norm(dir)]) return;
    vistas[norm(dir)] = 1;
    const fono = ls.join("  ").match(RE_FONO);
    out.push({nombre: nombre, direccion: dir, telefono: fono ? fono[0].trim() : "",
              horario: ls.filter(pareceHorario).slice(0, 2).join(" · "), url: "", texto: nombre + " " + ls.join(" ")});
  });
  return out;
}

/* ---------- Uno Salud ---------- */
function parsearIndiceUnoSalud(html){
  const doc = docDe(html), m = {};
  function agregar(slug, nombre){
    slug = String(slug || "").toLowerCase();
    if(!/^(?=.*[a-z])[a-z0-9-]{2,50}$/.test(slug) || m[slug]) return;
    nombre = String(nombre || "").replace(/\s+/g, " ").trim();
    if(!nombre || nombre.length > 60 || GENERICO.test(norm(nombre)) || /\d/.test(nombre)) nombre = humanizar(slug);
    m[slug] = nombre.replace(/^cl[ií]nicas? dentales? en (la comuna de )?/i, "");
  }
  doc.querySelectorAll('a[href*="/region-comuna/"]').forEach(function(a){
    const mm = (a.getAttribute("href") || "").match(/\/region-comuna\/([^\/?#]+)\/?/i);
    if(mm) agregar(mm[1], txt(a));
  });
  doc.querySelectorAll("option").forEach(function(o){
    const v = (o.getAttribute("value") || "").trim(), t = txt(o);
    if(/\/region-comuna\//.test(v)){ const mm = v.match(/\/region-comuna\/([^\/?#]+)/); if(mm) agregar(mm[1], t); }
    else if(t && !/selecciona|todas|elige/i.test(t)) agregar(v, t);
  });
  return Object.keys(m).map(function(slug){ return {slug: slug, nombre: m[slug]}; });
}

function parsearComunaUnoSalud(html, base){
  const doc = docDe(html);
  const d = {titulo: txt(doc.querySelector("title")), estrategia: "", muestra: muestraHTML(doc)};
  const esFicha = function(a){
    const h = a.getAttribute("href") || "";
    return /\/clinicas\/[^\/?#]+\/?(?:[?#].*)?$/i.test(h) && !fuera(a);
  };
  const vistas = {}, porEnlace = [];
  [].filter.call(doc.querySelectorAll("a[href]"), esFicha).forEach(function(a){
    let k = ""; try{ k = new URL(a.getAttribute("href"), base).pathname.replace(/\/+$/, ""); }catch(e){ return; }
    if(vistas[k]) return;
    const card = tarjetaDe(a, esFicha);
    if(!card) return;
    const x = datosDeTarjeta(card, a, base);
    if(!x.direccion) return;                         // sin dirección no es una sucursal (menús, migas)
    if(!x.nombre) x.nombre = humanizar(k.split("/").pop());
    vistas[k] = 1;
    porEnlace.push(x);
  });
  const ld = desdeJsonLd(doc);
  let lista = porEnlace.length >= ld.length ? porEnlace : ld;
  d.estrategia = lista === porEnlace ? "enlaces a fichas" : "datos estructurados";
  if(!lista.length){ lista = desdeEncabezados(doc); d.estrategia = "títulos"; }
  d.encontradas = lista.length;
  d.enlacesFicha = [].filter.call(doc.querySelectorAll("a[href]"), esFicha).length;
  return {lista: lista, diag: d};
}

async function indiceUnoSalud(fresco){
  const c = fresco ? null : await cacheLeer("red_uno_indice", 7 * DIA);
  if(c && c.length) return c;
  const m = {};
  diag.indice = [];
  for(const u of RED.unosalud.indices){
    const r = await traer(u);
    diag.indice.push({url: u, status: r.status, error: r.error || ""});
    if(r.ok) parsearIndiceUnoSalud(r.html).forEach(function(x){ if(!m[x.slug]) m[x.slug] = x; });
  }
  const lista = Object.keys(m).map(function(k){ return m[k]; });
  if(lista.length) cacheEscribir("red_uno_indice", lista);
  return lista;
}

async function clinicasUnoSalud(comuna, fresco){
  const clave = "red_uno_" + comuna.slug;
  const c = fresco ? null : await cacheLeer(clave, DIA);
  if(c) return c;
  const url = RED.unosalud.comuna(comuna.slug);
  const r = await traer(url);
  diag.unosalud = {url: url, status: r.status, error: r.error || ""};
  if(r.status === 404) return {lista: [], url: url, error: "", sinPagina: true};
  if(!r.ok) return {lista: [], url: url, error: r.error || ("el sitio respondió " + r.status)};
  const p = parsearComunaUnoSalud(r.html, r.url);
  Object.assign(diag.unosalud, p.diag);
  const res = {lista: p.lista, url: url, error: ""};
  if(p.lista.length) cacheEscribir(clave, res);       // un cero puede ser un fallo de lectura: no se guarda
  return res;
}


/* ---------- datos escondidos en los scripts ----------
   Muchos sitios no traen el listado en el HTML: lo dibujan con
   JavaScript a partir de un arreglo de datos que va dentro de la
   página. Se buscan arreglos JSON cuyos objetos tengan cara de
   sucursal (un nombre y una dirección). */
const CAMPOS_DIR = /^(direcci[oó]n|direccion|address|addr|calle|domicilio|ubicaci[oó]n|street|streetaddress)$/i;
const CAMPOS_NOM = /^(nombre|name|title|titulo|t[ií]tulo|cl[ií]nica|clinica|sucursal|sede|label)$/i;
const CAMPOS_COM = /^(comuna|ciudad|city|locality|addresslocality|commune|municipio)$/i;
const CAMPOS_FON = /^(tel[eé]fono|telefono|phone|fono|telephone|celular)$/i;

function valorTexto(v){
  if(v == null) return "";
  if(typeof v === "string" || typeof v === "number") return String(v).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if(typeof v === "object" && !Array.isArray(v)){
    if(v.rendered) return valorTexto(v.rendered);
    if(v.streetAddress) return [v.streetAddress, v.addressLocality].filter(Boolean).join(", ");
  }
  return "";
}
function sucursalDeObjeto(o){
  if(!o || typeof o !== "object" || Array.isArray(o)) return null;
  let nombre = "", direccion = "", comuna = "", telefono = "";
  Object.keys(o).forEach(function(k){
    const v = valorTexto(o[k]);
    if(!v) return;
    if(!direccion && CAMPOS_DIR.test(k)) direccion = v;
    else if(!nombre && CAMPOS_NOM.test(k)) nombre = v;
    else if(!comuna && CAMPOS_COM.test(k)) comuna = v;
    else if(!telefono && CAMPOS_FON.test(k)) telefono = v;
  });
  if(!nombre || !direccion || direccion.length > 200) return null;
  if(comuna && direccion.toLowerCase().indexOf(comuna.toLowerCase()) === -1) direccion += ", " + comuna;
  return {nombre: nombre, direccion: direccion, telefono: telefono, horario: "", url: urlSegura(o.url || o.link || o.permalink || ""),
          texto: nombre + " " + direccion};
}
function buscarEnJson(raiz){
  const out = [];
  const pila = [raiz]; let vueltas = 0;
  while(pila.length && vueltas++ < 20000){
    const x = pila.pop();
    if(Array.isArray(x)){
      const suc = x.map(sucursalDeObjeto).filter(Boolean);
      if(suc.length >= 2 && suc.length >= x.length / 2){ out.push.apply(out, suc); continue; }
      x.forEach(function(y){ if(y && typeof y === "object") pila.push(y); });
    }else if(x && typeof x === "object"){
      Object.keys(x).forEach(function(k){ if(x[k] && typeof x[k] === "object") pila.push(x[k]); });
    }
  }
  return out;
}
// Recorre el texto de un script y prueba cada arreglo [ {...} ] balanceado
function arreglosJson(src){
  const out = [];
  if(src.length > 3000000) return out;
  let i = 0;
  while((i = src.indexOf("[", i)) !== -1 && out.length < 40){
    let j = i + 1; while(j < src.length && /\s/.test(src[j])) j++;
    if(src[j] !== "{"){ i++; continue; }
    let nivel = 0, enCadena = false, comilla = "", k = i;
    for(; k < src.length; k++){
      const ch = src[k];
      if(enCadena){ if(ch === "\\"){ k++; continue; } if(ch === comilla) enCadena = false; continue; }
      if(ch === '"' || ch === "'"){ enCadena = true; comilla = ch; continue; }
      if(ch === "[" || ch === "{") nivel++;
      else if(ch === "]" || ch === "}"){ nivel--; if(nivel === 0) break; }
    }
    const trozo = src.slice(i, k + 1);
    if(trozo.length > 40){
      try{ out.push(JSON.parse(trozo)); i = k + 1; continue; }catch(e){}
    }
    i++;
  }
  return out;
}
function desdeScripts(doc){
  const out = [];
  doc.querySelectorAll("script:not([src])").forEach(function(sc){
    const t = sc.textContent || "";
    if(!/direcci|address|sucursal|clinica|clínica|sede/i.test(t)) return;
    if(/json/i.test(sc.type || "")){
      try{ out.push.apply(out, buscarEnJson(JSON.parse(t))); return; }catch(e){}
    }
    arreglosJson(t).forEach(function(a){ out.push.apply(out, buscarEnJson(a)); });
  });
  const vistas = {};
  return out.filter(function(c){ const k = norm(c.direccion); if(vistas[k]) return false; vistas[k] = 1; return true; });
}

// Lo que sirve para entender cómo está armado un sitio que no se deja leer
function radiografia(doc, html){
  const scripts = [].map.call(doc.querySelectorAll("script[src]"), function(x){ return x.getAttribute("src"); }).slice(0, 30);
  const inline = [].map.call(doc.querySelectorAll("script:not([src])"), function(x){ return (x.textContent || "").length; });
  const marcas = [];
  [["__NEXT_DATA__", /__NEXT_DATA__/], ["Nuxt", /__NUXT__/], ["Angular", /ng-version|ng-app/], ["React", /data-reactroot|id="root"/],
   ["Vue", /id="app"|data-v-/], ["Wix", /wix|static\.parastorage/], ["WordPress", /wp-content|wp-json/],
   ["Elementor", /elementor/], ["Store locator", /wpsl|storelocator|store_locator|asl_/i], ["Google Maps", /maps\.googleapis|google\.com\/maps/],
   ["Webflow", /webflow/i], ["Squarespace", /squarespace/i], ["Shopify", /shopify/i]].forEach(function(m){
    if(m[1].test(html)) marcas.push(m[0]);
  });
  const apis = [];
  doc.querySelectorAll("script:not([src])").forEach(function(sc){
    const t = sc.textContent || "";
    (t.match(/["'](https?:\/\/[^"'\s]+|\/[a-z0-9_\-\/.?=&]+)["']/gi) || []).forEach(function(u){
      u = u.slice(1, -1);
      if(/api|ajax|json|clinic|sucursal|sede|red|locat|store|map/i.test(u) && apis.indexOf(u) === -1 && apis.length < 30) apis.push(u);
    });
  });
  return {
    marcas: marcas,
    scripts: scripts,
    scriptsEnLinea: inline.length + " (" + inline.reduce(function(a, b){ return a + b; }, 0) + " caracteres)",
    posiblesApis: apis,
    iframes: [].map.call(doc.querySelectorAll("iframe[src]"), function(x){ return x.getAttribute("src"); }).slice(0, 10),
    enlaces: [].map.call(doc.querySelectorAll("a[href]"), function(a){ return txt(a).slice(0, 40) + " -> " + a.getAttribute("href"); }).slice(0, 60),
    idsSecciones: [].map.call(doc.querySelectorAll("[id]"), function(x){ return x.id; }).slice(0, 60),
    textoVisible: txt(doc.body).slice(0, 2500)
  };
}

/* ---------- i-dental ---------- */
function parsearEdental(html, base){
  const doc = docDe(html);
  const d = {titulo: txt(doc.querySelector("title")), muestra: muestraHTML(doc)};
  const zona = doc.getElementById("clinicas") ||
               doc.querySelector('[id*="clinica" i],[class*="clinica" i],[id*="sucursal" i],[class*="sucursal" i],[id*="sede" i],[class*="sede" i]') ||
               doc.body;
  d.zona = zona === doc.body ? "toda la página" : (zona.id ? "#" + zona.id : "." + String(zona.className).split(/\s+/)[0]);

  // Tarjetas: bloques chicos con una dirección, que no contengan otras tarjetas
  const cand = [].filter.call(zona.querySelectorAll("article,li,div,tr,section"), function(el){
    if(fuera(el)) return false;
    const largo = (el.textContent || "").length;
    if(largo < 12 || largo > 700) return false;
    const ls = lineas(el);
    return ls.length >= 2 && ls.length <= 14 && ls.some(pareceDireccion);
  });
  const minimas = cand.filter(function(el){ return !cand.some(function(o){ return o !== el && el.contains(o); }); });

  // El título de sección que precede a cada tarjeta suele ser la región o la
  // comuna. Los títulos que están dentro de otra tarjeta no cuentan: son el
  // nombre de esa clínica, no una sección.
  const titulos = [].filter.call(doc.querySelectorAll("h1,h2,h3,h4,h5,h6"), function(h){
    return !minimas.some(function(c){ return c.contains(h); });
  });
  function contexto(el){
    let t = "";
    titulos.forEach(function(h){
      if(!el.contains(h) && (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) t = txt(h);
    });
    return t;
  }
  const vistas = {}, lista = [];
  minimas.forEach(function(card){
    const a = card.querySelector("a[href]");
    const x = datosDeTarjeta(card, a, base);
    if(!x.direccion || !x.nombre || vistas[norm(x.direccion)]) return;
    vistas[norm(x.direccion)] = 1;
    x.contexto = contexto(card);
    lista.push(x);
  });
  const ld = desdeJsonLd(doc);
  const js = desdeScripts(doc);
  // Tarjetas con la línea "comuna - provincia - región" (edental.js)
  const ub = typeof tarjetasPorUbicacion === "function" && doc.body ? tarjetasPorUbicacion(doc.body) : [];
  let final = ub, estrategia = "línea de ubicación";
  if(lista.length > final.length){ final = lista; estrategia = "tarjetas"; }
  if(ld.length > final.length){ final = ld; estrategia = "datos estructurados"; }
  if(js.length > final.length){ final = js; estrategia = "datos dentro de los scripts"; }
  d.encontradas = final.length;
  d.estrategia = final.length ? estrategia : "ninguna";
  d.porEstrategia = {ubicacion: ub.length, tarjetas: lista.length, jsonld: ld.length, scripts: js.length};
  if(!final.length) d.radiografia = radiografia(doc, html);
  return {lista: final, diag: d, doc: doc};
}

// El listado de i-dental cambia poco y leerlo abre una pestaña de fondo,
// así que se guarda una semana. "Volver a leer" fuerza una lectura nueva.
const EDE_VIGENCIA = 7 * DIA;
function edentalGuardado(){ return cacheLeer("red_edental", EDE_VIGENCIA); }

// Pide al service worker (background.js) que lea el sitio en una pestaña
// de fondo. forzar: aunque haya un intento reciente sin resultados.
function edentalEnPestana(forzar){
  return new Promise(function(resolver){
    try{
      chrome.runtime.sendMessage({tipo: "edentalVivo", forzar: !!forzar}, function(r){
        if(chrome.runtime.lastError || !r) resolver(null); else resolver(r);
      });
    }catch(e){ resolver(null); }
  });
}
function hayPestanas(){
  try{ return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage); }catch(e){ return false; }
}

// opciones.esperar: el mapeo espera la lectura en pestaña; el buscador no,
// sólo la encarga y sigue (el listado aparece solo cuando queda guardado).
async function clinicasEdental(fresco, opciones){
  opciones = opciones || {};
  const c = fresco ? null : await edentalGuardado();
  if(c) return c;
  diag.edental = {};

  // 1. La dirección de datos que usa el propio sitio, si ya se conoce
  const api = await new Promise(function(res){ almacen.leer("ede_api", res); });
  if(api && typeof clinicasDeJson === "function"){
    const r = await traer(api);
    diag.edental.api = {url: api, status: r.status, error: r.error || ""};
    if(r.ok){
      let lista = [];
      try{ lista = clinicasDeJson(JSON.parse(r.html)); }catch(e){ diag.edental.api.error = "no es JSON"; }
      diag.edental.api.encontradas = lista.length;
      if(lista.length){
        const res = {lista: lista, error: ""};
        cacheEscribir("red_edental", res);
        return res;
      }
    }
  }

  // 2. El HTML tal cual: rápido, y basta si algún día el sitio lo trae armado
  const r = await traer(RED.edental.portada);
  Object.assign(diag.edental, {url: RED.edental.portada, status: r.status, error: r.error || ""});
  let res = {lista: [], error: r.ok ? "" : (r.error || ("el sitio respondió " + r.status))};
  if(r.ok){
    const p = parsearEdental(r.html, r.url);
    Object.assign(diag.edental, p.diag);
    res.lista = p.lista;
  }
  if(res.lista.length){ cacheEscribir("red_edental", res); return res; }

  // 3. El sitio arma el listado con JavaScript: se lee en una pestaña de fondo
  if(!hayPestanas()) return res;
  if(!opciones.esperar){
    // Si la última lectura aparte no encontró nada hace poco, no se insiste
    const intento = await new Promise(function(res){ almacen.leer("ede_intento", res); });
    if(intento && !intento.n && Date.now() - intento.t < 6 * 60 * 60 * 1000){
      diag.edental.pestana = await new Promise(function(res){ almacen.leer("diag_edental_vivo", res); });
      return res;
    }
    edentalEnPestana(false);
    return {lista: [], error: "", pendiente: true};
  }
  const v = await edentalEnPestana(fresco);
  if(v){
    diag.edental.pestana = v.diag;
    if(v.res.lista.length){ delete diag.edental.radiografia; delete diag.edental.muestra; }
    res = v.res;
  }
  return res;
}


/* ============================================================
   MAPEO COMPLETO
   Recorre todas las comunas de Uno Salud y el listado entero de
   i-dental, y deja cada sucursal asignada a una sola comuna. Con
   el mapeo guardado, el buscador responde sin consultar los sitios.
   ============================================================ */
const MAPEO_VIGENCIA = 30 * DIA;

function contienePalabra(texto, nombre){
  const n = norm(nombre);
  return !!n && (" " + norm(texto) + " ").indexOf(" " + n + " ") !== -1;
}
// La misma sucursal puede venir de páginas leídas con estrategias distintas
// (con o sin enlace a su ficha). Lo que no cambia es la calle y el número.
function claveSucursal(c){
  const calle = norm(String(c.direccion || "").split(",")[0]);
  if(calle) return "d:" + calle;
  if(c.url) return "u:" + c.url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
  return "n:" + norm(c.nombre);
}
function sucursalLimpia(c){
  return {nombre: c.nombre || "", direccion: c.direccion || "", telefono: c.telefono || "",
          horario: c.horario || "", url: urlSegura(c.url)};
}

// A qué comuna pertenece una clínica de i-dental. Se prueba en orden de
// confianza: lo que va después de la última coma de la dirección, una
// comuna conocida dentro de la dirección, dentro de la tarjeta, y por
// último el título de la sección.
function ubicarClinica(c, conocidas){
  // La tarjeta dice la comuna ("Providencia - Santiago - REGIÓN ...")
  if(c.comuna){
    const exacta = conocidas.find(function(n){ return norm(n) === norm(c.comuna); }) ||
                   conocidas.find(function(n){ const p = puntaje(c.comuna, n); return p !== null && p <= 3 && Math.abs(norm(n).length - norm(c.comuna).length) <= 2; });
    return {comuna: exacta || nombreComuna(c.comuna), porSeccion: false};
  }
  function mejor(texto){
    return conocidas.filter(function(n){ return contienePalabra(texto, n); })
                    .sort(function(a, b){ return b.length - a.length; })[0] || "";
  }
  const partes = String(c.direccion || "").split(",").map(function(t){ return t.trim(); }).filter(Boolean);
  const cola = partes.length > 1 ? partes[partes.length - 1] : "";
  if(cola && !/\d/.test(cola) && cola.length <= 32){
    const conocida = conocidas.find(function(n){
      const p = puntaje(cola, n);
      return p !== null && p <= 4 && norm(cola).length >= norm(n).length - 2;
    });
    return {comuna: conocida || cola.replace(/\.$/, ""), porSeccion: false};
  }
  const propia = mejor(c.direccion) || mejor(c.texto);
  if(propia) return {comuna: propia, porSeccion: false};
  const seccion = mejor(c.contexto);
  return {comuna: seccion, porSeccion: !!seccion};
}
// "SAN PEDRO DE LA PAZ" -> "San Pedro De La Paz" con las partículas en minúscula
function nombreComuna(t){
  t = String(t || "").trim();
  if(t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s-])(\S)/g, function(m, a, b){ return a + b.toUpperCase(); })
          .replace(/ (De|Del|La|Las|Los|El|Y)(?= )/g, function(m){ return m.toLowerCase(); });
}
function comunaDeClinica(c, conocidas){ return ubicarClinica(c, conocidas).comuna; }

function armarMapeo(paginasUno, ede, indice){
  const conocidas = indice.map(function(x){ return x.nombre; });
  const comunas = {};
  function entrada(nombre, slug){
    const k = norm(nombre);
    if(!comunas[k]) comunas[k] = {nombre: nombre, slug: slug || "", uno: [], ede: []};
    if(slug && !comunas[k].slug) comunas[k].slug = slug;
    return comunas[k];
  }

  // Uno Salud. Hay páginas de comuna y páginas de región, y una sucursal sale
  // en las dos. Una página es de región si sus sucursales nombran dos o más
  // comunas distintas de la suya.
  const esRegion = {};
  paginasUno.forEach(function(pg){
    const otras = {};
    (pg.lista || []).forEach(function(c){
      conocidas.forEach(function(n){
        if(norm(n) !== norm(pg.nombre) && contienePalabra(c.direccion, n)) otras[norm(n)] = 1;
      });
    });
    esRegion[pg.slug] = Object.keys(otras).length >= 2;
  });

  const porClave = {};
  paginasUno.forEach(function(pg){
    (pg.lista || []).forEach(function(c){
      const k = claveSucursal(c);
      (porClave[k] = porClave[k] || {c: c, paginas: []}).paginas.push(pg);
    });
  });
  // Cada sucursal va a una sola comuna: la página de comuna que nombra su
  // dirección; si ninguna, la página de comuna más chica. Si sólo salió en
  // páginas de región, la comuna se saca de su dirección.
  Object.keys(porClave).forEach(function(k){
    const it = porClave[k];
    const deComuna = it.paginas.filter(function(p){ return !esRegion[p.slug]; });
    const pg = deComuna.find(function(p){ return contienePalabra(it.c.direccion, p.nombre); }) ||
               deComuna.slice().sort(function(a, b){ return a.lista.length - b.lista.length; })[0];
    if(pg){ entrada(pg.nombre, pg.slug).uno.push(sucursalLimpia(it.c)); return; }
    const u = ubicarClinica(it.c, conocidas);
    const conocida = u.comuna && indice.find(function(x){ return norm(x.nombre) === norm(u.comuna); });
    if(conocida) entrada(conocida.nombre, conocida.slug).uno.push(sucursalLimpia(it.c));
    else if(u.comuna) entrada(u.comuna, "").uno.push(sucursalLimpia(it.c));
    else entrada(it.paginas[0].nombre, it.paginas[0].slug).uno.push(sucursalLimpia(it.c));
  });

  // i-dental
  const sinComuna = [];
  (ede.lista || []).forEach(function(c){
    const u = ubicarClinica(c, conocidas);
    if(!u.comuna){ sinComuna.push(sucursalLimpia(c)); return; }
    const conocida = indice.find(function(x){ return norm(x.nombre) === norm(u.comuna); });
    const s = sucursalLimpia(c);
    if(u.porSeccion) s.porSeccion = true;
    entrada(conocida ? conocida.nombre : u.comuna, conocida ? conocida.slug : "").ede.push(s);
  });

  const lista = Object.keys(comunas).map(function(k){ return comunas[k]; })
    .filter(function(c){ return c.uno.length || c.ede.length; })
    .sort(function(a, b){ return a.nombre.localeCompare(b.nombre, "es"); });

  const fallidas = paginasUno.filter(function(p){ return p.error; }).map(function(p){ return p.nombre + ": " + p.error; });
  return {
    version: 1,
    generado: Date.now(),
    comunas: lista,
    sinComuna: sinComuna,
    resumen: {
      comunas: lista.length,
      conUno: lista.filter(function(c){ return c.uno.length; }).length,
      conEde: lista.filter(function(c){ return c.ede.length; }).length,
      conAmbas: lista.filter(function(c){ return c.uno.length && c.ede.length; }).length,
      sucursalesUno: lista.reduce(function(a, c){ return a + c.uno.length; }, 0),
      sucursalesEde: lista.reduce(function(a, c){ return a + c.ede.length; }, 0) + sinComuna.length,
      paginasLeidas: paginasUno.length,
      paginasRegion: Object.keys(esRegion).filter(function(k){ return esRegion[k]; }).length,
      paginasFallidas: fallidas.length,
      edeError: ede.error || ""
    },
    fallidas: fallidas
  };
}

function leerMapeo(){
  return new Promise(function(res){
    almacen.leer("mapeo", function(m){ res(m && m.comunas && (Date.now() - m.generado) < MAPEO_VIGENCIA ? m : null); });
  });
}

function mapeoCSV(m){
  const filas = [["red", "comuna", "sucursal", "direccion", "telefono", "horario", "fuente"]];
  m.comunas.forEach(function(c){
    c.uno.forEach(function(s){ filas.push(["Uno Salud Dental", c.nombre, s.nombre, s.direccion, s.telefono, s.horario, s.url]); });
    c.ede.forEach(function(s){ filas.push(["e-Dental", c.nombre, s.nombre, s.direccion, s.telefono, s.horario, s.url]); });
  });
  (m.sinComuna || []).forEach(function(s){ filas.push(["e-Dental", "", s.nombre, s.direccion, s.telefono, s.horario, s.url]); });
  // Punto y coma y BOM: así lo abre bien Excel en español, con tildes
  return "﻿" + filas.map(function(f){
    return f.map(function(v){ v = String(v || ""); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(";");
  }).join("\r\n");
}
