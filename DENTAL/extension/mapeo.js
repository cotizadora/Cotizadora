/* Pestaña de mapeo: recorre los dos sitios y muestra el mapa completo. */
const $ = function(id){ return document.getElementById(id); };
let mapeo = null;
const abiertas = {};

function pausa(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function fecha(t){ const d = new Date(t); return String(d.getDate()).padStart(2,"0")+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+d.getFullYear(); }

function progreso(hechas, total, texto){
  $("barraIn").style.width = Math.round(100 * hechas / Math.max(1, total)) + "%";
  $("estado").textContent = texto;
}

async function hacerMapeo(){
  $("empezar").disabled = true;
  $("progreso").hidden = false;
  progreso(0, 1, "Leyendo la lista de comunas de Uno Salud…");

  const indice = await indiceUnoSalud(true);
  const total = indice.length + 1;
  const paginas = [];
  let hechas = 0;

  // De a tres páginas a la vez, con una pausa entre cada una: rápido, sin
  // cargar el sitio.
  const cola = indice.slice();
  async function trabajador(){
    while(cola.length){
      const com = cola.shift();
      const r = await clinicasUnoSalud(com, true);
      paginas.push({slug: com.slug, nombre: com.nombre, lista: r.lista || [], error: r.error || "", sinPagina: !!r.sinPagina});
      hechas++;
      progreso(hechas, total, "Uno Salud · " + com.nombre + " · " +
               (r.error ? "sin respuesta" : (r.lista || []).length + " sucursales") + "  (" + hechas + " de " + indice.length + ")");
      await pausa(250);
    }
  }
  await Promise.all([trabajador(), trabajador(), trabajador()]);

  // Un segundo intento para las que fallaron
  for(const pg of paginas.filter(function(p){ return p.error; })){
    progreso(hechas, total, "Reintentando " + pg.nombre + "…");
    const r = await clinicasUnoSalud(pg, true);
    if(!r.error){ pg.lista = r.lista || []; pg.error = ""; }
    await pausa(400);
  }

  progreso(hechas, total, "Leyendo el listado de i-dental (se abre unos segundos en una pestaña de fondo)…");
  const ede = await clinicasEdental(true);
  progreso(total, total, "Listo.");

  mapeo = armarMapeo(paginas, ede, indice);
  mapeo.sinIndice = !indice.length;
  almacen.escribir("mapeo", mapeo);
  $("empezar").disabled = false;
  $("empezar").textContent = "Volver a hacer el mapeo";
  mostrar();
}

function cifra(n, t){ return '<div class="cifra"><b>' + n + '</b><span>' + t + '</span></div>'; }

function mostrar(){
  if(!mapeo) return;
  const r = mapeo.resumen;
  $("resultado").hidden = false;
  $("vigente").textContent = "Mapeo del " + fecha(mapeo.generado) + ". El buscador lo usa durante 30 días.";
  $("cifras").innerHTML =
    cifra(r.comunas, "comunas con sucursales") +
    cifra(r.conAmbas, "con las dos redes") +
    cifra(r.sucursalesUno, "sucursales Uno Salud") +
    cifra(r.sucursalesEde, "sucursales i-dental");

  const av = [];
  if(mapeo.sinIndice){
    av.push('<p class="mp-aviso mal">No pude leer la lista de comunas de Uno Salud. ' +
            '<button type="button" data-diag="indice">Copiar diagnóstico</button></p>');
  }
  if(r.paginasFallidas){
    av.push('<p class="mp-aviso">' + r.paginasFallidas + ' página(s) de Uno Salud no respondieron: ' +
            esc(mapeo.fallidas.join(" · ")) + '. Vuelve a hacer el mapeo más tarde para completarlas.</p>');
  }
  if(!r.sucursalesUno && !mapeo.sinIndice){
    av.push('<p class="mp-aviso mal">Leí ' + r.paginasLeidas + ' páginas de Uno Salud pero no encontré ninguna sucursal: ' +
            'el sitio debe haber cambiado su diseño. <button type="button" data-diag="unosalud">Copiar diagnóstico</button></p>');
  }
  if(r.edeError || !r.sucursalesEde){
    av.push('<p class="mp-aviso mal">No pude leer el listado de i-dental' + (r.edeError ? ' (' + esc(r.edeError) + ')' : '') +
            '. <button type="button" data-diag="edental">Copiar diagnóstico</button></p>');
  }
  if(mapeo.sinComuna && mapeo.sinComuna.length){
    av.push('<p class="mp-aviso">' + mapeo.sinComuna.length + ' clínica(s) de i-dental sin comuna identificable: ' +
            esc(mapeo.sinComuna.map(function(s){ return s.nombre + " (" + s.direccion + ")"; }).join(" · ")) +
            '. Están en el CSV con la comuna en blanco.</p>');
  }
  $("avisos").innerHTML = av.join("");
  pintarTabla();
}

function lineaSucursal(s){
  return '<p class="det-suc"><b>' + esc(s.nombre) + '</b>' +
    (s.direccion ? ' · ' + esc(s.direccion) : '') +
    (s.telefono ? ' <span>· ' + esc(s.telefono) + '</span>' : '') +
    (s.horario ? ' <span>· ' + esc(s.horario) + '</span>' : '') +
    (urlSegura(s.url) ? ' <a class="fuente" href="' + esc(s.url) + '" target="_blank" rel="noopener">ficha &#8599;</a>' : '') +
    '</p>';
}

function pintarTabla(){
  const q = norm($("filtro").value), ambas = $("soloAmbas").checked;
  const lista = mapeo.comunas.filter(function(c){
    if(ambas && !(c.uno.length && c.ede.length)) return false;
    return !q || norm(c.nombre).indexOf(q) !== -1;
  });
  $("filas").innerHTML = lista.map(function(c){
    const k = norm(c.nombre);
    let h = '<tr class="com" data-k="' + esc(k) + '"><td>' + esc(c.nombre) + '</td>' +
      '<td class="n ' + (c.uno.length ? '' : 'cero') + '">' + c.uno.length + '</td>' +
      '<td class="n ' + (c.ede.length ? '' : 'cero') + '">' + c.ede.length + '</td></tr>';
    if(abiertas[k]){
      h += '<tr class="det"><td colspan="3">' +
        (c.uno.length ? '<div class="det-red">Uno Salud</div>' + c.uno.map(lineaSucursal).join("") : '') +
        (c.ede.length ? '<div class="det-red">i-dental</div>' + c.ede.map(lineaSucursal).join("") : '') +
        '</td></tr>';
    }
    return h;
  }).join("") || '<tr><td colspan="3" class="cero">Ninguna comuna coincide con el filtro.</td></tr>';
}

function descargar(nombre, contenido, tipo){
  const url = URL.createObjectURL(new Blob([contenido], {type: tipo}));
  const a = document.createElement("a");
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
}
function hoyISO(){ return new Date().toISOString().slice(0, 10); }

$("empezar").addEventListener("click", hacerMapeo);
$("filtro").addEventListener("input", pintarTabla);
$("soloAmbas").addEventListener("change", pintarTabla);
$("filas").addEventListener("click", function(e){
  const tr = e.target.closest("tr.com");
  if(!tr) return;
  abiertas[tr.dataset.k] = !abiertas[tr.dataset.k];
  pintarTabla();
});
$("bajarCSV").addEventListener("click", function(){
  descargar("mapeo-sucursales-" + hoyISO() + ".csv", mapeoCSV(mapeo), "text/csv;charset=utf-8");
});
$("bajarJSON").addEventListener("click", function(){
  descargar("mapeo-sucursales-" + hoyISO() + ".json", JSON.stringify(mapeo, null, 1), "application/json");
});
$("copiarCSV").addEventListener("click", function(){
  const b = this;
  navigator.clipboard.writeText(mapeoCSV(mapeo).replace(/^﻿/, "")).then(
    function(){ b.textContent = "CSV copiado"; },
    function(){ b.textContent = "No se pudo copiar"; });
});
$("avisos").addEventListener("click", function(e){
  const b = e.target.closest("[data-diag]");
  if(!b) return;
  const info = {red: b.dataset.diag, cuando: new Date().toISOString(), indice: diag.indice || null,
                lectura: diag[b.dataset.diag] || null};
  navigator.clipboard.writeText("DIAGNOSTICO MAPEO " + b.dataset.diag.toUpperCase() + "\n" + JSON.stringify(info, null, 1)).then(
    function(){ b.textContent = "copiado: pégalo en el chat"; },
    function(){ b.textContent = "no se pudo copiar"; });
});

almacen.leer("mapeo", function(m){
  if(m && m.comunas){ mapeo = m; $("empezar").textContent = "Volver a hacer el mapeo"; mostrar(); }
  else $("vigente").textContent = "Todavía no hay mapeo.";
});
