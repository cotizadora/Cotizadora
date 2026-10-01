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
    nombre: "Uno Salud",
    sitio: "https://www.unosalud.cl/region-comuna/",
    indices: ["https://www.unosalud.cl/region-comuna/", "https://www.unosalud.cl/clinicas/"],
    comuna: function(slug){ return "https://www.unosalud.cl/region-comuna/" + slug + "/"; }
  },
  edental: {
    nombre: "i-dental",
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

// Pide al service worker (background.js) que abra el sitio en una pestaña
// de fondo y lea las tarjetas ya armadas.
function edentalEnPestana(){
  return new Promise(function(resolver){
    try{
      chrome.runtime.sendMessage({tipo: "edentalVivo"}, function(r){
        if(chrome.runtime.lastError || !r) resolver(null); else resolver(r);
      });
    }catch(e){ resolver(null); }
  });
}
function hayPestanas(){
  try{ return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage); }catch(e){ return false; }
}

async function clinicasEdental(fresco){
  const c = fresco ? null : await edentalGuardado();
  if(c) return c;

  // 1. El HTML tal cual: rápido, y basta si algún día el sitio lo trae armado
  const r = await traer(RED.edental.portada);
  diag.edental = {url: RED.edental.portada, status: r.status, error: r.error || ""};
  let res = {lista: [], error: r.ok ? "" : (r.error || ("el sitio respondió " + r.status))};
  if(r.ok){
    const p = parsearEdental(r.html, r.url);
    Object.assign(diag.edental, p.diag);
    res.lista = p.lista;
  }

  // 2. Sin tarjetas en el HTML: el sitio las arma con JavaScript. Se abre en
  //    una pestaña de fondo, se leen ya armadas y se cierra sola.
  if(!res.lista.length && hayPestanas()){
    const v = await edentalEnPestana();
    if(v){
      diag.edental.pestana = v.diag;
      if(v.res.lista.length){ delete diag.edental.radiografia; delete diag.edental.muestra; }
      res = v.res;
    }
  }
  if(res.lista.length) cacheEscribir("red_edental", res);
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
    c.uno.forEach(function(s){ filas.push(["Uno Salud", c.nombre, s.nombre, s.direccion, s.telefono, s.horario, s.url]); });
    c.ede.forEach(function(s){ filas.push(["i-dental", c.nombre, s.nombre, s.direccion, s.telefono, s.horario, s.url]); });
  });
  (m.sinComuna || []).forEach(function(s){ filas.push(["i-dental", "", s.nombre, s.direccion, s.telefono, s.horario, s.url]); });
  // Punto y coma y BOM: así lo abre bien Excel en español, con tildes
  return "﻿" + filas.map(function(f){
    return f.map(function(v){ v = String(v || ""); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(";");
  }).join("\r\n");
}
