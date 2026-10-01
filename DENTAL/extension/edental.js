/* ============================================================
   LECTOR DE TARJETAS DE i-dental (e-dentalsys.com)
   Cada clínica del listado trae una línea con su ubicación:
     CLÍNICA VICHUQUÉN
     Coquimbo #838.
     Antofagasta - Antofagasta - REGIÓN DE ANTOFAGASTA
   (comuna - provincia - región). Esa línea es el ancla: de ahí
   sale la comuna sin adivinar, la línea anterior es la dirección
   y la primera de la tarjeta es el nombre.

   El sitio arma el listado con JavaScript después de cargar, así
   que leer el HTML no basta. La extensión abre el sitio en una
   pestaña de fondo, inyecta este archivo y llama a
   leerEdentalVivo(), que espera a que aparezcan las tarjetas.

   Todo lo que hay aquí es autónomo (no usa nada de redes.js),
   porque también corre dentro de la pestaña del sitio.
   ============================================================ */

var EDE_UBICACION = /^(.+?)\s+-\s+(?:(.+?)\s+-\s+)?(regi[oó]n\b.+)$/i;
var EDE_FONO = /(\+?56[\s-]?)?(600[\s-]?\d{3}[\s-]?\d{4}|\(?22?\)?[\s-]?\d{3,4}[\s-]?\d{4}|9[\s-]?\d{4}[\s-]?\d{4})/;
var EDE_INLINE = /^(A|ABBR|B|BDI|BDO|CITE|CODE|EM|FONT|I|LABEL|MARK|Q|S|SMALL|SPAN|STRONG|SUB|SUP|TIME|U)$/;
var EDE_IGNORAR = /^(SCRIPT|STYLE|NOSCRIPT|SVG|TEMPLATE|SELECT|OPTION|BUTTON|IFRAME)$/;

function edeTexto(el){ return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : ""; }

// Líneas de un bloque, como se verían en pantalla: cada bloque es una línea
// y lo que está en línea (span, strong, a) se junta con su vecino.
function edeLineas(el){
  var out = [], actual = "";
  function cortar(){ var t = actual.replace(/\s+/g, " ").trim(); if(t) out.push(t); actual = ""; }
  function recorrer(n){
    if(n.nodeType === 3){ actual += n.nodeValue; return; }
    if(n.nodeType !== 1 || EDE_IGNORAR.test(n.tagName)) return;
    if(n.tagName === "BR"){ cortar(); return; }
    var bloque = !EDE_INLINE.test(n.tagName);
    if(bloque) cortar();
    for(var i = 0; i < n.childNodes.length; i++) recorrer(n.childNodes[i]);
    if(bloque) cortar();
  }
  recorrer(el);
  cortar();
  return out;
}

// Elementos más chicos cuyo texto completo es una línea de ubicación
function edeUbicaciones(raiz){
  var todos = raiz.querySelectorAll("p,div,span,li,small,address,td,h3,h4,h5,h6,a");
  var hits = [];
  for(var i = 0; i < todos.length; i++){
    var el = todos[i];
    if(el.closest("select,option,nav,header,footer,script")) continue;
    var t = edeTexto(el);
    if(t.length < 8 || t.length > 160 || !EDE_UBICACION.test(t)) continue;
    hits.push(el);
  }
  return hits.filter(function(el){ return !hits.some(function(o){ return o !== el && el.contains(o); }); });
}

function tarjetasPorUbicacion(raiz){
  var ubic = edeUbicaciones(raiz);
  var vistas = {}, lista = [];
  ubic.forEach(function(u){
    // Se sube hasta tener nombre y dirección arriba de la ubicación, sin
    // tragarse otra tarjeta.
    var card = u;
    while(card.parentElement && card.parentElement !== raiz && card.parentElement.tagName !== "BODY"){
      var p = card.parentElement;
      if(ubic.some(function(o){ return o !== u && p.contains(o); })) break;
      if(edeTexto(p).length > 1500) break;
      card = p;
      var antes = edeLineas(card), pos = antes.indexOf(edeTexto(u));
      if(pos >= 2) break;
    }
    var ls = edeLineas(card).filter(function(l){ return !/^[★☆✩✪\s]+$/.test(l); });
    var tu = edeTexto(u), iu = ls.indexOf(tu);
    if(iu < 0) iu = ls.length;
    var arriba = ls.slice(0, iu);
    var nombre = arriba[0] || "";
    var direccion = arriba.length > 1 ? arriba[arriba.length - 1] : "";
    if(!nombre || nombre === tu) return;
    var m = tu.match(EDE_UBICACION);
    var fono = "";
    ls.forEach(function(l){ if(!fono && EDE_FONO.test(l) && l !== direccion) fono = (l.match(EDE_FONO) || [""])[0].trim(); });
    var a = card.querySelector('a[href^="https://"]');
    var x = {
      nombre: nombre,
      direccion: direccion.replace(/\.$/, ""),
      comuna: m[1].trim(),
      provincia: (m[2] || "").trim(),
      region: m[3].trim(),
      telefono: fono,
      horario: "",
      url: a ? a.href : "",
      texto: ls.join(" · ").slice(0, 400)
    };
    var k = (x.nombre + "|" + x.direccion).toLowerCase();
    if(vistas[k]) return;
    vistas[k] = 1;
    lista.push(x);
  });
  return lista;
}

// Corre DENTRO de la pestaña de e-dentalsys.com. Espera a que el listado
// se arme y deje de crecer, empujando el scroll por si carga de a poco.
function leerEdentalVivo(maxMs){
  maxMs = maxMs || 20000;
  return new Promise(function(resolver){
    var inicio = Date.now(), ultimo = -1, quietos = 0;
    function empujar(){
      var zona = document.getElementById("clinicas");
      if(zona && zona.scrollIntoView) zona.scrollIntoView();
      var u = edeUbicaciones(document.body)[0];
      for(var el = u; el && el !== document.body; el = el.parentElement){
        var cs = getComputedStyle(el);
        if(/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4){ el.scrollTop = el.scrollHeight; break; }
      }
      [].forEach.call(document.querySelectorAll("button,a"), function(b){
        if(/^(ver|cargar|mostrar) m[aá]s/i.test(edeTexto(b)) && b.offsetParent) b.click();
      });
    }
    function terminar(lista){
      var recursos = [];
      try{
        recursos = performance.getEntriesByType("resource")
          .filter(function(e){ return /xmlhttprequest|fetch/.test(e.initiatorType); })
          .map(function(e){ return e.name; }).slice(0, 40);
      }catch(e){}
      var pag = [].map.call(document.querySelectorAll('[class*="pagin" i] a,[class*="pagin" i] button,[class*="pagin" i] li'), edeTexto)
                  .filter(Boolean).slice(0, 20);
      resolver({
        lista: lista,
        url: location.href,
        titulo: document.title,
        ms: Date.now() - inicio,
        recursos: recursos,
        paginacion: pag,
        texto: lista.length ? "" : String(document.body ? document.body.innerText : "").replace(/\s+/g, " ").slice(0, 2000)
      });
    }
    function mirar(){
      var lista = tarjetasPorUbicacion(document.body);
      if(lista.length && lista.length === ultimo) quietos++; else quietos = 0;
      ultimo = lista.length;
      if(lista.length && quietos >= 3) return terminar(lista);
      if(Date.now() - inicio > maxMs) return terminar(lista);
      empujar();
      setTimeout(mirar, 600);
    }
    mirar();
  });
}
