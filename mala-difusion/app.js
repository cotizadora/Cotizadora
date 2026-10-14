/* Montador Mala Difusión
 * Un único motor de render en canvas alimenta la vista previa, la comparación,
 * la presentación, la exportación PNG y la exportación MP4 (WebCodecs + mp4-muxer,
 * con FFmpeg.wasm como respaldo para garantizar H.264).
 */
'use strict';

/* ───────────────────────── Utilidades ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const even = v => Math.max(2, Math.round(v / 2) * 2);
const fmtN = (v, d = 1) => v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtInt = v => Math.round(v).toLocaleString('es-CL');
const fmtBytes = b => b > 1048576 ? fmtN(b / 1048576, 1) + ' MB' : fmtN(b / 1024, 0) + ' KB';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
const EASE = {
  suave: x => 0.5 - 0.5 * Math.cos(Math.PI * x),
  cinematica: x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  lineal: x => x,
};
const tri = u => 1 - Math.abs(2 * u - 1);
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MAX_AREA = IS_IOS ? 16.7e6 : 64e6;
const MAX_DIM = IS_IOS ? 8192 : 16384;
const HAS_FILTER = (() => { try { const c = mkCanvas(1, 1).getContext('2d'); c.filter = 'blur(1px)'; return c.filter === 'blur(1px)'; } catch { return false; } })();

function toast(msg, err = false, ms = 3600) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

/* ───────────────────────── Datos ───────────────────────── */
const FORMATS = [
  { id: 'fb-grupo', pl: 'Facebook', name: 'Portada de grupo', W: 1640, H: 856, safe: [.05, .1, .9, .8], note: 'En móvil se recortan los costados: lo importante va al centro.' },
  { id: 'fb-pagina', pl: 'Facebook', name: 'Portada de página', W: 1640, H: 924, safe: [.04, .18, .92, .64], note: 'Móvil muestra la imagen completa; escritorio, la franja central.', guides: [{ r: [0, .172, 1, .656], label: 'Visible en escritorio' }] },
  { id: 'fb-post', pl: 'Facebook', name: 'Publicación cuadrada', W: 1080, H: 1080, safe: [.05, .05, .9, .9] },
  { id: 'fb-vertical', pl: 'Facebook', name: 'Publicación vertical', W: 1080, H: 1350, safe: [.05, .05, .9, .9] },
  { id: 'fb-historia', pl: 'Facebook', name: 'Historia / Reel', W: 1080, H: 1920, safe: [.06, .14, .88, .66], note: 'Arriba y abajo quedan la barra de perfil y los botones.' },
  { id: 'yt-banner', pl: 'YouTube', name: 'Portada del canal', W: 2560, H: 1440, safe: [.198, .353, .604, .294], note: 'Zona segura 1546×423 visible en todos los dispositivos; el resto solo en TV.', guides: [{ r: [0, .353, 1, .294], label: 'Escritorio' }, { r: [.1377, .353, .7246, .294], label: 'Tablet' }] },
  { id: 'yt-mini', pl: 'YouTube', name: 'Miniatura de video', W: 1280, H: 720, safe: [.04, .06, .92, .84], guides: [{ r: [.83, .85, .15, .11], label: 'Duración', avoid: true }] },
  { id: 'ig-cuadrado', pl: 'Instagram', name: 'Publicación cuadrada', W: 1080, H: 1080, safe: [.05, .05, .9, .9] },
  { id: 'ig-vertical', pl: 'Instagram', name: 'Publicación vertical', W: 1080, H: 1350, safe: [.06, .05, .88, .9], note: 'La grilla del perfil muestra un recorte 3:4 centrado.', guides: [{ r: [.0315, 0, .937, 1], label: 'Grilla 3:4' }] },
  { id: 'ig-historia', pl: 'Instagram', name: 'Historia', W: 1080, H: 1920, safe: [.06, .13, .88, .74], note: 'Deja libres 250 px arriba y abajo.' },
  { id: 'ig-reel', pl: 'Instagram', name: 'Reel', W: 1080, H: 1920, safe: [.06, .11, .76, .66], note: 'Botones a la derecha y texto abajo.', guides: [{ r: [.86, .45, .12, .45], label: 'Botones', avoid: true }, { r: [0, .8, .86, .2], label: 'Texto', avoid: true }] },
  { id: 'x-cabecera', pl: 'Otros', name: 'X / Twitter cabecera', W: 1500, H: 500, safe: [.23, .12, .73, .76], guides: [{ r: [.03, .58, .19, .42], label: 'Foto de perfil', avoid: true }] },
  { id: 'og-enlace', pl: 'Otros', name: 'Enlace compartido (WhatsApp)', W: 1200, H: 630, safe: [.05, .08, .9, .84], guides: [{ r: [.2375, 0, .525, 1], label: 'Recorte cuadrado' }] },
  { id: 'pres-169', pl: 'Otros', name: 'Presentación / pantalla 16:9', W: 1920, H: 1080, safe: [.05, .06, .9, .88] },
];
const FMT = Object.fromEntries(FORMATS.map(f => [f.id, f]));

const MEMBERS = [
  { id: 'pelusa', name: 'Pelusa', full: 'Cecilia', row: 'front', src: 'img/pelusa.png' },
  { id: 'lyn', name: 'Lyn', row: 'front', src: 'img/lyn.png' },
  { id: 'cata', name: 'Cata', full: 'Catalina', row: 'front' },
  { id: 'jaime', name: 'Jaime', full: 'El Nigromante', row: 'back' },
  { id: 'eduardo', name: 'Eduardo', row: 'back', src: 'img/eduardo.png', variants: { eduardo: 'De frente', eduardo_3q: 'Tres cuartos' }, prom: .96 },
  { id: 'raul', name: 'Raúl', row: 'back' },
];
const MEM = Object.fromEntries(MEMBERS.map(m => [m.id, m]));
const ROW1_ORDER = ['jaime', 'pelusa', 'eduardo', 'lyn', 'raul', 'cata'];

const BG_TYPES = [['negro', 'Negro texturado'], ['megafono', 'Negro + megáfono'], ['afiche', 'Muro de afiches'], ['crema', 'Papel crema'], ['naranja', 'Naranja con trama'], ['degradado', 'Degradado'], ['liso', 'Color liso'], ['transparente', 'Transparente']];
const TREATS = [['color', 'Color original'], ['gris', 'Escala de grises'], ['serigrafia', 'Serigrafía B/N'], ['duotono', 'Duotono']];
const SHADOWS = [['suave', 'Suave'], ['dura', 'Dura'], ['pegatina', 'Pegatina'], ['ninguna', 'Sin sombra']];

const BASE_STYLE = {
  bg: 'negro', c1: '#0d0b0a', c2: '#241c15', accent: '#d4571e', paper: '#ece3cf', ink: '#141010',
  texture: .55, rays: 0, seed: 1,
  light: .5, lx: .5, ly: .22, lr: .62, lcolor: '#ffd8a6', vignette: .55, grain: .35, floor: .55,
  treat: 'color', treatLogo: true, cbr: 0, cct: 0, csat: 0,
  shadow: 'suave', shadowOp: .6, shadowColor: '#000000',
};
const DESIGNS = [
  { id: 'escenario', name: 'Escenario', desc: 'Dos filas bajo un foco de luz, logo arriba.',
    style: {},
    P: { all: { logoPos: 'arriba', logoW: .62, rows: 2, step: .8, vis: 1, spill: .55, gap: .035 }, tall: { logoW: .92 }, square: { logoW: .74 }, wide: { logoW: .42, spill: .9, gap: .025 }, strip: { logoPos: 'izquierda', logoW: .4, vis: .6 } } },
  { id: 'afiche', name: 'Muro de afiches', desc: 'Papel rasgado, logo como pegatina, fila escalonada.',
    style: { bg: 'afiche', c1: '#18130f', c2: '#ece3cf', texture: .7, light: .25, vignette: .5, grain: .5, shadow: 'pegatina', shadowOp: .75, floor: 0 },
    P: { all: { logoPos: 'arriba', logoW: .78, logoRot: -3, rows: 1, step: .84, stagger: .045, vis: 1, spill: .6, gap: .04 }, tall: { rows: 2, logoW: .94, step: .86 }, wide: { logoPos: 'izquierda', logoW: .42, logoRot: -4 }, strip: { logoPos: 'izquierda', logoW: .38, vis: .6, stagger: .03 } } },
  { id: 'megafono', name: 'Megáfono', desc: 'Negro con megáfono gigante y rayos naranjos.',
    style: { bg: 'megafono', rays: .55, light: .4, lx: .66, ly: .3, eduVariant: 'eduardo_3q' },
    edu: 'eduardo_3q',
    P: { all: { logoPos: 'arriba', logoW: .86, rows: 2, step: .8, vis: 1, spill: .5, gap: .04 }, square: { logoW: .78 }, wide: { logoPos: 'izquierda', logoW: .44 }, strip: { logoPos: 'izquierda', logoW: .4, vis: .6 } } },
  { id: 'crema', name: 'Línea crema', desc: 'Papel crema, fila limpia y sombras suaves.',
    style: { bg: 'crema', c1: '#ece3cf', c2: '#cdbd9c', texture: .45, light: .25, lcolor: '#fff6e4', vignette: .3, grain: .3, floor: .45, shadowOp: .4 },
    P: { all: { logoPos: 'arriba', logoW: .62, rows: 1, step: .94, vis: 1, spill: .5, gap: .04 }, wide: { logoW: .44, spill: .85, gap: .03 }, tall: { logoW: .9, rows: 2, step: .86 }, square: { logoW: .74 }, strip: { logoPos: 'izquierda', logoW: .38, vis: .6 } } },
  { id: 'retrato', name: 'Primer plano', desc: 'Caras grandes a medio cuerpo, logo abajo.',
    style: { bg: 'degradado', c1: '#c4511c', c2: '#1c0c05', texture: .35, light: .35, ly: .25, lcolor: '#ffd2a0', vignette: .5, grain: .35, floor: 0, shadowOp: .55 },
    edu: 'eduardo_3q',
    P: { all: { logoPos: 'abajo', logoW: .82, rows: 1, step: .74, vis: .6, spill: 1, gap: .0 }, tall: { logoPos: 'arriba', logoW: .9, rows: 2, step: .82, vis: .66, gap: .03, bleed: .22 }, square: { logoPos: 'arriba', logoW: .66, rows: 2, step: .84, vis: .7, gap: .03 }, wide: { logoPos: 'izquierda', logoW: .42 }, strip: { logoPos: 'izquierda', logoW: .38, vis: .56 } } },
  { id: 'serigrafia', name: 'Serigrafía', desc: 'Tinta negra sobre naranja con trama de puntos.',
    style: { bg: 'naranja', c1: '#d4571e', c2: '#8f3510', treat: 'serigrafia', texture: .6, light: .2, lcolor: '#ffe2b8', vignette: .35, grain: .45, shadow: 'dura', shadowOp: .55, shadowColor: '#120c09', floor: .3 },
    P: { all: { logoPos: 'arriba', logoW: .62, rows: 2, step: .82, vis: 1, spill: .55, gap: .035 }, tall: { logoW: .92 }, square: { logoW: .74 }, wide: { logoW: .42, spill: .9, gap: .025 }, strip: { logoPos: 'izquierda', logoW: .4, vis: .6 } } },
];
const DES = Object.fromEntries(DESIGNS.map(d => [d.id, d]));

const ANIMS = [
  { id: 'ninguna', name: 'Sin animación', d: 'Imagen fija' },
  { id: 'zoom', name: 'Zoom cinematográfico', d: 'Acercamiento lento al grupo' },
  { id: 'paneo', name: 'Paneo de cámara', d: 'Desplazamiento lateral suave' },
  { id: 'parallax', name: 'Parallax', d: 'Capas a distinta profundidad' },
  { id: 'aparicion', name: 'Aparición progresiva', d: 'Entrada escalonada y salida' },
  { id: 'transiciones', name: 'Transiciones', d: 'Recorre a cada integrante' },
  { id: 'independiente', name: 'Movimiento libre', d: 'Cada elemento flota a su ritmo' },
  { id: 'luz', name: 'Luz y profundidad', d: 'Foco que barre, rayos y desenfoque' },
  { id: 'combinado', name: 'Combinado', d: 'Parallax + flote + luz' },
];
const DEFAULT_ANIM = { preset: 'combinado', dur: 8, int: .5, speed: 1, ease: 'suave', loop: 'bucle' };
const DEFAULT_LAYOUT = { rows: 'auto', step: 1, groupScale: 1, gx: 0, gy: 0, logoScale: 1, logoPos: 'auto', order: null, edu: null };

/* ───────────────────────── Recursos gráficos ───────────────────────── */
const ASSETS = {}; // clave -> {img, bw, bh, trim(canvas), mask, aspect}
function prepareAsset(key, img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = mkCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let i = (y * w) * 4 + 3, xx = 0; xx < w; xx++, i += 4) {
    if (d[i] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const pad = 2; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const trim = mkCanvas(bw, bh); trim.getContext('2d').drawImage(c, x0, y0, bw, bh, 0, 0, bw, bh);
  const ms = 4, mw = Math.ceil(bw / ms), mh = Math.ceil(bh / ms), mask = new Uint8Array(mw * mh);
  for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
    const sx = x0 + Math.min(bw - 1, mx * ms), sy = y0 + Math.min(bh - 1, my * ms);
    mask[my * mw + mx] = d[(sy * w + sx) * 4 + 3];
  }
  const a = { key, img, w, h, bw, bh, trim, mask: { w: mw, h: mh, s: ms, d: mask }, aspect: bw / bh, ver: (ASSETS[key]?.ver || 0) + 1 };
  ASSETS[key] = a; clearAssetCaches(key);
  return a;
}
const bakeCache = new Map(), silCache = new Map(), softCache = new Map();
function clearAssetCaches(key) { for (const m of [bakeCache, silCache, softCache]) for (const k of [...m.keys()]) if (k.startsWith(key + '|')) m.delete(k); }
function lru(map, k, make, max = 48) {
  if (map.has(k)) { const v = map.get(k); map.delete(k); map.set(k, v); return v; }
  const v = make(); map.set(k, v); if (map.size > max) map.delete(map.keys().next().value); return v;
}
const BAYER = (() => { const b = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25], [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]]; return b.map(r => r.map(v => (v + .5) / 64)); })();
/** Copia procesada de una imagen: brillo/contraste/saturación y tratamiento (color, gris, serigrafía, duotono). */
function baked(key, o) {
  const A = ASSETS[key]; if (!A) return null;
  const br = +(o.br || 0).toFixed(3), ct = +(o.ct || 0).toFixed(3), sat = +(o.sat || 0).toFixed(3), tr = o.treat || 'color';
  if (!br && !ct && !sat && tr === 'color') return A.trim;
  const k = `${key}|${A.ver}|${tr}|${br}|${ct}|${sat}|${o.paper}|${o.ink}|${o.accent}`;
  return lru(bakeCache, k, () => {
    const c = mkCanvas(A.bw, A.bh), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(A.trim, 0, 0);
    const id = x.getImageData(0, 0, A.bw, A.bh), d = id.data;
    const cf = 1 + ct, bo = br * 90, sf = 1 + sat;
    const P = hexRgb(o.paper || '#ece3cf'), I = hexRgb(o.ink || '#141010'), Ac = hexRgb(o.accent || '#d4571e');
    const cell = Math.max(1, Math.round(A.bh / 760)); // trama proporcional a la imagen
    for (let p = 0, n = d.length; p < n; p += 4) {
      if (!d[p + 3]) continue;
      let r = d[p], g = d[p + 1], b = d[p + 2];
      r = (r - 128) * cf + 128 + bo; g = (g - 128) * cf + 128 + bo; b = (b - 128) * cf + 128 + bo;
      let L = .299 * r + .587 * g + .114 * b;
      if (sf !== 1) { r = L + (r - L) * sf; g = L + (g - L) * sf; b = L + (b - L) * sf; }
      if (tr === 'gris') { r = g = b = L; }
      else if (tr === 'serigrafia') {
        const px = (p >> 2) % A.bw, py = ((p >> 2) / A.bw) | 0;
        const t = BAYER[((py / cell) | 0) & 7][((px / cell) | 0) & 7];
        const l = clamp((L / 255 - .2) / .62, 0, 1);
        const ink = l < t;
        r = ink ? I[0] : P[0]; g = ink ? I[1] : P[1]; b = ink ? I[2] : P[2];
      } else if (tr === 'duotono') {
        const l = clamp(L / 255, 0, 1);
        if (l < .5) { const q = l / .5; r = lerp(I[0], Ac[0], q); g = lerp(I[1], Ac[1], q); b = lerp(I[2], Ac[2], q); }
        else { const q = (l - .5) / .5; r = lerp(Ac[0], P[0], q); g = lerp(Ac[1], P[1], q); b = lerp(Ac[2], P[2], q); }
      }
      d[p] = r; d[p + 1] = g; d[p + 2] = b;
    }
    x.putImageData(id, 0, 0);
    return c;
  }, 40);
}
function silhouette(key, color) {
  const A = ASSETS[key];
  return lru(silCache, `${key}|${A.ver}|${color}`, () => {
    const c = mkCanvas(A.bw, A.bh), x = c.getContext('2d');
    x.drawImage(A.trim, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, A.bw, A.bh);
    return c;
  });
}
/** Sombra difusa precalculada (silueta reducida + desenfoque de caja), independiente del navegador. */
function softShadow(key) {
  const A = ASSETS[key];
  return lru(softCache, `${key}|${A.ver}`, () => {
    const s = 1 / 8, pad = 6, w = Math.ceil(A.bw * s) + pad * 2, h = Math.ceil(A.bh * s) + pad * 2;
    const c = mkCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(A.trim, pad, pad, A.bw * s, A.bh * s);
    const id = x.getImageData(0, 0, w, h), d = id.data, a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
    const tmp = new Float32Array(w * h), R = 3;
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { let s2 = 0, n = 0; for (let k = -R; k <= R; k++) { const q = xx + k; if (q >= 0 && q < w) { s2 += a[y * w + q]; n++; } } tmp[y * w + xx] = s2 / n; }
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { let s2 = 0, n = 0; for (let k = -R; k <= R; k++) { const q = y + k; if (q >= 0 && q < h) { s2 += tmp[q * w + xx]; n++; } } a[y * w + xx] = s2 / n; }
    }
    for (let i = 0; i < w * h; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0; d[i * 4 + 3] = a[i]; }
    x.putImageData(id, 0, 0);
    return { c, pad: pad / s, s };
  });
}
let NOISE = null, MEGA = null;
function makeNoise() {
  const n = 256, c = mkCanvas(n, n), x = c.getContext('2d'), id = x.createImageData(n, n), r = mulberry32(99);
  for (let i = 0; i < n * n; i++) { const v = r() * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0); return c;
}
/** Megáfono tomado del propio logo (zona derecha), convertido en trazo monocromo para usarlo de fondo. */
function makeMegaphone() {
  const L = ASSETS.logo; if (!L) return null;
  const sx = Math.round(L.bw * .885), sw = L.bw - sx, sy = Math.round(L.bh * .07), sh = L.bh - sy;
  const c = mkCanvas(sw, sh), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(L.trim, sx, sy, sw, sh, 0, 0, sw, sh);
  const id = x.getImageData(0, 0, sw, sh), d = id.data;
  for (let i = 0; i < sw * sh; i++) {
    const p = i * 4, l = (.299 * d[p] + .587 * d[p + 1] + .114 * d[p + 2]) / 255, xx = i % sw;
    const fade = clamp(xx / (sw * .3), 0, 1);
    d[p] = d[p + 1] = d[p + 2] = 255; d[p + 3] = clamp((l - .35) / .3, 0, 1) * (d[p + 3] / 255) * fade * 255;
  }
  x.putImageData(id, 0, 0);
  return c;
}
function tintedMega(color) {
  return lru(silCache, `mega|${color}`, () => { const c = mkCanvas(MEGA.width, MEGA.height), x = c.getContext('2d'); x.drawImage(MEGA, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; });
}

/* ───────────────────────── Almacenamiento ───────────────────────── */
const IDB = {
  db: null,
  open() { return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const r = indexedDB.open('mala-difusion-montador', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(this.db = r.result); r.onerror = () => rej(r.error); }); },
  async op(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('files', mode), s = t.objectStore('files'), q = fn(s); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); },
  get(k) { return this.op('readonly', s => s.get(k)); }, set(k, v) { return this.op('readwrite', s => s.put(v, k)); }, del(k) { return this.op('readwrite', s => s.delete(k)); },
};
const LS_KEY = 'md-montador-v1';
const S = {
  design: 'escenario', fmt: 'fb-grupo', view: 'editor', tab: 'elementos',
  styles: {}, layout: {}, over: {}, enabled: {}, anim: { ...DEFAULT_ANIM },
  png: { mult: 1, transparent: false, frame: false },
  mp4: { res: 'nativa', fps: 30, perfect: true, reps: 1, dur: 8, quality: 'alta', mbps: 0, codec: 'auto' },
  safe: true, guides: true,
};
function loadState() {
  try { const j = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); if (j) for (const k of Object.keys(S)) if (j[k] !== undefined) S[k] = (typeof S[k] === 'object' && !Array.isArray(S[k])) ? { ...S[k], ...j[k] } : j[k]; } catch { /* almacenamiento no disponible */ }
  if (!FMT[S.fmt]) S.fmt = 'fb-grupo'; if (!DES[S.design]) S.design = 'escenario'; S.view = 'editor';
}
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { const { view, ...rest } = S; localStorage.setItem(LS_KEY, JSON.stringify(rest)); } catch { /* sin almacenamiento */ } }, 250); }
const undoStack = [], redoStack = []; let undoT = 0, undoOpen = false;
const snap = () => JSON.stringify({ styles: S.styles, layout: S.layout, over: S.over, enabled: S.enabled });
function beginChange() {
  if (!undoOpen) { undoStack.push(snap()); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; undoOpen = true; }
  clearTimeout(undoT); undoT = setTimeout(() => undoOpen = false, 450);
}
function applySnap(j) { const o = JSON.parse(j); Object.assign(S, o); invalidate(); buildPanels(); }
function undo() { if (!undoStack.length) return; redoStack.push(snap()); applySnap(undoStack.pop()); toast('Deshecho'); }
function redo() { if (!redoStack.length) return; undoStack.push(snap()); applySnap(redoStack.pop()); toast('Rehecho'); }

function styleOf(did) { return { ...BASE_STYLE, ...DES[did].style, ...(S.styles[did] || {}) }; }
function layoutOf(did) { return { ...DEFAULT_LAYOUT, edu: DES[did].edu || 'eduardo', ...(S.layout[did] || {}) }; }
function setStyle(k, v, did = S.design) { beginChange(); (S.styles[did] ||= {})[k] = v; invalidate(); }
function setLayout(k, v, did = S.design) { beginChange(); (S.layout[did] ||= {})[k] = v; invalidate(); }

/* ───────────────────────── Motor de composición ───────────────────────── */
function safeBox(f) { const [x, y, w, h] = f.safe; return { x: x * f.W, y: y * f.H, w: w * f.W, h: h * f.H }; }
function modeOf(f) { const s = safeBox(f), r = s.w / s.h; return r >= 2.3 ? 'strip' : r >= 1.35 ? 'wide' : r >= .85 ? 'square' : 'tall'; }
function memberAssetKey(m, L) { if (m.id === 'eduardo') return ASSETS[L.edu] ? L.edu : 'eduardo'; return m.id; }
function presentMembers(did) {
  const L = layoutOf(did);
  const order = (L.order && L.order.length === MEMBERS.length) ? L.order : MEMBERS.map(m => m.id);
  return order.map(id => MEM[id]).filter(m => S.enabled[m.id] !== false && ASSETS[memberAssetKey(m, L)]);
}
/** Coloca el grupo dentro de una caja. Unidades: alto de la fila delantera = 1. */
function placeGroup(items, box, o) {
  let front = items, back = [];
  if (o.rows === 2) { front = items.filter(i => i.row === 'front'); back = items.filter(i => i.row === 'back'); if (!front.length) { front = back; back = []; } }
  if (o.rows === 1) {
    front = [...items].sort((a, b) => ROW1_ORDER.indexOf(a.id) - ROW1_ORDER.indexOf(b.id));
    if (o.order) front = [...items];
  }
  const nf = front.length, nb = back.length, bs = o.backScale ?? .93;
  if (!nf) return [];
  const gapBack = nb > 0 && (((nf - nb) % 2 + 2) % 2 === 1);
  const wf = front.reduce((a, i) => a + i.asp * i.prom, 0) / nf, step = wf * o.step * (gapBack ? 1.32 : 1);
  const P = [], c = (nf - 1) / 2;
  front.forEach((it, i) => P.push({ it, cx: (i - c) * step, foot: (o.stagger && i % 2) ? -o.stagger : 0, h: it.prom, z: o.rows === 1 ? (it.row === 'front' ? 20 : 10) + Math.round(10 - Math.abs(i - c) * 2) : 20 + Math.round(10 - Math.abs(i - c) * 2) }));
  if (nb) {
    const coincide = ((nf - nb) % 2 + 2) % 2 === 0;
    const lift = coincide ? (o.liftHi ?? .3) : (o.lift ?? .17);
    back.forEach((it, j) => P.push({ it, cx: (j - (nb - 1) / 2) * step * (coincide ? 1.08 : 1), foot: -lift, h: bs * it.prom, z: 5 + Math.round(5 - Math.abs(j - (nb - 1) / 2)) }));
  }
  let L = Infinity, R = -Infinity, T = Infinity;
  for (const p of P) { const w = p.it.asp * p.h; L = Math.min(L, p.cx - w / 2); R = Math.max(R, p.cx + w / 2); T = Math.min(T, p.foot - p.h); }
  const vis = o.vis ?? 1, B = -(1 - vis);
  const gw = R - L, gh = B - T;
  const k = Math.min(box.w / gw, box.h / gh) * (o.fill ?? 1);
  const ox = box.x + box.w / 2 - (L + R) / 2 * k;
  const oy = o.valign === 'center' ? box.y + box.h / 2 - (T + B) / 2 * k : box.y + box.h - B * k;
  return P.map(p => ({ id: p.it.id, key: p.it.key, row: p.it.row, x: ox + p.cx * k, y: oy + (p.foot - p.h / 2) * k, h: p.h * k, z: p.z, vis }));
}
/** Composición automática de un diseño en un formato (posiciones en píxeles del formato). */
function autoLayout(did, f) {
  const d = DES[did], L = layoutOf(did), mode = modeOf(f), Sb = safeBox(f);
  const P = { ...d.P.all, ...(d.P[mode] || {}) };
  if (L.logoPos !== 'auto') { P.logoPos = L.logoPos; if (['izquierda', 'derecha'].includes(L.logoPos) && !d.P[mode]?.logoW) P.logoW = mode === 'tall' ? .5 : .42; if (['arriba', 'abajo'].includes(L.logoPos) && ['izquierda', 'derecha'].includes(d.P[mode]?.logoPos)) P.logoW = d.P.all.logoW; }
  if (L.rows !== 'auto') P.rows = +L.rows;
  P.step *= L.step;
  const members = presentMembers(did);
  const items = members.map(m => { const key = memberAssetKey(m, L); return { id: m.id, key, row: m.row, asp: ASSETS[key].aspect, prom: m.prom || 1 }; });
  const LA = ASSETS.logo, lasp = LA ? LA.aspect : 3.6;
  const out = [];
  const gap = (P.gap ?? .035) * f.H;
  let logo = null, box;
  const bottomLimit = Sb.y + Sb.h + (f.H - (Sb.y + Sb.h)) * (P.spill ?? .5) - f.H * .01;
  const lp = P.logoPos;
  if (lp === 'arriba' || lp === 'abajo') {
    let lw = Sb.w * P.logoW * L.logoScale; let lh = lw / lasp;
    const maxH = Sb.h * (mode === 'tall' ? .2 : .3) * L.logoScale; if (lh > maxH) { lh = maxH; lw = lh * lasp; }
    if (lp === 'arriba') {
      logo = { x: Sb.x + Sb.w / 2, y: Sb.y + lh / 2, h: lh };
      box = { x: Sb.x, y: Sb.y + lh + gap, w: Sb.w, h: bottomLimit - (Sb.y + lh + gap) };
    } else {
      logo = { x: Sb.x + Sb.w / 2, y: Sb.y + Sb.h - lh / 2, h: lh };
      box = { x: Sb.x, y: Sb.y, w: Sb.w, h: (Sb.y + Sb.h - lh * .55) - Sb.y };
    }
  } else {
    const colW = Sb.w * P.logoW;
    let lw = colW * .94 * L.logoScale, lh = lw / lasp; if (lh > Sb.h * .9) { lh = Sb.h * .9; lw = lh * lasp; }
    const left = lp === 'izquierda';
    const lx = left ? Sb.x + colW / 2 : Sb.x + Sb.w - colW / 2;
    const ly = mode === 'strip' ? Sb.y + Sb.h / 2 : Sb.y + Sb.h * .42;
    logo = { x: lx, y: ly, h: lh };
    const gx0 = left ? Sb.x + colW + Sb.w * .02 : Sb.x, gw = Sb.w - colW - Sb.w * .02;
    box = mode === 'strip' ? { x: gx0, y: Sb.y, w: gw, h: Sb.h } : { x: gx0, y: Sb.y, w: gw, h: bottomLimit - Sb.y };
  }
  if (P.bleed) { box.x -= f.W * P.bleed / 2; box.w += f.W * P.bleed; }
  if (items.length) {
    const g = placeGroup(items, box, { rows: P.rows, step: P.step, vis: P.vis, stagger: P.stagger, order: !!L.order });
    // escala y desplazamiento del grupo (anclado al pie del grupo)
    const ax = box.x + box.w / 2, ay = box.y + box.h;
    for (const e of g) {
      e.x = ax + (e.x - ax) * L.groupScale + L.gx * Sb.w; e.y = ay + (e.y - ay) * L.groupScale + L.gy * Sb.h; e.h *= L.groupScale;
      out.push({ ...e, kind: 'char', r: 0, depth: e.row === 'back' && P.rows === 2 ? .6 : 1 });
    }
  }
  if (logo && lp === 'arriba' && out.length) {
    const top = Math.min(...out.map(e => e.y - e.h / 2)), lh = logo.h, free = top - gap - (logo.y + lh / 2);
    if (free > f.H * .05) logo.y += free * .65;
  }
  if (logo && LA) out.push({ id: 'logo', key: 'logo', kind: 'logo', x: logo.x, y: logo.y, h: logo.h, r: P.logoRot || 0, z: lp === 'abajo' ? 60 : 50, depth: .8, vis: 1 });
  return { els: out, mode, P };
}
const compKey = (did, fid) => `${did}|${fid}`;
/** Composición final = automática + ajustes manuales guardados. */
function resolveComp(did = S.design, fid = S.fmt) {
  const f = FMT[fid], style = styleOf(did), { els, mode } = autoLayout(did, f), ov = S.over[compKey(did, fid)] || {};
  const list = els.map(e => {
    const o = ov[e.id] || {};
    return {
      ...e, auto: { x: e.x, y: e.y, h: e.h, r: e.r, z: e.z },
      x: o.x != null ? o.x * f.W : e.x, y: o.y != null ? o.y * f.H : e.y, h: o.h != null ? o.h * f.H : e.h,
      r: o.r ?? e.r, z: o.z ?? e.z, flip: !!o.flip, op: o.op ?? 1, hidden: !!o.hidden,
      br: o.br || 0, ct: o.ct || 0, sat: o.sat || 0, shadow: o.shadow || 'heredar', edited: Object.keys(o).length > 0,
    };
  }).sort((a, b) => a.z - b.z);
  return { did, fid, f, W: f.W, H: f.H, style, els: list, mode };
}
function setOverride(id, patch, did = S.design, fid = S.fmt) {
  beginChange();
  const k = compKey(did, fid), o = (S.over[k] ||= {}), e = (o[id] ||= {});
  Object.assign(e, patch);
  invalidate(false);
}

/* ───────────────────────── Fondo ───────────────────────── */
function tornRect(ctx, x, y, w, h, rot, rng, jag) {
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.beginPath();
  const pts = [], seg = 14;
  const edge = (ax, ay, bx, by, nx, ny) => { for (let i = 0; i < seg; i++) { const t = i / seg, j = (rng() - .5) * jag; pts.push([lerp(ax, bx, t) + nx * j, lerp(ay, by, t) + ny * j]); } };
  edge(-w / 2, -h / 2, w / 2, -h / 2, 0, 1); edge(w / 2, -h / 2, w / 2, h / 2, 1, 0); edge(w / 2, h / 2, -w / 2, h / 2, 0, 1); edge(-w / 2, h / 2, -w / 2, -h / 2, 1, 0);
  pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
}
/** Dibuja el fondo cubriendo el rectángulo r (unidades del formato). */
function drawBackground(ctx, st, W, H, r, mode) {
  const U = Math.max(W, H), rng = mulberry32(st.seed * 7919 + 13), tex = st.texture;
  const fill = c => { ctx.fillStyle = c; ctx.fillRect(r.x, r.y, r.w, r.h); };
  const radial = (cx, cy, r0, r1, c0, c1) => { const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h); };
  const scratches = (n, col) => {
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r.x + rng() * r.w, y = r.y + rng() * r.h, len = (.02 + rng() * .1) * U, a = -Math.PI / 2 + (rng() - .5) * .9;
      ctx.strokeStyle = rgba(col, (.02 + rng() * .05) * tex); ctx.lineWidth = Math.max(.6, U * (.0005 + rng() * .001));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * len * .5 + (rng() - .5) * len * .2, y + Math.sin(a) * len * .5, x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
    }
    for (let i = 0; i < n * 3; i++) { ctx.fillStyle = rgba(col, (.03 + rng() * .06) * tex); const s = U * (.0008 + rng() * .002); ctx.fillRect(r.x + rng() * r.w, r.y + rng() * r.h, s, s); }
    ctx.restore();
  };
  const halftone = (col, alpha, sp, fn) => {
    ctx.save(); ctx.fillStyle = rgba(col, alpha);
    const s = sp * U; ctx.beginPath();
    for (let y = r.y - s, row = 0; y < r.y + r.h + s; y += s * .866, row++) for (let x = r.x - s + (row % 2) * s / 2; x < r.x + r.w + s; x += s) {
      const rad = fn(x / W, y / H) * s * .5; if (rad > .2) { ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, TAU); }
    }
    ctx.fill(); ctx.restore();
  };
  switch (st.bg) {
    case 'transparente': return;
    case 'liso': fill(st.c1); break;
    case 'degradado': fill(st.c2); radial(W * .5, H * .3, 0, U * .85, st.c1, rgba(st.c2, 0)); scratches(60, '#ffffff'); break;
    case 'crema': {
      fill(st.c1); radial(W * .5, H * .4, U * .1, U * .9, rgba('#fffaf0', .5), rgba(st.c2, .9));
      ctx.save();
      for (let i = 0; i < 520; i++) { ctx.strokeStyle = rgba('#6b5434', (.03 + rng() * .05) * tex); ctx.lineWidth = U * .0007; const x = r.x + rng() * r.w, y = r.y + rng() * r.h, l = U * (.004 + rng() * .012), a = rng() * TAU; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + .6) * l, y + Math.sin(a + .6) * l, x + Math.cos(a) * l * 1.6, y + Math.sin(a) * l * 1.6); ctx.stroke(); }
      ctx.restore(); scratches(40, '#4a3a26'); break;
    }
    case 'naranja': {
      fill(st.c1); radial(W * .5, H * .38, U * .15, U * .85, rgba(st.c1, 0), rgba(st.c2, .85));
      halftone(st.c2, .5 * (.4 + tex * .8), .015, (x, y) => clamp(.15 + Math.hypot(x - .5, (y - .4) * H / U * 1.2) * 1.1, 0, .95));
      scratches(80, '#1a0d06'); break;
    }
    case 'afiche': {
      fill(st.c1);
      const cols = [st.c2, st.accent, '#2b231c', '#c9bb9d', '#7d3313', st.c2, '#3a2f26'];
      const n = 26;
      for (let i = 0; i < n; i++) {
        const w = U * (.16 + rng() * .3), h = U * (.12 + rng() * .28), x = r.x - w * .3 + rng() * (r.w + w * .2), y = r.y - h * .3 + rng() * (r.h + h * .2), col = cols[i % cols.length], rot = (rng() - .5) * .22;
        tornRect(ctx, x, y, w, h, rot, rng, U * .008);
        ctx.fillStyle = col; ctx.globalAlpha = .9; ctx.fill(); ctx.globalAlpha = 1;
        ctx.clip();
        if (rng() < .5) { ctx.fillStyle = rgba('#000000', .16); const s = U * .012; ctx.beginPath(); for (let yy = -h / 2; yy < h / 2; yy += s) for (let xx = -w / 2 + ((yy / s) % 2 ? s / 2 : 0); xx < w / 2; xx += s) { ctx.moveTo(xx + s * .22, yy); ctx.arc(xx, yy, s * .22, 0, TAU); } ctx.fill(); }
        else if (rng() < .5) { ctx.strokeStyle = rgba('#000000', .12); ctx.lineWidth = U * .004; for (let k = -w; k < w; k += U * .016) { ctx.beginPath(); ctx.moveTo(k, -h / 2); ctx.lineTo(k + h, h / 2); ctx.stroke(); } }
        ctx.restore();
      }
      scratches(120, '#000000');
      fill(rgba('#000000', .36 + (1 - tex) * .2));
      radial(W * .5, H * .45, U * .1, U * .8, rgba(st.c2, .1), rgba('#000000', 0));
      break;
    }
    case 'megafono':
    case 'negro':
    default: {
      fill(st.c1); radial(W * .5, H * .42, 0, U * .78, rgba(st.c2, .95), rgba(st.c1, 0)); scratches(110, '#ece3cf');
      if (st.bg === 'megafono' && MEGA) {
        const m = tintedMega(st.accent), tall = H > W * 1.1;
        const mh = tall ? H * .5 : H * 1.15, mw = mh * MEGA.width / MEGA.height;
        ctx.save(); ctx.translate(tall ? W * .7 : W * .78, tall ? H * .32 : H * .48); ctx.rotate(-.2); ctx.globalAlpha = .12 + tex * .1; ctx.drawImage(m, -mw / 2, -mh / 2, mw, mh); ctx.restore();
      }
    }
  }
}
function megaOrigin(W, H) { const tall = H > W * 1.1; return tall ? [W * .76, H * .28] : [W * .86, H * .46]; }
function drawRays(ctx, st, W, H, rot) {
  if (!(st.rays > 0)) return;
  const U = Math.max(W, H), [ox, oy] = st.bg === 'megafono' ? megaOrigin(W, H) : [W * st.lx, H * st.ly], n = 18;
  ctx.save(); ctx.translate(ox, oy); ctx.rotate(rot); ctx.fillStyle = rgba(st.accent, .09 * st.rays);
  ctx.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * TAU, w2 = TAU / n * .32; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - w2) * U * 2, Math.sin(a - w2) * U * 2); ctx.lineTo(Math.cos(a + w2) * U * 2, Math.sin(a + w2) * U * 2); ctx.closePath(); }
  ctx.fill(); ctx.restore();
}
const bgCaches = new Map();
const OVERSCAN = .14;
function bgCanvasFor(st, W, H, mode, k) {
  const key = JSON.stringify([st.bg, st.c1, st.c2, st.accent, st.texture, st.seed, W, H, Math.round(k * 1000)]);
  return lru(bgCaches, key, () => {
    const o = OVERSCAN, cw = W * (1 + 2 * o) * k, ch = H * (1 + 2 * o) * k, c = mkCanvas(cw, ch), x = c.getContext('2d');
    x.setTransform(c.width / (W * (1 + 2 * o)), 0, 0, c.height / (H * (1 + 2 * o)), W * o * c.width / (W * (1 + 2 * o)), H * o * c.height / (H * (1 + 2 * o)));
    drawBackground(x, st, W, H, { x: -W * o, y: -H * o, w: W * (1 + 2 * o), h: H * (1 + 2 * o) }, mode);
    return c;
  }, 10);
}

/* ───────────────────────── Animación ───────────────────────── */
function groupCenter(comp) {
  let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
  for (const e of comp.els) if (e.kind === 'char' && !e.hidden) { const w = e.h * ASSETS[e.key].aspect; L = Math.min(L, e.x - w / 2); R = Math.max(R, e.x + w / 2); T = Math.min(T, e.y - e.h / 2); B = Math.max(B, e.y + e.h / 2); }
  if (L === Infinity) return { x: comp.W / 2, y: comp.H / 2 };
  return { x: (L + R) / 2, y: clamp((T + B) / 2, 0, comp.H) };
}
function cycleLen(a = S.anim) { return a.dur / a.speed; }
/** Estado animado en el instante t (segundos). Todas las magnitudes en unidades del formato. */
function evalAnim(a, t, comp) {
  const W = comp.W, H = comp.H, res = { cam: { z: 1, cx: W / 2, cy: H / 2 }, el: {}, light: { dx: 0, dy: 0, k: 1 }, rays: 0, vig: 1 };
  if (!a || a.preset === 'ninguna') return res;
  const I = a.int, periodic = a.loop !== 'unavez', E = EASE[a.ease] || EASE.suave;
  const p = t * a.speed / a.dur, u = periodic ? p - Math.floor(p) : clamp(p, 0, 1);
  const v = periodic ? E(tri(u)) : E(u);
  const els = comp.els.filter(e => !e.hidden), gc = groupCenter(comp), cam = res.cam;
  const get = id => (res.el[id] ||= { dx: 0, dy: 0, s: 1, a: 1, r: 0, blur: 0, dim: 0 });
  const pan = (amp) => { if (W >= H) cam.cx = W / 2 + (v - .5) * 2 * amp * W; else cam.cy = H / 2 + (v - .5) * 2 * amp * H; };
  const floats = (amt) => els.forEach((e, i) => { const g = get(e.id), ph = i * .37, k = 1 + (i % 2), big = e.kind === 'logo' ? .5 : 1; g.dy += Math.sin(TAU * (u * k + ph)) * .012 * amt * H * big; g.r += Math.sin(TAU * (u + ph + .25)) * 1.4 * amt * big; g.s *= 1 + .01 * amt * Math.sin(TAU * (u * 2 + ph)); });
  const sweep = (amt) => { res.light.dx = Math.sin(TAU * u) * .3 * amt; res.light.dy = Math.cos(TAU * u) * .05 * amt; res.light.k = 1 + .5 * amt * (.5 + .5 * Math.sin(TAU * u * 2)); res.rays = TAU / 18 * u; };
  switch (a.preset) {
    case 'zoom': cam.z = 1 + .22 * I * v; cam.cx = lerp(W / 2, gc.x, v * .6); cam.cy = lerp(H / 2, gc.y, v * .6); break;
    case 'paneo': cam.z = 1.04 + .08 * I; pan(.02 + .07 * I); break;
    case 'parallax': cam.z = 1.05 + .04 * I; pan(.03 + .08 * I); if (W >= H) cam.cy = H / 2 + (v - .5) * .03 * I * H; break;
    case 'aparicion': {
      const order = [...els].sort((x, y) => (x.kind === 'logo') - (y.kind === 'logo') || x.depth - y.depth || x.x - y.x);
      const n = order.length, Ie = Math.max(I, .3);
      const uu = periodic ? u / .6 : u / .7;
      order.forEach((e, i) => {
        const si = .04 + i * (.5 / Math.max(1, n)), q = clamp((uu - si) / .28, 0, 1), al = E(q), g = get(e.id);
        g.a = al; g.dy = (1 - al) * .06 * Ie * H; g.s = .94 + .06 * al; g.blur = (1 - al) * .006 * H;
        if (periodic && u > .86) { const f = 1 - E((u - .86) / .14); g.a *= f; }
      });
      cam.z = 1 + .04 * I * (periodic ? u : v);
      if (periodic && u > .86) res.fade = 1 - E((u - .86) / .14);
      if (periodic) res.fadeIn = clamp(u / .05, 0, 1);
      break;
    }
    case 'transiciones': {
      const chars = els.filter(e => e.kind === 'char').sort((x, y) => x.x - y.x);
      const shots = [null, ...chars]; if (!periodic) shots.push(null);
      const n = shots.length, pos = periodic ? u * n : u * (n - 1) + .0001, i = Math.min(n - 1, Math.floor(pos)), q = pos - i;
      const prev = shots[(i - 1 + n) % n], cur = shots[i];
      const target = s => {
        if (!s) return { z: 1, cx: W / 2, cy: H / 2 };
        const hy = s.y - s.h * .22; const z = clamp(1 + 1.1 * I, 1, (H * .9) / (s.h * .62));
        return { z: Math.max(1, z), cx: s.x, cy: hy, id: s.id };
      };
      const A0 = target(i === 0 && !periodic ? null : prev), A1 = target(cur), tq = E(clamp(q / .4, 0, 1));
      cam.z = lerp(A0.z, A1.z, tq); cam.cx = lerp(A0.cx, A1.cx, tq); cam.cy = lerp(A0.cy, A1.cy, tq);
      chars.forEach(e => { const g = get(e.id), d0 = A0.id ? (A0.id === e.id ? 0 : 1) : 0, d1 = A1.id ? (A1.id === e.id ? 0 : 1) : 0; g.dim = lerp(d0, d1, tq) * .5 * I; if (A1.id === e.id) g.s = 1 + .02 * tq; });
      break;
    }
    case 'independiente': floats(.4 + I); break;
    case 'luz': sweep(.5 + I * .8); cam.z = 1 + .03 * I * v; res.vig = 1 + .3 * I; els.forEach(e => { if (e.depth < 1 && e.kind === 'char') get(e.id).blur = .0025 * H * I; }); break;
    case 'combinado':
    default: {
      cam.z = 1.04 + .05 * I * v; pan(.015 + .05 * I); floats(.25 + .5 * I); sweep(.3 + .5 * I);
      if (!periodic) { const order = [...els].sort((x, y) => x.depth - y.depth); order.forEach((e, i) => { const q = clamp((u / .4 - i * .12) / .4, 0, 1), g = get(e.id); g.a = E(q); g.dy += (1 - E(q)) * .05 * H; }); }
    }
  }
  // límites de cámara para no mostrar bordes
  const hw = W / (2 * cam.z), hh = H / (2 * cam.z), ow = W * OVERSCAN * .85, oh = H * OVERSCAN * .85;
  cam.cx = clamp(cam.cx, hw - ow, W - hw + ow); cam.cy = clamp(cam.cy, hh - oh, H - hh + oh);
  return res;
}
function applyCam(ctx, cam, d, W, H) {
  const z = 1 + (cam.z - 1) * d, cx = W / 2 + (cam.cx - W / 2) * d, cy = H / 2 + (cam.cy - H / 2) * d;
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);
}

/* ───────────────────────── Render ───────────────────────── */
/** Dibuja la composición en ctx. opts: kx, ky (escala px/unidad), t (s) o null, transparent, video. */
function renderScene(ctx, comp, opts = {}) {
  const { W, H, style: st } = comp, kx = opts.kx ?? opts.k ?? 1, ky = opts.ky ?? kx;
  const transparent = opts.transparent || st.bg === 'transparente';
  const A = opts.t != null ? evalAnim(opts.anim || S.anim, opts.t, comp) : evalAnim(null, 0, comp);
  ctx.save();
  ctx.setTransform(kx, 0, 0, ky, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, W, H);
  if (opts.video && transparent) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  const cam = A.cam, U = Math.max(W, H);
  // Fondo (con cámara a menor profundidad para parallax)
  if (!transparent) {
    ctx.save(); applyCam(ctx, cam, .35, W, H);
    if (opts.direct) drawBackground(ctx, st, W, H, { x: -W * OVERSCAN, y: -H * OVERSCAN, w: W * (1 + 2 * OVERSCAN), h: H * (1 + 2 * OVERSCAN) }, comp.mode);
    else { const bc = bgCanvasFor(st, W, H, comp.mode, Math.min(kx, 1.5)); ctx.drawImage(bc, -W * OVERSCAN, -H * OVERSCAN, W * (1 + 2 * OVERSCAN), H * (1 + 2 * OVERSCAN)); }
    drawRays(ctx, st, W, H, A.rays);
    // foco de luz (detrás de los personajes)
    if (st.light > 0) {
      const lx = (st.lx + A.light.dx) * W, ly = (st.ly + A.light.dy) * H, lr = st.lr * U, k = st.light * A.light.k;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      g.addColorStop(0, rgba(st.lcolor, clamp(.55 * k, 0, 1))); g.addColorStop(.45, rgba(st.lcolor, clamp(.18 * k, 0, 1))); g.addColorStop(1, rgba(st.lcolor, 0));
      ctx.globalCompositeOperation = st.bg === 'crema' ? 'soft-light' : 'screen'; ctx.fillStyle = g; ctx.fillRect(-W * OVERSCAN, -H * OVERSCAN, W * (1 + 2 * OVERSCAN), H * (1 + 2 * OVERSCAN)); ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
  const ink = st.ink, treatOpt = (e) => ({ treat: (e.kind === 'logo' && !st.treatLogo) ? 'color' : st.treat, br: st.cbr + e.br, ct: st.cct + e.ct, sat: st.csat + e.sat, paper: st.paper, ink, accent: st.accent });
  // Sombras de piso
  if (st.floor > 0) for (const e of comp.els) {
    if (e.kind !== 'char' || e.hidden || e.vis < 1) continue;
    const g = A.el[e.id] || {}; const w = e.h * ASSETS[e.key].aspect;
    ctx.save(); applyCam(ctx, cam, e.depth, W, H);
    const fx = e.x + (g.dx || 0), fy = e.y + e.h / 2 - e.h * .012, rw = w * .42 * (g.s || 1), rh = e.h * .035;
    ctx.translate(fx, fy); ctx.scale(1, rh / rw);
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rw); gr.addColorStop(0, `rgba(0,0,0,${.55 * st.floor * e.op * (g.a ?? 1)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rw, 0, TAU); ctx.fill(); ctx.restore();
  }
  // Elementos
  for (const e of comp.els) {
    if (e.hidden) continue;
    const As = ASSETS[e.key]; if (!As) continue;
    const g = A.el[e.id] || { dx: 0, dy: 0, s: 1, a: 1, r: 0, blur: 0, dim: 0 };
    const alpha = e.op * (g.a ?? 1); if (alpha <= .002) continue;
    const h = e.h * (g.s ?? 1), w = h * As.aspect;
    ctx.save(); applyCam(ctx, cam, e.depth, W, H);
    ctx.translate(e.x + (g.dx || 0), e.y + (g.dy || 0)); ctx.rotate(((e.r || 0) + (g.r || 0)) * Math.PI / 180); if (e.flip) ctx.scale(-1, 1);
    ctx.globalAlpha = alpha;
    const sh = e.shadow === 'heredar' ? st.shadow : e.shadow;
    if (sh === 'suave' && st.shadowOp > 0) {
      const ss = softShadow(e.key), sc = h / As.bh, pad = ss.pad * sc;
      ctx.globalAlpha = alpha * st.shadowOp; ctx.drawImage(ss.c, -w / 2 - pad + h * .012, -h / 2 - pad + h * .022, w + pad * 2, h + pad * 2); ctx.globalAlpha = alpha;
    } else if ((sh === 'dura' || sh === 'pegatina') && st.shadowOp > 0) {
      const o = h * .018; ctx.globalAlpha = alpha * st.shadowOp; ctx.drawImage(silhouette(e.key, st.shadowColor), -w / 2 + o, -h / 2 + o, w, h); ctx.globalAlpha = alpha;
    }
    if (sh === 'pegatina') {
      const s = silhouette(e.key, st.paper), o = Math.max(1 / kx, h * .007);
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.drawImage(s, -w / 2 + Math.cos(a) * o, -h / 2 + Math.sin(a) * o, w, h); }
    }
    const img = baked(e.key, treatOpt(e));
    const blur = g.blur || 0;
    if (blur > .3 && HAS_FILTER) ctx.filter = `blur(${(blur * kx).toFixed(2)}px)`;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.filter = 'none';
    if (g.dim > .01) { ctx.globalAlpha = alpha * g.dim; ctx.drawImage(silhouette(e.key, '#000000'), -w / 2, -h / 2, w, h); }
    ctx.restore();
  }
  // Viñeta y grano (espacio de pantalla)
  if (!transparent) {
    const vg = st.vignette * (A.vig || 1);
    if (vg > 0) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.hypot(W, H) * .28, W / 2, H / 2, Math.hypot(W, H) * .62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${clamp(.78 * vg, 0, .95)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (st.grain > 0) {
      NOISE ||= makeNoise();
      const pat = ctx.createPattern(NOISE, 'repeat');
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = st.grain * .2; ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    const fade = Math.min(A.fade ?? 1, A.fadeIn ?? 1);
    if (fade < 1 && opts.fadeToBlack !== false) { ctx.fillStyle = `rgba(0,0,0,${(1 - fade) * .0})`; }
  }
  ctx.restore();
}
/** Escala de ampliación máxima de las imágenes respecto de su resolución original. */
function upscaleOf(comp, k) {
  let m = 0;
  for (const e of comp.els) if (!e.hidden && ASSETS[e.key]) m = Math.max(m, e.h * k / ASSETS[e.key].bh);
  return m;
}

/* ───────────────────────── Vista del editor ───────────────────────── */
const view = { cv: null, ctx: null, scale: 1, dpr: 1, playing: false, animOn: false, t: 0, last: 0, dirty: true, comp: null, sel: null, drag: null, snapX: null, snapY: null, pointers: new Map() };
function invalidate(rebuildThumbs = true) {
  view.comp = null; view.dirty = true; save();
  if (rebuildThumbs) scheduleThumbs();
  scheduleInfo();
}
function currentComp() { return view.comp ||= resolveComp(); }
function fitView() {
  const st = $('#stage'), f = FMT[S.fmt]; if (!st.clientWidth) return;
  const aw = st.clientWidth - 24, ah = st.clientHeight - 16;
  const sc = Math.min(aw / f.W, ah / f.H);
  const cw = Math.max(40, Math.floor(f.W * sc)), ch = Math.max(40, Math.floor(f.H * sc));
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  let pw = Math.round(cw * view.dpr), ph = Math.round(ch * view.dpr);
  const cap = 3.2e6; if (pw * ph > cap) { const r = Math.sqrt(cap / (pw * ph)); pw = Math.round(pw * r); ph = Math.round(ph * r); }
  view.cv.style.width = cw + 'px'; view.cv.style.height = ch + 'px';
  if (view.cv.width !== pw || view.cv.height !== ph) { view.cv.width = pw; view.cv.height = ph; }
  view.scale = cw / f.W; view.dirty = true;
}
function drawView() {
  const comp = currentComp(), ctx = view.ctx, k = view.cv.width / comp.W;
  renderScene(ctx, comp, { k, t: view.animOn ? view.t : null });
  // superposiciones del editor (no se exportan)
  ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0);
  const f = comp.f, px = 1 / view.scale;
  if (S.guides && f.guides) for (const g of f.guides) {
    const [x, y, w, h] = g.r; ctx.save();
    if (g.avoid) { ctx.fillStyle = 'rgba(224,83,60,.16)'; ctx.fillRect(x * f.W, y * f.H, w * f.W, h * f.H); ctx.strokeStyle = 'rgba(224,83,60,.8)'; }
    else ctx.strokeStyle = 'rgba(120,190,255,.75)';
    ctx.setLineDash([6 * px, 5 * px]); ctx.lineWidth = 1.2 * px; ctx.strokeRect(x * f.W, y * f.H, w * f.W, h * f.H);
    ctx.font = `600 ${11 * px}px Barlow, sans-serif`; ctx.fillStyle = g.avoid ? 'rgba(255,170,150,.95)' : 'rgba(160,210,255,.95)'; ctx.fillText(g.label, x * f.W + 5 * px, y * f.H + 14 * px);
    ctx.restore();
  }
  if (S.safe) {
    const s = safeBox(f); ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.rect(0, 0, f.W, f.H); ctx.rect(s.x, s.y + s.h, s.w, -s.h); ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(240,122,60,.95)'; ctx.setLineDash([7 * px, 5 * px]); ctx.lineWidth = 1.4 * px; ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.font = `600 ${11 * px}px Barlow, sans-serif`; ctx.fillStyle = 'rgba(255,190,150,.95)'; ctx.fillText('Zona segura', s.x + 5 * px, s.y - 5 * px > 10 * px ? s.y - 5 * px : s.y + 14 * px);
    ctx.restore();
  }
  if (view.snapX != null || view.snapY != null) {
    ctx.save(); ctx.strokeStyle = 'rgba(111,191,115,.95)'; ctx.lineWidth = px; ctx.setLineDash([]);
    if (view.snapX != null) { ctx.beginPath(); ctx.moveTo(view.snapX, 0); ctx.lineTo(view.snapX, f.H); ctx.stroke(); }
    if (view.snapY != null) { ctx.beginPath(); ctx.moveTo(0, view.snapY); ctx.lineTo(f.W, view.snapY); ctx.stroke(); }
    ctx.restore();
  }
  const e = !view.animOn && comp.els.find(x => x.id === view.sel);
  if (e && !e.hidden) {
    const w = e.h * ASSETS[e.key].aspect;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.r * Math.PI / 180);
    ctx.strokeStyle = '#f07a3c'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([]); ctx.strokeRect(-w / 2, -e.h / 2, w, e.h);
    const hs = 9 * px; ctx.fillStyle = '#fff';
    for (const [hx, hy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.fillRect(hx * w / 2 - hs / 2, hy * e.h / 2 - hs / 2, hs, hs); ctx.strokeRect(hx * w / 2 - hs / 2, hy * e.h / 2 - hs / 2, hs, hs); }
    ctx.beginPath(); ctx.moveTo(0, -e.h / 2); ctx.lineTo(0, -e.h / 2 - 24 * px); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -e.h / 2 - 24 * px, 6 * px, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function loop(ts) {
  const dt = view.last ? Math.min(.1, (ts - view.last) / 1000) : 0; view.last = ts;
  if (view.playing) {
    view.t += dt; const cl = cycleLen();
    if (S.anim.loop === 'unavez' && view.t >= cl) { view.t = cl; setPlaying(false); }
    view.dirty = true; updateTime();
  }
  if (S.view === 'editor' && view.dirty) { view.dirty = false; try { drawView(); } catch (err) { console.error(err); } }
  if (S.view === 'compare' && cmp.animate) drawCompare(dt);
  if (S.view === 'present') drawPresent(dt);
  requestAnimationFrame(loop);
}
function setPlaying(on) {
  if (S.anim.preset === 'ninguna' && on) { toast('Elige un tipo de animación en la pestaña Animación.'); return; }
  view.playing = on; if (on) { view.animOn = true; if (S.anim.loop === 'unavez' && view.t >= cycleLen()) view.t = 0; }
  $('#btnPlay').textContent = on ? '❚❚' : '▶'; $('#btnPlay').setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
  view.dirty = true; updateTime();
}
function stopAnimPreview() { if (view.playing) setPlaying(false); if (view.animOn) { view.animOn = false; view.dirty = true; updateTime(); } }
function updateTime() {
  const cl = cycleLen(), tt = S.anim.loop === 'unavez' ? Math.min(view.t, cl) : view.t % cl;
  $('#timeLbl').textContent = view.animOn ? `${fmtN(tt)} / ${fmtN(cl)} s` : 'Vista fija';
  if (!view.scrubbing) $('#scrub').value = Math.round(tt / cl * 1000);
}

/* Interacción con el lienzo */
function toFmt(ev) { const r = view.cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / view.scale, y: (ev.clientY - r.top) / view.scale }; }
function local(e, p) { const a = -e.r * Math.PI / 180, dx = p.x - e.x, dy = p.y - e.y; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; }
function hitTest(p) {
  const comp = currentComp();
  for (let i = comp.els.length - 1; i >= 0; i--) {
    const e = comp.els[i]; if (e.hidden) continue; const A = ASSETS[e.key], w = e.h * A.aspect, l = local(e, p);
    let u = l.x / w + .5; const v = l.y / e.h + .5; if (e.flip) u = 1 - u;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const m = A.mask, mx = Math.min(m.w - 1, Math.floor(u * m.w)), my = Math.min(m.h - 1, Math.floor(v * m.h));
    if (m.d[my * m.w + mx] > 40 || e.kind === 'logo') return e;
  }
  return null;
}
function handleAt(p) {
  const e = currentComp().els.find(x => x.id === view.sel); if (!e || e.hidden) return null;
  const w = e.h * ASSETS[e.key].aspect, l = local(e, p), tol = 14 / view.scale;
  if (Math.hypot(l.x, l.y + e.h / 2 + 24 / view.scale) < tol) return { type: 'rot', e };
  for (const [hx, hy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (Math.abs(l.x - hx * w / 2) < tol && Math.abs(l.y - hy * e.h / 2) < tol) return { type: 'scale', e };
  return null;
}
function select(id) { view.sel = id; view.dirty = true; buildInspector(); highlightMember(); }
function bindCanvas() {
  const cv = view.cv;
  cv.addEventListener('pointerdown', ev => {
    cv.setPointerCapture(ev.pointerId); view.pointers.set(ev.pointerId, toFmt(ev));
    stopAnimPreview();
    const p = toFmt(ev), f = FMT[S.fmt];
    if (view.pointers.size === 2 && view.sel) {
      const [a, b] = [...view.pointers.values()], e = currentComp().els.find(x => x.id === view.sel);
      view.drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), h0: e.h, id: e.id }; return;
    }
    const hd = handleAt(p);
    if (hd) { const e = hd.e; view.drag = { type: hd.type, id: e.id, p0: p, h0: e.h, r0: e.r, d0: Math.hypot(p.x - e.x, p.y - e.y), a0: Math.atan2(p.y - e.y, p.x - e.x), cx: e.x, cy: e.y }; return; }
    const e = hitTest(p);
    if (e) { select(e.id); view.drag = { type: 'move', id: e.id, p0: p, x0: e.x, y0: e.y }; }
    else { select(null); view.drag = null; }
    void f;
  });
  cv.addEventListener('pointermove', ev => {
    if (view.pointers.has(ev.pointerId)) view.pointers.set(ev.pointerId, toFmt(ev));
    const d = view.drag, p = toFmt(ev), f = FMT[S.fmt];
    if (!d) { const hd = handleAt(p); cv.style.cursor = hd ? (hd.type === 'rot' ? 'grab' : 'nwse-resize') : (hitTest(p) ? 'move' : 'default'); return; }
    if (d.type === 'move') {
      let x = d.x0 + p.x - d.p0.x, y = d.y0 + p.y - d.p0.y; const tol = 6 / view.scale, s = safeBox(f);
      view.snapX = view.snapY = null;
      for (const sx of [f.W / 2, s.x + s.w / 2]) if (Math.abs(x - sx) < tol) { x = sx; view.snapX = sx; }
      if (Math.abs(y - f.H / 2) < tol) { y = f.H / 2; view.snapY = y; }
      setOverride(d.id, { x: x / f.W, y: y / f.H });
    } else if (d.type === 'scale') {
      const dist = Math.hypot(p.x - d.cx, p.y - d.cy); setOverride(d.id, { h: clamp(d.h0 * dist / d.d0, f.H * .03, f.H * 4) / f.H });
    } else if (d.type === 'rot') {
      let a = d.r0 + (Math.atan2(p.y - d.cy, p.x - d.cx) - d.a0) * 180 / Math.PI; if (!ev.shiftKey) { const r = Math.round(a / 15) * 15; if (Math.abs(a - r) < 2.5) a = r; }
      setOverride(d.id, { r: +a.toFixed(1) });
    } else if (d.type === 'pinch' && view.pointers.size === 2) {
      const [a, b] = [...view.pointers.values()]; const dd = Math.hypot(a.x - b.x, a.y - b.y);
      setOverride(d.id, { h: clamp(d.h0 * dd / d.d0, f.H * .03, f.H * 4) / f.H });
    }
    buildInspectorValues();
  });
  const end = ev => { view.pointers.delete(ev.pointerId); if (view.drag) { view.drag = null; view.snapX = view.snapY = null; view.dirty = true; scheduleThumbs(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', ev => {
    if (!view.sel) return; ev.preventDefault(); stopAnimPreview();
    const e = currentComp().els.find(x => x.id === view.sel), f = FMT[S.fmt];
    setOverride(e.id, { h: clamp(e.h * Math.pow(1.0015, -ev.deltaY), f.H * .03, f.H * 4) / f.H }); buildInspectorValues();
  }, { passive: false });
}
function onKey(ev) {
  if (ev.target.matches('input,select,textarea')) return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
  if (S.view === 'present') { if (ev.key === 'Escape') closePresent(); if (ev.key === 'ArrowRight') presStep(1); if (ev.key === 'ArrowLeft') presStep(-1); return; }
  if (ev.key === ' ' && S.view === 'editor') { ev.preventDefault(); setPlaying(!view.playing); return; }
  const e = view.sel && currentComp().els.find(x => x.id === view.sel); if (!e) return;
  const f = FMT[S.fmt], st = ev.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[ev.key];
  if (mv) { ev.preventDefault(); setOverride(e.id, { x: (e.x + mv[0]) / f.W, y: (e.y + mv[1]) / f.H }); }
  else if (ev.key === '+' || ev.key === '=') setOverride(e.id, { h: e.h * 1.02 / f.H });
  else if (ev.key === '-') setOverride(e.id, { h: e.h / 1.02 / f.H });
  else if (ev.key.toLowerCase() === 'f') setOverride(e.id, { flip: !e.flip });
  else if (ev.key === ']') zOrder(e, 1); else if (ev.key === '[') zOrder(e, -1);
  else if (ev.key === 'Delete' || ev.key === 'Backspace') setOverride(e.id, { hidden: true });
  else if (ev.key === 'Escape') select(null);
  else return;
  buildInspectorValues();
}
function zOrder(e, dir) {
  const els = currentComp().els, i = els.indexOf(e), j = clamp(i + dir, 0, els.length - 1); if (i === j) return;
  const o = els[j]; setOverride(e.id, { z: o.z + dir * .5 });
  // normaliza
  const comp = resolveComp(); comp.els.forEach((x, k) => setOverride(x.id, { z: k }));
  toast(dir > 0 ? 'Traído hacia adelante' : 'Enviado hacia atrás');
}

/* ───────────────────────── Paneles ───────────────────────── */
function ctlRange(parent, o) {
  const d = document.createElement('div'); d.className = 'ctl';
  const id = 'c' + Math.random().toString(36).slice(2, 8);
  d.innerHTML = `<label for="${id}">${o.label}</label><input type="range" id="${id}" min="${o.min}" max="${o.max}" step="${o.step ?? .01}"><output></output>`;
  const inp = d.querySelector('input'), out = d.querySelector('output');
  const show = v => out.textContent = o.fmt ? o.fmt(v) : (Math.round(v * 100) + '%');
  inp.value = o.get(); show(+inp.value);
  inp.addEventListener('input', () => { o.set(+inp.value); show(+inp.value); });
  d._sync = () => { inp.value = o.get(); show(+inp.value); };
  parent.appendChild(d); return d;
}
function ctlSelect(parent, o) {
  const d = document.createElement('div'); d.className = 'ctl wide';
  const id = 'c' + Math.random().toString(36).slice(2, 8);
  d.innerHTML = `<label for="${id}">${o.label}</label><select id="${id}">${o.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
  const s = d.querySelector('select'); s.value = o.get(); s.addEventListener('change', () => o.set(s.value));
  d._sync = () => s.value = o.get();
  parent.appendChild(d); return d;
}
function ctlColor(parent, o) {
  const d = document.createElement('div'); d.className = 'ctl wide';
  const id = 'c' + Math.random().toString(36).slice(2, 8);
  d.innerHTML = `<label for="${id}">${o.label}</label><input type="color" id="${id}">`;
  const s = d.querySelector('input'); s.value = o.get(); s.addEventListener('input', () => o.set(s.value));
  parent.appendChild(d); return d;
}
function ctlCheck(parent, o) {
  const d = document.createElement('div'); d.className = 'ctl wide';
  d.innerHTML = `<span></span><label class="chk"><input type="checkbox"> ${o.label}</label>`;
  const s = d.querySelector('input'); s.checked = o.get(); s.addEventListener('change', () => o.set(s.checked));
  parent.appendChild(d); return d;
}
function ctlNumber(parent, o) {
  const d = document.createElement('div'); d.className = 'ctl wide';
  const id = 'c' + Math.random().toString(36).slice(2, 8);
  d.innerHTML = `<label for="${id}">${o.label}</label><input type="number" id="${id}" min="${o.min}" max="${o.max}" step="${o.step || 1}">`;
  const s = d.querySelector('input'); s.value = o.get(); s.addEventListener('change', () => { const v = clamp(+s.value || o.min, o.min, o.max); s.value = v; o.set(v); });
  d._sync = () => s.value = o.get();
  parent.appendChild(d); return d;
}

function buildDesignList() {
  const el = $('#designList'); el.innerHTML = '';
  for (const d of DESIGNS) {
    const b = document.createElement('button'); b.className = 'design-card' + (d.id === S.design ? ' on' : ''); b.dataset.id = d.id;
    b.innerHTML = `<canvas width="172" height="116"></canvas><span><b>${d.name}</b><small>${d.desc}</small></span>`;
    b.onclick = () => { S.design = d.id; view.sel = null; invalidate(false); buildPanels(); if (S.view === 'compare') buildCompare(); };
    el.appendChild(b);
  }
  scheduleThumbs(true);
}
let thumbT = 0;
function scheduleThumbs(now) { clearTimeout(thumbT); thumbT = setTimeout(drawThumbs, now ? 0 : 350); }
function drawThumbs() {
  for (const b of $$('#designList .design-card')) {
    b.classList.toggle('on', b.dataset.id === S.design);
    const cv = b.querySelector('canvas'), ctx = cv.getContext('2d'), comp = resolveComp(b.dataset.id, S.fmt);
    const sc = Math.min(cv.width / comp.W, cv.height / comp.H), w = comp.W * sc, h = comp.H * sc;
    const tmp = mkCanvas(w, h); renderScene(tmp.getContext('2d'), comp, { k: sc });
    ctx.fillStyle = '#0a0908'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(tmp, (cv.width - w) / 2, (cv.height - h) / 2);
  }
}
function buildFormatList() {
  const el = $('#formatList'); el.innerHTML = '';
  for (const pl of [...new Set(FORMATS.map(f => f.pl))]) {
    const g = document.createElement('div'); g.className = 'fmt-group';
    g.innerHTML = `<h4>${pl}</h4><div class="fmt-btns"></div>`;
    for (const f of FORMATS.filter(x => x.pl === pl)) {
      const b = document.createElement('button'); b.className = 'fmt-btn' + (f.id === S.fmt ? ' on' : ''); b.dataset.id = f.id;
      const r = f.W / f.H, iw = r >= 1 ? 18 : 18 * r, ih = r >= 1 ? 18 / r : 18;
      b.innerHTML = `<span class="lbl"><span class="fmt-shape"><i style="width:${iw}px;height:${ih}px"></i></span>${f.name}</span><span>${f.W}×${f.H}</span>`;
      b.onclick = () => setFormat(f.id);
      g.querySelector('.fmt-btns').appendChild(b);
    }
    el.appendChild(g);
  }
}
function setFormat(id) {
  S.fmt = id; view.sel = null; $$('.fmt-btn').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  invalidate(); fitView(); buildInspector(); buildExportPanels();
  if (S.view === 'compare') buildCompare();
  closeSheetsOnMobile();
}
let infoT = 0;
function scheduleInfo() { clearTimeout(infoT); infoT = setTimeout(updateInfo, 120); }
function updateInfo() {
  const f = FMT[S.fmt], comp = currentComp();
  $('#infoFmt').textContent = `${f.pl} · ${f.name}`;
  const g = (a, b) => b ? g(b, a % b) : a, d = g(f.W, f.H);
  $('#infoDims').textContent = `${f.W} × ${f.H} px · ${f.W / d}:${f.H / d}`;
  const up = upscaleOf(comp, 1), q = $('#infoQuality');
  q.className = 'badge ' + (up <= 1.001 ? 'ok' : up <= 1.3 ? 'warn' : 'bad');
  q.textContent = up <= 1.001 ? 'Calidad: nativa' : `Ampliación ${Math.round(up * 100)}%`;
  q.title = up <= 1.001 ? 'Ninguna imagen se amplía por encima de su resolución original en tamaño nativo.' : 'Alguna imagen se dibuja más grande que su resolución original; se verá algo más suave.';
  if ($('[data-body=exportar]') && !$('[data-body=exportar]').hidden) updateExportInfo();
}
function buildMemberList() {
  const el = $('#memberList'); el.innerHTML = ''; const L = layoutOf(S.design);
  const order = (L.order && L.order.length === MEMBERS.length) ? L.order : MEMBERS.map(m => m.id);
  order.forEach((id, idx) => {
    const m = MEM[id], key = memberAssetKey(m, L), A = ASSETS[key], up = !!uploaded[m.id];
    const d = document.createElement('div'); d.className = 'member' + (A ? '' : ' missing'); d.dataset.id = m.id;
    const av = document.createElement('div'); av.className = 'av';
    if (A) { const c = mkCanvas(80, 80), x = c.getContext('2d'); const sw = A.bw * .62, sx = (A.bw - sw) / 2; x.drawImage(A.trim, sx, 0, sw, sw, 0, 0, 80, 80); av.style.backgroundImage = `url(${c.toDataURL()})`; } else av.textContent = m.name[0];
    const info = document.createElement('div');
    info.innerHTML = `<b>${m.name}</b><small>${A ? `${up ? 'Cargado' : 'Original'} ${A.w}×${A.h}` : 'Falta el PNG transparente'}</small>`;
    if (m.variants && A) {
      const s = document.createElement('select'); s.style.marginTop = '4px'; s.style.width = 'auto'; s.style.minWidth = '130px'; s.innerHTML = Object.entries(m.variants).map(([k, l]) => `<option value="${k}">${l}</option>`).join(''); s.value = L.edu; s.onchange = () => { setLayout('edu', s.value); buildMemberList(); };
      info.appendChild(s);
    }
    const acts = document.createElement('div'); acts.className = 'acts';
    if (A) {
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = S.enabled[m.id] !== false; chk.title = 'Incluir en las composiciones'; chk.onchange = () => { beginChange(); S.enabled[m.id] = chk.checked; invalidate(); buildMemberList(); };
      const upB = document.createElement('button'); upB.className = 'ghost'; upB.textContent = '↑'; upB.title = 'Mover antes'; upB.disabled = idx === 0; upB.onclick = () => moveMember(id, -1);
      const dnB = document.createElement('button'); dnB.className = 'ghost'; dnB.textContent = '↓'; dnB.title = 'Mover después'; dnB.disabled = idx === order.length - 1; dnB.onclick = () => moveMember(id, 1);
      acts.append(upB, dnB, chk);
      info.onclick = av.onclick = () => { const e = currentComp().els.find(x => x.id === m.id); if (e) { stopAnimPreview(); select(m.id); } };
      info.style.cursor = 'pointer';
    }
    const ld = document.createElement('button'); ld.className = A ? 'ghost' : 'primary'; ld.textContent = A ? (up ? 'Cambiar' : 'Reemplazar') : 'Cargar PNG'; ld.onclick = () => pickFile(m.id);
    acts.appendChild(ld);
    if (up) { const rb = document.createElement('button'); rb.className = 'ghost danger'; rb.textContent = '✕'; rb.title = MEM[m.id].src ? 'Volver a la imagen original' : 'Quitar imagen cargada'; rb.onclick = () => removeUpload(m.id); acts.appendChild(rb); }
    d.append(av, info, acts);
    if (up && uploaded[m.id]?.opaque) {
      const bgr = document.createElement('div'); bgr.style.gridColumn = '1 / -1';
      bgr.innerHTML = `<p class="hint">La imagen no tiene transparencia. Puedes quitar un fondo uniforme (p. ej. negro) desde los bordes.</p>`;
      const r = ctlRange(bgr, { label: 'Tolerancia', min: 4, max: 120, step: 1, get: () => uploaded[m.id].tol || 40, set: v => uploaded[m.id].tol = v, fmt: v => v });
      void r;
      const b = document.createElement('button'); b.className = 'ghost'; b.textContent = uploaded[m.id].cut ? 'Recalcular fondo' : 'Quitar fondo'; b.onclick = () => cutBackground(m.id);
      const b2 = document.createElement('button'); b2.className = 'ghost'; b2.textContent = 'Usar sin recorte'; b2.hidden = !uploaded[m.id].cut; b2.onclick = () => cutBackground(m.id, true);
      const rb = document.createElement('div'); rb.className = 'row-btns'; rb.append(b, b2); bgr.appendChild(rb); d.appendChild(bgr);
    }
    el.appendChild(d);
  });
  highlightMember();
}
function moveMember(id, dir) {
  const L = layoutOf(S.design); const order = (L.order && L.order.length === MEMBERS.length) ? [...L.order] : MEMBERS.map(m => m.id);
  const i = order.indexOf(id), j = i + dir; if (j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]]; setLayout('order', order); buildMemberList();
}
function highlightMember() { $$('#memberList .member').forEach(m => m.classList.toggle('sel', m.dataset.id === view.sel)); }
function buildLayoutCtrls() {
  const el = $('#layoutCtrls'); el.innerHTML = ''; const L = () => layoutOf(S.design);
  ctlSelect(el, { label: 'Filas', options: [['auto', 'Automático'], ['1', 'Una fila'], ['2', 'Dos filas']], get: () => String(L().rows), set: v => setLayout('rows', v === 'auto' ? 'auto' : +v) });
  ctlSelect(el, { label: 'Logo', options: [['auto', 'Según el diseño'], ['arriba', 'Arriba'], ['abajo', 'Abajo'], ['izquierda', 'Izquierda'], ['derecha', 'Derecha']], get: () => L().logoPos, set: v => setLayout('logoPos', v) });
  ctlRange(el, { label: 'Tamaño logo', min: .4, max: 1.5, get: () => L().logoScale, set: v => setLayout('logoScale', v) });
  ctlRange(el, { label: 'Tamaño grupo', min: .5, max: 1.4, get: () => L().groupScale, set: v => setLayout('groupScale', v) });
  ctlRange(el, { label: 'Separación', min: .6, max: 1.5, get: () => L().step, set: v => setLayout('step', v) });
  ctlRange(el, { label: 'Mover grupo ↔', min: -.4, max: .4, get: () => L().gx, set: v => setLayout('gx', v), fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) });
  ctlRange(el, { label: 'Mover grupo ↕', min: -.4, max: .4, get: () => L().gy, set: v => setLayout('gy', v), fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) });
}
function buildInspector() {
  const el = $('#inspector'); el.innerHTML = '';
  const e = view.sel && currentComp().els.find(x => x.id === view.sel);
  if (!e) { el.innerHTML = '<p class="hint">Toca o haz clic sobre un personaje o el logo en la vista previa. Arrastra para mover, usa las esquinas para escalar y el punto superior para girar. En el móvil, pellizca para escalar.</p>'; return; }
  const f = FMT[S.fmt], name = e.id === 'logo' ? 'Logo' : MEM[e.id].name;
  const h = document.createElement('p'); h.className = 'hint'; h.innerHTML = `<b style="color:var(--text)">${name}</b>${e.edited ? ' · ajustado a mano' : ' · posición automática'}`; el.appendChild(h);
  const cur = () => currentComp().els.find(x => x.id === view.sel) || e;
  const rows = [
    ctlRange(el, { label: 'Posición X', min: -.2, max: 1.2, step: .001, get: () => cur().x / f.W, set: v => setOverride(e.id, { x: v }), fmt: v => Math.round(v * 100) + '%' }),
    ctlRange(el, { label: 'Posición Y', min: -.2, max: 1.2, step: .001, get: () => cur().y / f.H, set: v => setOverride(e.id, { y: v }), fmt: v => Math.round(v * 100) + '%' }),
    ctlRange(el, { label: 'Tamaño', min: .05, max: 2.5, step: .001, get: () => cur().h / f.H, set: v => setOverride(e.id, { h: v }), fmt: v => Math.round(v * 100) + '%' }),
    ctlRange(el, { label: 'Rotación', min: -30, max: 30, step: .5, get: () => cur().r, set: v => setOverride(e.id, { r: v }), fmt: v => fmtN(v, 1) + '°' }),
    ctlRange(el, { label: 'Opacidad', min: 0, max: 1, get: () => cur().op, set: v => setOverride(e.id, { op: v }) }),
    ctlRange(el, { label: 'Brillo', min: -.6, max: .6, get: () => cur().br, set: v => setOverride(e.id, { br: v }), fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) }),
    ctlRange(el, { label: 'Contraste', min: -.5, max: .6, get: () => cur().ct, set: v => setOverride(e.id, { ct: v }), fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) }),
    ctlRange(el, { label: 'Saturación', min: -1, max: .8, get: () => cur().sat, set: v => setOverride(e.id, { sat: v }), fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) }),
  ];
  el._rows = rows;
  ctlSelect(el, { label: 'Sombra', options: [['heredar', 'Como el diseño'], ...SHADOWS], get: () => cur().shadow, set: v => setOverride(e.id, { shadow: v }) });
  const rb = document.createElement('div'); rb.className = 'row-btns';
  const mk = (t, fn, cls = 'ghost') => { const b = document.createElement('button'); b.className = cls; b.textContent = t; b.onclick = () => { fn(); buildInspectorValues(); }; rb.appendChild(b); return b; };
  mk('Voltear', () => setOverride(e.id, { flip: !cur().flip }));
  mk('Adelante', () => zOrder(cur(), 1)); mk('Atrás', () => zOrder(cur(), -1));
  mk(cur().hidden ? 'Mostrar' : 'Ocultar', () => { setOverride(e.id, { hidden: !cur().hidden }); buildInspector(); });
  mk('Restaurar', () => { beginChange(); const o = S.over[compKey(S.design, S.fmt)]; if (o) delete o[e.id]; invalidate(); buildInspector(); }, 'ghost danger');
  el.appendChild(rb);
}
function buildInspectorValues() { const el = $('#inspector'); (el._rows || []).forEach(r => r._sync()); }
function buildStylePanel() {
  const st = () => styleOf(S.design), set = k => v => setStyle(k, v);
  const bg = $('#bgCtrls'); bg.innerHTML = '';
  ctlSelect(bg, { label: 'Tipo', options: BG_TYPES, get: () => st().bg, set: v => { setStyle('bg', v); } });
  ctlColor(bg, { label: 'Color base', get: () => st().c1, set: set('c1') });
  ctlColor(bg, { label: 'Color secundario', get: () => st().c2, set: set('c2') });
  ctlColor(bg, { label: 'Acento', get: () => st().accent, set: set('accent') });
  ctlRange(bg, { label: 'Textura', min: 0, max: 1, get: () => st().texture, set: set('texture') });
  ctlRange(bg, { label: 'Rayos', min: 0, max: 1, get: () => st().rays, set: set('rays') });
  const rb = document.createElement('div'); rb.className = 'row-btns'; const b = document.createElement('button'); b.className = 'ghost'; b.textContent = 'Variar textura'; b.onclick = () => setStyle('seed', (st().seed % 97) + 1); rb.appendChild(b); bg.appendChild(rb);
  const li = $('#lightCtrls'); li.innerHTML = '';
  ctlRange(li, { label: 'Foco de luz', min: 0, max: 1, get: () => st().light, set: set('light') });
  ctlRange(li, { label: 'Foco X', min: 0, max: 1, get: () => st().lx, set: set('lx') });
  ctlRange(li, { label: 'Foco Y', min: -.2, max: 1, get: () => st().ly, set: set('ly') });
  ctlRange(li, { label: 'Radio', min: .2, max: 1.2, get: () => st().lr, set: set('lr') });
  ctlColor(li, { label: 'Color de luz', get: () => st().lcolor, set: set('lcolor') });
  ctlRange(li, { label: 'Viñeta', min: 0, max: 1, get: () => st().vignette, set: set('vignette') });
  ctlRange(li, { label: 'Grano', min: 0, max: 1, get: () => st().grain, set: set('grain') });
  ctlRange(li, { label: 'Sombra en piso', min: 0, max: 1, get: () => st().floor, set: set('floor') });
  const ch = $('#charCtrls'); ch.innerHTML = '';
  ctlSelect(ch, { label: 'Tratamiento', options: TREATS, get: () => st().treat, set: set('treat') });
  ctlCheck(ch, { label: 'Aplicar también al logo', get: () => st().treatLogo, set: set('treatLogo') });
  ctlColor(ch, { label: 'Papel (claros)', get: () => st().paper, set: set('paper') });
  ctlColor(ch, { label: 'Tinta (oscuros)', get: () => st().ink, set: set('ink') });
  ctlRange(ch, { label: 'Brillo', min: -.5, max: .5, get: () => st().cbr, set: set('cbr'), fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) });
  ctlRange(ch, { label: 'Contraste', min: -.4, max: .5, get: () => st().cct, set: set('cct'), fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) });
  ctlRange(ch, { label: 'Saturación', min: -1, max: .6, get: () => st().csat, set: set('csat'), fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) });
  ctlSelect(ch, { label: 'Sombra', options: SHADOWS, get: () => st().shadow, set: set('shadow') });
  ctlRange(ch, { label: 'Opacidad sombra', min: 0, max: 1, get: () => st().shadowOp, set: set('shadowOp') });
  ctlColor(ch, { label: 'Color sombra', get: () => st().shadowColor, set: set('shadowColor') });
}
function buildAnimPanel() {
  const g = $('#animGrid'); g.innerHTML = '';
  for (const a of ANIMS) {
    const b = document.createElement('button'); b.className = a.id === S.anim.preset ? 'on' : ''; b.innerHTML = `${a.name}<small>${a.d}</small>`;
    b.onclick = () => { S.anim.preset = a.id; save(); buildAnimPanel(); syncQuickAnim(); view.t = 0; if (a.id === 'ninguna') stopAnimPreview(); else setPlaying(true); };
    g.appendChild(b);
  }
  const c = $('#animCtrls'); c.innerHTML = '';
  const setA = k => v => { S.anim[k] = v; save(); view.dirty = true; updateTime(); updateExportInfo(); };
  ctlRange(c, { label: 'Duración', min: 2, max: 30, step: .5, get: () => S.anim.dur, set: setA('dur'), fmt: v => fmtN(v) + ' s' });
  ctlRange(c, { label: 'Intensidad', min: 0, max: 1, get: () => S.anim.int, set: setA('int') });
  ctlRange(c, { label: 'Velocidad', min: .25, max: 3, step: .05, get: () => S.anim.speed, set: setA('speed'), fmt: v => fmtN(v, 2) + '×' });
  ctlSelect(c, { label: 'Curva', options: [['suave', 'Suave'], ['cinematica', 'Cinemática'], ['lineal', 'Lineal']], get: () => S.anim.ease, set: setA('ease') });
  ctlSelect(c, { label: 'Repetición', options: [['bucle', 'Bucle continuo (sin cortes)'], ['unavez', 'Una vez y se detiene']], get: () => S.anim.loop, set: setA('loop') });
  const rb = document.createElement('div'); rb.className = 'row-btns';
  const p = document.createElement('button'); p.className = 'primary'; p.textContent = 'Reproducir / Pausar'; p.onclick = () => setPlaying(!view.playing);
  const r = document.createElement('button'); r.className = 'ghost'; r.textContent = 'Reiniciar'; r.onclick = restartAnim;
  const s = document.createElement('button'); s.className = 'ghost'; s.textContent = 'Vista fija'; s.onclick = stopAnimPreview;
  rb.append(p, r, s); c.appendChild(rb);
  const h = document.createElement('p'); h.className = 'hint'; h.textContent = 'La duración es un ciclo completo. "Bucle continuo" vuelve al punto de partida sin saltos, ideal para Reels e historias.'; c.appendChild(h);
}
function restartAnim() { view.t = 0; view.animOn = true; setPlaying(true); }
function syncQuickAnim() { $('#quickAnim').value = S.anim.preset; }

/* ───────────────────────── Exportación: paneles ───────────────────────── */
function pngDims(mult) { const f = FMT[S.fmt]; return { w: Math.round(f.W * mult), h: Math.round(f.H * mult) }; }
function multAllowed(m) { const { w, h } = pngDims(m); return w * h <= MAX_AREA && w <= MAX_DIM && h <= MAX_DIM; }
function videoDims() {
  const f = FMT[S.fmt], L = { nativa: 0, '1080': 1920, '720': 1280, '540': 960 }[S.mp4.res];
  const r = L ? Math.min(1, L / Math.max(f.W, f.H)) : 1;
  return { w: even(f.W * r), h: even(f.H * r) };
}
function videoDur() { return S.mp4.perfect ? cycleLen() * S.mp4.reps : S.mp4.dur; }
function videoBitrate() {
  const { w, h } = videoDims(); if (S.mp4.mbps > 0) return S.mp4.mbps * 1e6;
  const bpp = { maxima: .22, alta: .13, media: .075, ligera: .04 }[S.mp4.quality];
  return clamp(w * h * S.mp4.fps * bpp, 1.5e6, 60e6);
}
function buildExportPanels() {
  const p = $('#pngCtrls'); p.innerHTML = '';
  const f = FMT[S.fmt];
  const opts = [1, 1.5, 2, 3, 4].map(m => { const { w, h } = pngDims(m), ok = multAllowed(m); return [m, `${m}× · ${w}×${h}${m === 1 ? ' (nativa)' : ''}${ok ? '' : ' — excede el límite del navegador'}`]; });
  if (!multAllowed(S.png.mult)) S.png.mult = 1;
  const sel = ctlSelect(p, { label: 'Resolución', options: opts, get: () => String(S.png.mult), set: v => { if (!multAllowed(+v)) { toast('Esa resolución supera el tamaño máximo de lienzo de este navegador.', true); sel._sync(); return; } S.png.mult = +v; save(); updateExportInfo(); } });
  [...sel.querySelectorAll('option')].forEach(o => o.disabled = !multAllowed(+o.value));
  ctlCheck(p, { label: 'Fondo transparente (solo personajes y logo)', get: () => S.png.transparent, set: v => { S.png.transparent = v; save(); updateExportInfo(); } });
  ctlCheck(p, { label: 'Usar el fotograma actual de la animación', get: () => S.png.frame, set: v => { S.png.frame = v; save(); } });
  const m = $('#mp4Ctrls'); m.innerHTML = '';
  const setM = (k, num) => v => { S.mp4[k] = num ? +v : v; save(); updateExportInfo(); };
  const vd = r => { const L = { nativa: 0, '1080': 1920, '720': 1280, '540': 960 }[r]; const k = L ? Math.min(1, L / Math.max(f.W, f.H)) : 1; return `${even(f.W * k)}×${even(f.H * k)}`; };
  ctlSelect(m, { label: 'Resolución', options: [['nativa', `Nativa · ${vd('nativa')}`], ['1080', `Full HD · ${vd('1080')}`], ['720', `HD · ${vd('720')}`], ['540', `Ligera · ${vd('540')}`]], get: () => S.mp4.res, set: setM('res') });
  const ar = document.createElement('div'); ar.className = 'ctl wide'; ar.innerHTML = `<label>Relación</label><span>${f.name} (${(f.W / f.H).toFixed(3).replace('.', ',')}:1). Cambia de formato a la izquierda.</span>`; m.appendChild(ar);
  ctlSelect(m, { label: 'Fotogramas', options: [[24, '24 fps (cine)'], [25, '25 fps'], [30, '30 fps (redes)'], [50, '50 fps'], [60, '60 fps (fluido)']], get: () => String(S.mp4.fps), set: setM('fps', true) });
  ctlCheck(m, { label: 'Bucle perfecto (duración = ciclos completos)', get: () => S.mp4.perfect, set: v => { S.mp4.perfect = v; save(); buildExportPanels(); } });
  if (S.mp4.perfect) ctlSelect(m, { label: 'Repeticiones', options: [1, 2, 3, 4, 5, 6].map(n => [n, `${n} ciclo${n > 1 ? 's' : ''}`]), get: () => String(S.mp4.reps), set: setM('reps', true) });
  else ctlNumber(m, { label: 'Duración (s)', min: 1, max: 120, step: .5, get: () => S.mp4.dur, set: setM('dur', true) });
  ctlRange(m, { label: 'Velocidad', min: .25, max: 3, step: .05, get: () => S.anim.speed, set: v => { S.anim.speed = v; save(); buildAnimPanel(); updateExportInfo(); updateTime(); }, fmt: v => fmtN(v, 2) + '×' });
  ctlSelect(m, { label: 'Calidad', options: [['maxima', 'Máxima'], ['alta', 'Alta'], ['media', 'Media'], ['ligera', 'Ligera']], get: () => S.mp4.quality, set: v => { S.mp4.quality = v; S.mp4.mbps = 0; save(); buildExportPanels(); } });
  ctlRange(m, { label: 'Tasa de bits', min: 0, max: 60, step: .5, get: () => S.mp4.mbps, set: setM('mbps', true), fmt: v => v > 0 ? fmtN(v) + ' Mb/s' : 'auto' });
  ctlSelect(m, { label: 'Códec', options: [['auto', 'Automático (H.264)'], ['h264', 'H.264 · WebCodecs'], ['h264-ffmpeg', 'H.264 · FFmpeg.wasm'], ['vp9', 'VP9 en MP4'], ['av1', 'AV1 en MP4']], get: () => S.mp4.codec, set: setM('codec') });
  updateExportInfo();
}
function updateExportInfo() {
  const box = $('#pngInfo'); if (!box) return;
  const comp = currentComp(), { w, h } = pngDims(S.png.mult), up = upscaleOf(comp, S.png.mult);
  const q = up <= 1.001 ? ['ok', 'Nativa: ninguna imagen se amplía'] : up <= 1.3 ? ['warn', `Ampliación leve (${Math.round(up * 100)}%)`] : ['bad', `Ampliación ${Math.round(up * 100)}%: se verá más suave`];
  box.innerHTML = `<div><span>Archivo</span><b>${w} × ${h} px · ${fmtN(w * h / 1e6)} MP</b></div><div><span>Nitidez</span><b class="${q[0]}">${q[1]}</b></div><div><span>Fondo</span><b>${S.png.transparent || comp.style.bg === 'transparente' ? 'Transparente (canal alfa)' : 'Incluido'}</b></div><div><span>Nombre</span><b style="font-weight:500;font-size:11.5px">${pngName(S.design, S.fmt, w, h)}</b></div>`;
  const vb = $('#mp4Info'), vdm = videoDims(), dur = videoDur(), br = videoBitrate(), vup = upscaleOf(comp, vdm.w / comp.W);
  vb.innerHTML = `<div><span>Video</span><b>${vdm.w} × ${vdm.h} · ${S.mp4.fps} fps</b></div><div><span>Duración</span><b>${fmtN(dur)} s · ${fmtInt(Math.round(dur * S.mp4.fps))} fotogramas</b></div><div><span>Animación</span><b>${ANIMS.find(a => a.id === S.anim.preset).name}${S.anim.preset === 'ninguna' ? ' (video fijo)' : ''}</b></div><div><span>Tasa de bits</span><b>${fmtN(br / 1e6)} Mb/s · ~${fmtBytes(br * dur / 8)}</b></div><div><span>Nitidez</span><b class="${vup <= 1.001 ? 'ok' : vup <= 1.3 ? 'warn' : 'bad'}">${vup <= 1.001 ? 'Nativa' : 'Ampliación ' + Math.round(vup * 100) + '%'}</b></div>`;
}
function pngName(did, fid, w, h, extra = '') { return `mala-difusion_${did}_${fid}_${w}x${h}${extra}.png`; }

/* ───────────────────────── Exportación PNG ───────────────────────── */
const modal = {
  open(title, text) { $('#modal').hidden = false; $('#modalTitle').textContent = title; $('#modalText').textContent = text || ''; $('#modalBar').style.width = '0%'; $('#modalResult').innerHTML = ''; $('#modalCancel').hidden = false; $('#modalClose').hidden = true; this.cancelled = false; },
  progress(p, text) { $('#modalBar').style.width = (clamp(p, 0, 1) * 100).toFixed(1) + '%'; if (text != null) $('#modalText').textContent = text; },
  done(title, text) { $('#modalTitle').textContent = title; if (text != null) $('#modalText').textContent = text; $('#modalCancel').hidden = true; $('#modalClose').hidden = false; $('#modalBar').style.width = '100%'; },
  close() { $('#modal').hidden = true; const v = $('#modalResult video'); if (v) { v.pause(); URL.revokeObjectURL(v.src); } $('#modalResult').innerHTML = ''; },
  cancelled: false, onCancel: null,
};
function canvasToBlob(c, type = 'image/png', q) { return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('El navegador no pudo codificar la imagen (posible falta de memoria).')), type, q)); }
async function renderPNG(did, fid, mult, transparent, t) {
  const comp = resolveComp(did, fid), w = Math.round(comp.W * mult), h = Math.round(comp.H * mult);
  if (w * h > MAX_AREA || w > MAX_DIM || h > MAX_DIM) throw new Error(`${w}×${h} supera el tamaño máximo de lienzo de este navegador.`);
  const c = mkCanvas(w, h), ctx = c.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('No se pudo crear el lienzo de exportación (memoria insuficiente).');
  renderScene(ctx, comp, { kx: w / comp.W, ky: h / comp.H, transparent, t, direct: true });
  const blob = await canvasToBlob(c);
  c.width = c.height = 1;
  return { blob, w, h, name: pngName(did, fid, w, h, transparent || comp.style.bg === 'transparente' ? '_transparente' : '') };
}
async function verifyPNG(blob, w, h) {
  const head = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
  const sig = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => head[i] === v);
  const dv = new DataView(head.buffer), pw = dv.getUint32(16), ph = dv.getUint32(20);
  return sig && pw === w && ph === h;
}
async function exportPNG() {
  modal.open('Exportando PNG', 'Preparando la composición…');
  try {
    await nextFrame(); modal.progress(.2, 'Renderizando a resolución completa…'); await nextFrame();
    const r = await renderPNG(S.design, S.fmt, S.png.mult, S.png.transparent, S.png.frame && view.animOn ? view.t : null);
    modal.progress(.9, 'Verificando archivo…');
    const ok = await verifyPNG(r.blob, r.w, r.h);
    if (!ok) throw new Error('El PNG generado no tiene las dimensiones esperadas.');
    download(r.blob, r.name);
    modal.done('PNG listo', `${r.name}\n${r.w} × ${r.h} px · ${fmtBytes(r.blob.size)} · verificado`);
  } catch (err) { console.error(err); modal.done('No se pudo exportar el PNG', err.message || String(err)); }
}
/* ZIP sin compresión (los PNG ya están comprimidos) */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(ch.buffer, name);
    off += 30 + name.length + data.length;
  }
  const csize = central.reduce((a, b) => a + (b.byteLength ?? b.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
async function exportZip(kind) {
  const jobs = kind === 'formats' ? FORMATS.map(f => [S.design, f.id]) : DESIGNS.map(d => [d.id, S.fmt]);
  modal.open(kind === 'formats' ? 'PNG de todos los formatos' : 'PNG de todos los diseños', '');
  const files = [];
  try {
    for (let i = 0; i < jobs.length; i++) {
      if (modal.cancelled) throw new Error('Exportación cancelada.');
      const [did, fid] = jobs[i], f = FMT[fid];
      let m = S.png.mult; while (m > 1 && (f.W * m * f.H * m > MAX_AREA || f.W * m > MAX_DIM)) m = m > 2 ? m - 1 : 1;
      modal.progress(i / jobs.length, `${i + 1} de ${jobs.length}: ${DES[did].name} · ${f.pl} ${f.name}`);
      await nextFrame();
      const r = await renderPNG(did, fid, m, S.png.transparent, null);
      if (!(await verifyPNG(r.blob, r.w, r.h))) throw new Error(`PNG inválido: ${r.name}`);
      files.push(r);
    }
    modal.progress(.97, 'Empaquetando ZIP…');
    const zip = await makeZip(files), name = kind === 'formats' ? `mala-difusion_${S.design}_todos-los-formatos.zip` : `mala-difusion_${S.fmt}_todos-los-disenos.zip`;
    download(zip, name);
    modal.done('ZIP listo', `${name}\n${files.length} PNG · ${fmtBytes(zip.size)}`);
  } catch (err) { console.error(err); modal.done('Exportación detenida', err.message || String(err)); }
}
async function exportSheet() {
  modal.open('Lámina comparativa', 'Renderizando propuestas…');
  try {
    await Promise.all(['700 40px "Barlow Condensed"', '800 34px "Barlow Condensed"', '500 22px Barlow'].map(f => document.fonts.load(f))).catch(() => { });
    const f = FMT[S.fmt], n = DESIGNS.length, wide = f.W >= f.H;
    const cols = wide ? 2 : 3, rows = Math.ceil(n / cols), cw = wide ? 1100 : 720, chh = Math.round(cw * f.H / f.W), pad = 48, cap = 96, head = 170;
    const W = cols * cw + (cols + 1) * pad, H = head + rows * (chh + cap) + (rows + 1) * pad - pad + 30;
    const c = mkCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#0e0c0b'; x.fillRect(0, 0, W, H);
    const L = ASSETS.logo; const lh = 92; x.drawImage(L.trim, pad, 40, lh * L.aspect, lh);
    x.fillStyle = '#ece3cf'; x.font = '700 44px "Barlow Condensed", sans-serif'; x.textBaseline = 'alphabetic';
    x.fillText(`Propuestas · ${f.pl} ${f.name}`, pad + lh * L.aspect + 40, 82);
    x.fillStyle = '#9a8c78'; x.font = '500 26px Barlow, sans-serif'; x.fillText(`${f.W} × ${f.H} px · ${new Date().toLocaleDateString('es-CL')}`, pad + lh * L.aspect + 40, 122);
    for (let i = 0; i < n; i++) {
      modal.progress(i / n); await nextFrame();
      const d = DESIGNS[i], cx = pad + (i % cols) * (cw + pad), cy = head + Math.floor(i / cols) * (chh + cap + pad);
      const comp = resolveComp(d.id, S.fmt), tmp = mkCanvas(cw, chh); renderScene(tmp.getContext('2d'), comp, { kx: cw / comp.W, ky: chh / comp.H, direct: true });
      x.drawImage(tmp, cx, cy); x.strokeStyle = '#3d3127'; x.lineWidth = 2; x.strokeRect(cx, cy, cw, chh);
      x.fillStyle = '#d4571e'; x.font = '800 34px "Barlow Condensed", sans-serif'; x.fillText(`${String.fromCharCode(65 + i)} · ${d.name}`, cx, cy + chh + 44);
      x.fillStyle = '#9a8c78'; x.font = '500 22px Barlow, sans-serif'; x.fillText(d.desc, cx, cy + chh + 78, cw);
    }
    const blob = await canvasToBlob(c), name = `mala-difusion_comparativa_${S.fmt}.png`;
    download(blob, name); modal.done('Lámina lista', `${name}\n${W} × ${H} px · ${fmtBytes(blob.size)}`);
  } catch (err) { console.error(err); modal.done('No se pudo crear la lámina', err.message); }
}

/* ───────────────────────── Exportación MP4 ───────────────────────── */
const CODECS = {
  avc: ['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.64002A', 'avc1.640028', 'avc1.4D0034', 'avc1.4D0028', 'avc1.42003E', 'avc1.42001F'],
  vp9: ['vp09.00.51.08', 'vp09.00.41.08', 'vp09.00.31.08'],
  av1: ['av01.0.12M.08', 'av01.0.08M.08', 'av01.0.05M.08'],
};
async function findCodec(kind, w, h, bitrate, fps) {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of CODECS[kind]) {
    const cfg = { codec, width: w, height: h, bitrate: Math.round(bitrate), framerate: fps, latencyMode: 'quality', bitrateMode: 'variable' };
    if (kind === 'avc') cfg.avc = { format: 'avc' };
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return r.config || cfg; } catch { /* siguiente */ }
  }
  return null;
}
async function detectCodecs() {
  const out = [];
  if (typeof VideoEncoder === 'undefined') { $('#codecSupport').textContent = 'Este navegador no tiene WebCodecs: el MP4 se generará con FFmpeg.wasm (H.264), más lento.'; return; }
  for (const k of ['avc', 'vp9', 'av1']) if (await findCodec(k, 1280, 720, 4e6, 30)) out.push({ avc: 'H.264', vp9: 'VP9', av1: 'AV1' }[k]);
  $('#codecSupport').textContent = `Codificadores nativos disponibles: ${out.length ? out.join(', ') : 'ninguno'}.` + (out.includes('H.264') ? ' El MP4 se genera en H.264 directamente.' : ' Para H.264 se usará FFmpeg.wasm (descarga única de 32 MB).');
}
function mp4Name(w, h, c = "") { return `mala-difusion_${S.design}_${S.fmt}_${S.anim.preset}_${w}x${h}_${S.mp4.fps}fps${c ? "_" + c : ""}.mp4`; }
/** Codifica fotogramas con WebCodecs y los empaqueta en MP4 (mp4-muxer). */
async function encodeWebCodecs({ cfg, kind, w, h, fps, frames, draw, onProgress }) {
  const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: kind, width: w, height: h, frameRate: fps }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  let encErr = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => encErr = e });
  enc.configure(cfg);
  const c = mkCanvas(w, h), ctx = c.getContext('2d', { alpha: false });
  const gop = Math.max(1, Math.round(fps * 2));
  for (let i = 0; i < frames; i++) {
    if (modal.cancelled) { try { enc.close(); } catch { } throw new Error('Exportación cancelada.'); }
    if (encErr) throw encErr;
    draw(ctx, i);
    const vf = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    enc.encode(vf, { keyFrame: i % gop === 0 }); vf.close();
    while (enc.encodeQueueSize > 6) await sleep(4);
    if (i % 3 === 0) { onProgress(i / frames); await sleep(0); }
  }
  await enc.flush(); enc.close(); if (encErr) throw encErr;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
let ffmpegInst = null;
async function getFFmpeg(onText) {
  if (ffmpegInst) return ffmpegInst;
  onText('Cargando FFmpeg.wasm (≈32 MB, solo la primera vez)…');
  const { FFmpeg } = await import('./vendor/ffmpeg/ffmpeg/index.js');
  const ff = new FFmpeg();
  const base = new URL('vendor/ffmpeg/core/', location.href).href;
  await ff.load({ coreURL: base + 'ffmpeg-core.js', wasmURL: base + 'ffmpeg-core.wasm' });
  ffmpegInst = ff; return ff;
}
async function encodeFFmpeg({ w, h, fps, frames, draw, bitrate, onProgress, onText }) {
  let input, args;
  const inter = await findCodec('vp9', w, h, bitrate * 3, fps) || await findCodec('av1', w, h, bitrate * 3, fps);
  const ff = await getFFmpeg(onText);
  modal.onCancel = () => { try { ff.terminate(); } catch { } ffmpegInst = null; };
  if (inter) {
    onText('Paso 1/2: renderizando fotogramas…');
    const kind = inter.codec.startsWith('vp09') ? 'vp9' : 'av1';
    const mid = await encodeWebCodecs({ cfg: { ...inter, bitrate: Math.round(Math.min(bitrate * 3, 80e6)) }, kind, w, h, fps, frames, draw, onProgress: p => onProgress(p * .5) });
    await ff.writeFile('in.mp4', new Uint8Array(await mid.arrayBuffer()));
    input = ['-i', 'in.mp4'];
  } else {
    onText('Paso 1/2: renderizando fotogramas…');
    const c = mkCanvas(w, h), ctx = c.getContext('2d', { alpha: false });
    for (let i = 0; i < frames; i++) {
      if (modal.cancelled) throw new Error('Exportación cancelada.');
      draw(ctx, i);
      const b = await canvasToBlob(c, 'image/jpeg', .95);
      await ff.writeFile(`f${String(i).padStart(5, '0')}.jpg`, new Uint8Array(await b.arrayBuffer()));
      if (i % 3 === 0) onProgress(i / frames * .5);
    }
    input = ['-framerate', String(fps), '-i', 'f%05d.jpg'];
  }
  onText('Paso 2/2: codificando H.264 con FFmpeg…');
  const kb = Math.round(bitrate / 1000);
  ff.on('progress', ({ progress }) => onProgress(.5 + clamp(progress, 0, 1) * .5));
  args = [...input, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${kb}k`, '-maxrate', `${Math.round(kb * 1.5)}k`, '-bufsize', `${kb * 2}k`, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(fps), '-movflags', '+faststart', '-an', 'out.mp4'];
  const code = await ff.exec(args);
  if (code !== 0) throw new Error('FFmpeg terminó con error (código ' + code + ').');
  const data = await ff.readFile('out.mp4');
  for (const n of ['in.mp4', 'out.mp4']) { try { await ff.deleteFile(n); } catch { } }
  if (!inter) for (let i = 0; i < frames; i++) { try { await ff.deleteFile(`f${String(i).padStart(5, '0')}.jpg`); } catch { } }
  return new Blob([data.buffer], { type: 'video/mp4' });
}
/** Lee la estructura MP4 (cajas ftyp/moov/mdat y códec de la pista). */
async function inspectMP4(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(u8.buffer); const top = []; let off = 0;
  const str = (o, n) => String.fromCharCode(...u8.subarray(o, o + n));
  while (off + 8 <= u8.length) { let size = dv.getUint32(off); const type = str(off + 4, 4); if (size === 1) size = Number(dv.getBigUint64(off + 8)); if (size < 8) break; top.push(type); off += size; }
  let brand = top[0] === 'ftyp' ? str(8, 4) : '';
  const find = s => { for (let i = 0; i < u8.length - 4; i++) if (u8[i] === s.charCodeAt(0) && str(i, 4) === s) return i; return -1; };
  const codec = ['avc1', 'vp09', 'av01', 'hvc1'].find(c => find(c) > 0) || '?';
  return { valid: top[0] === 'ftyp' && top.includes('moov') && top.includes('mdat'), top, brand, codec };
}
function probeVideo(url) {
  return new Promise(res => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'metadata';
    const t = setTimeout(() => res(null), 6000);
    v.onloadedmetadata = () => { clearTimeout(t); res({ d: v.duration, w: v.videoWidth, h: v.videoHeight }); };
    v.onerror = () => { clearTimeout(t); res(null); }; v.src = url;
  });
}
async function exportMP4() {
  const comp = resolveComp(), { w, h } = videoDims(), fps = S.mp4.fps, dur = videoDur(), frames = Math.max(1, Math.round(dur * fps)), bitrate = videoBitrate();
  const anim = { ...S.anim };
  modal.open('Exportando MP4', 'Preparando…');
  const t0 = performance.now();
  const draw = (ctx, i) => renderScene(ctx, comp, { kx: w / comp.W, ky: h / comp.H, t: anim.preset === 'ninguna' ? null : i / fps, anim, video: true });
  const onProgress = p => { const el = (performance.now() - t0) / 1000, eta = p > .03 ? el / p - el : 0; modal.progress(p, `${$('#modalText').dataset.stage || ''}${eta ? `\n${Math.round(p * 100)}% · quedan ~${Math.ceil(eta)} s` : ''}`); };
  const onText = s => { $('#modalText').dataset.stage = s; modal.progress(parseFloat($('#modalBar').style.width) / 100 || 0, s); };
  try {
    let blob, method;
    const want = S.mp4.codec;
    if (want === 'vp9' || want === 'av1') {
      const cfg = await findCodec(want, w, h, bitrate, fps);
      if (!cfg) throw new Error(`Este navegador no puede codificar ${want.toUpperCase()} a ${w}×${h}. Prueba "Automático (H.264)" o una resolución menor.`);
      onText(`Codificando ${want.toUpperCase()} (${cfg.codec})…`);
      blob = await encodeWebCodecs({ cfg, kind: want, w, h, fps, frames, draw, onProgress }); method = `WebCodecs ${cfg.codec}`;
    } else {
      const cfg = want === 'h264-ffmpeg' ? null : await findCodec('avc', w, h, bitrate, fps);
      if (cfg) { onText(`Codificando H.264 (${cfg.codec})…`); blob = await encodeWebCodecs({ cfg, kind: 'avc', w, h, fps, frames, draw, onProgress }); method = `WebCodecs ${cfg.codec}`; }
      else if (want === 'h264') throw new Error('Este navegador no ofrece codificador H.264 por WebCodecs. Elige "Automático" para usar FFmpeg.wasm, o "VP9 en MP4".');
      else { blob = await encodeFFmpeg({ w, h, fps, frames, draw, bitrate, onProgress, onText }); method = 'FFmpeg.wasm libx264'; }
    }
    modal.progress(1, 'Verificando el archivo MP4…');
    const info = await inspectMP4(blob);
    if (!info.valid) throw new Error('El archivo generado no tiene una estructura MP4 válida.');
    const url = URL.createObjectURL(blob), probe = await probeVideo(url), name = mp4Name(w, h, { avc1: "h264", vp09: "vp9", av01: "av1" }[info.codec]);
    download(blob, name);
    const codecName = { avc1: 'H.264 (avc1)', vp09: 'VP9 (vp09)', av01: 'AV1 (av01)' }[info.codec] || info.codec;
    modal.done('MP4 listo', '');
    $('#modalResult').innerHTML = `<div class="export-info">
      <div><span>Archivo</span><b style="font-size:11.5px">${name}</b></div>
      <div><span>Contenedor</span><b class="ok">MP4 auténtico (ftyp ${info.brand}, ${info.top.join(' · ')})</b></div>
      <div><span>Códec</span><b>${codecName} · ${method}</b></div>
      <div><span>Video</span><b>${w}×${h} · ${fps} fps · ${fmtN(frames / fps)} s</b></div>
      <div><span>Tamaño</span><b>${fmtBytes(blob.size)} · ${fmtN(blob.size * 8 / (frames / fps) / 1e6)} Mb/s</b></div>
      <div><span>Reproducción</span><b class="${probe ? 'ok' : 'warn'}">${probe ? `Reproducible aquí (${fmtN(probe.d)} s)` : 'Este navegador no reproduce este códec; el archivo sí es válido'}</b></div>
      <div><span>Tiempo</span><b>${fmtN((performance.now() - t0) / 1000)} s</b></div>
    </div>${probe ? `<video src="${url}" controls loop muted playsinline autoplay></video>` : ''}<a class="dl-link" href="${url}" download="${name}">Descargar de nuevo</a>`;
  } catch (err) {
    console.error(err);
    modal.done('No se pudo exportar el MP4', (err && err.message) || String(err));
  } finally { modal.onCancel = null; }
}

/* ───────────────────────── Cargas de imágenes ───────────────────────── */
const uploaded = {}; // id -> {blob, cut?, tol, opaque}
let pickTarget = null;
function pickFile(id) { pickTarget = id; $('#fileInput').value = ''; $('#fileInput').click(); }
async function blobToImage(blob) { const url = URL.createObjectURL(blob); try { const im = new Image(); im.src = url; await im.decode(); return im; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); } }
function isOpaque(img) {
  const c = mkCanvas(64, 64), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return false; return true;
}
async function onFile(file) {
  const id = pickTarget; if (!id || !file) return;
  try {
    const img = await blobToImage(file);
    const rec = { blob: file, name: file.name, opaque: isOpaque(img), tol: 40 };
    await IDB.set('member:' + id, rec).catch(() => { });
    uploaded[id] = rec;
    applyMemberImage(id, img);
    S.enabled[id] = true; invalidate(); buildMemberList();
    toast(`${MEM[id].name}: imagen cargada (${img.naturalWidth}×${img.naturalHeight})${rec.opaque ? '. No tiene transparencia: usa "Quitar fondo".' : '.'}`);
  } catch (err) { toast('No se pudo leer la imagen: ' + err.message, true); }
}
function applyMemberImage(id, img) {
  const key = id === 'eduardo' ? 'eduardo' : id;
  prepareAsset(key, img);
}
async function cutBackground(id, undoCut) {
  const rec = uploaded[id]; if (!rec) return;
  const img = await blobToImage(rec.blob);
  if (undoCut) { rec.cut = false; applyMemberImage(id, img); await IDB.set('member:' + id, rec).catch(() => { }); invalidate(); buildMemberList(); return; }
  const w = img.naturalWidth, h = img.naturalHeight, c = mkCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0); const id2 = x.getImageData(0, 0, w, h), d = id2.data;
  // color de fondo = mediana de los bordes
  const br = [], bg = [], bb = []; const push = i => { br.push(d[i]); bg.push(d[i + 1]); bb.push(d[i + 2]); };
  for (let xx = 0; xx < w; xx += 4) { push(xx * 4); push(((h - 1) * w + xx) * 4); } for (let y = 0; y < h; y += 4) { push(y * w * 4); push((y * w + w - 1) * 4); }
  const med = a => a.sort((p, q) => p - q)[a.length >> 1]; const R = med(br), G = med(bg), B = med(bb), tol = rec.tol || 40;
  const dist = i => Math.max(Math.abs(d[i] - R), Math.abs(d[i + 1] - G), Math.abs(d[i + 2] - B));
  const seen = new Uint8Array(w * h), st = [];
  for (let xx = 0; xx < w; xx++) { st.push(xx, (h - 1) * w + xx); } for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
  while (st.length) { const p = st.pop(); if (seen[p]) continue; if (dist(p * 4) > tol) continue; seen[p] = 1; const xx = p % w, y = (p / w) | 0; if (xx > 0) st.push(p - 1); if (xx < w - 1) st.push(p + 1); if (y > 0) st.push(p - w); if (y < h - 1) st.push(p + w); }
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) { d[p * 4 + 3] = 0; continue; }
    const xx = p % w, y = (p / w) | 0; // borde suave de 1 px
    if ((xx > 0 && seen[p - 1]) || (xx < w - 1 && seen[p + 1]) || (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w])) d[p * 4 + 3] = Math.min(d[p * 4 + 3], 150);
  }
  x.putImageData(id2, 0, 0);
  rec.cut = true; await IDB.set('member:' + id, rec).catch(() => { });
  prepareAsset(id === 'eduardo' ? 'eduardo' : id, c);
  invalidate(); buildMemberList(); toast(`${MEM[id].name}: fondo quitado (tolerancia ${tol}). Revisa el resultado y ajusta si hace falta.`);
}
async function removeUpload(id) {
  await IDB.del('member:' + id).catch(() => { }); delete uploaded[id];
  if (MEM[id].src) { const img = await loadImg(MEM[id].src); applyMemberImage(id, img); }
  else { delete ASSETS[id]; clearAssetCaches(id); }
  invalidate(); buildMemberList(); toast('Imagen cargada eliminada.');
}
async function restoreUploads() {
  for (const m of MEMBERS) {
    try {
      const rec = await IDB.get('member:' + m.id); if (!rec) continue;
      uploaded[m.id] = rec; const img = await blobToImage(rec.blob); applyMemberImage(m.id, img);
      if (rec.cut) { uploaded[m.id] = rec; await cutBackground(m.id); }
    } catch { /* sin IndexedDB */ }
  }
}

/* ───────────────────────── Comparar y presentar ───────────────────────── */
const cmp = { mode: 'designs', animate: false, t: 0, a: 'escenario', b: 'afiche', cards: [] };
function buildCompare() {
  const g = $('#cmpGrid'); g.innerHTML = ''; g.classList.toggle('ab', cmp.mode === 'ab'); cmp.cards = [];
  const add = (did, fid, title, sub, selName) => {
    const card = document.createElement('div'); card.className = 'cmp-card';
    const f = FMT[fid], cv = document.createElement('canvas');
    card.innerHTML = `<div class="cap"><b>${title}</b><span>${sub}</span></div>`;
    if (selName) { const s = document.createElement('select'); s.innerHTML = DESIGNS.map(d => `<option value="${d.id}">${d.name}</option>`).join(''); s.value = did; s.onchange = () => { cmp[selName] = s.value; buildCompare(); }; card.querySelector('.cap').appendChild(s); }
    card.prepend(cv); cv.title = 'Abrir en el editor'; cv.onclick = () => { S.design = did; S.fmt = fid; setView('editor'); buildPanels(); buildFormatList(); fitView(); invalidate(); };
    g.appendChild(card); cmp.cards.push({ cv, did, fid, f });
  };
  if (cmp.mode === 'designs') DESIGNS.forEach((d, i) => add(d.id, S.fmt, `${String.fromCharCode(65 + i)} · ${d.name}`, d.desc));
  else if (cmp.mode === 'formats') FORMATS.forEach(f => add(S.design, f.id, `${f.pl} · ${f.name}`, `${f.W}×${f.H}`));
  else { add(cmp.a, S.fmt, 'A', FMT[S.fmt].name, 'a'); add(cmp.b, S.fmt, 'B', FMT[S.fmt].name, 'b'); }
  requestAnimationFrame(() => drawCompare(0, true));
}
function drawCompare(dt, force) {
  if (!force && !cmp.animate) return;
  cmp.t += dt || 0;
  for (const c of cmp.cards) {
    const wpx = c.cv.clientWidth || 300, dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(wpx * dpr), h = Math.round(w * c.f.H / c.f.W);
    if (c.cv.width !== w || c.cv.height !== h) { c.cv.width = w; c.cv.height = h; }
    renderScene(c.cv.getContext('2d'), resolveComp(c.did, c.fid), { k: w / c.f.W, t: cmp.animate ? cmp.t : null });
  }
}
const pres = { i: 0, t: 0, since: 0, prev: null, fadeT: 1, cv: null };
function openPresent() {
  S.view = 'present'; $('#present').hidden = false; pres.cv = $('#presentCanvas'); pres.i = DESIGNS.findIndex(d => d.id === S.design); pres.t = 0; pres.since = 0; pres.fadeT = 1;
  const el = $('#present'); if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
  presLabel();
}
function closePresent() { $('#present').hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => { }); setView('editor'); }
function presStep(d) { pres.prev = { i: pres.i, t: pres.t }; pres.i = (pres.i + d + DESIGNS.length) % DESIGNS.length; pres.since = 0; pres.fadeT = 0; presLabel(); }
function presLabel() { const d = DESIGNS[pres.i]; $('#presLbl').textContent = `${String.fromCharCode(65 + pres.i)} · ${d.name} — ${FMT[S.fmt].name}`; }
function drawPresent(dt) {
  const cv = pres.cv, f = FMT[S.fmt]; if (!cv) return;
  const sc = Math.min(innerWidth / f.W, innerHeight / f.H), dpr = Math.min(2, devicePixelRatio || 1);
  let w = Math.round(f.W * sc * dpr), h = Math.round(f.H * sc * dpr); const cap = 4e6; if (w * h > cap) { const r = Math.sqrt(cap / (w * h)); w = Math.round(w * r); h = Math.round(h * r); }
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; cv.style.width = f.W * sc + 'px'; cv.style.height = f.H * sc + 'px'; }
  pres.t += dt; pres.since += dt; pres.fadeT = Math.min(1, pres.fadeT + dt / .9);
  const hold = Math.max(5, cycleLen());
  if ($('#presAuto').checked && pres.since > hold) presStep(1);
  const ctx = cv.getContext('2d'), anim = S.anim.preset === 'ninguna' ? null : S.anim;
  renderScene(ctx, resolveComp(DESIGNS[pres.i].id, S.fmt), { k: w / f.W, t: anim ? pres.since : null, anim });
  if (pres.fadeT < 1 && pres.prev) {
    const tmp = drawPresent._tmp ||= mkCanvas(1, 1); if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; }
    renderScene(tmp.getContext('2d'), resolveComp(DESIGNS[pres.prev.i].id, S.fmt), { k: w / f.W, t: anim ? pres.prev.t + pres.since : null, anim });
    ctx.save(); ctx.globalAlpha = 1 - EASE.suave(pres.fadeT); ctx.drawImage(tmp, 0, 0); ctx.restore();
  }
}

/* ───────────────────────── Vistas y paneles ───────────────────────── */
function setView(v) {
  if (v === 'present') { openPresent(); $$('.views button').forEach(b => b.classList.toggle('on', b.dataset.view === 'present')); return; }
  S.view = v; $$('.views button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#compareView').hidden = v !== 'compare';
  if (v === 'compare') { stopAnimPreview(); buildCompare(); }
  if (v === 'editor') { fitView(); view.dirty = true; }
}
function setTab(t) {
  S.tab = t; $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.tab-body').forEach(b => b.hidden = b.dataset.body !== t);
  if (t === 'exportar') updateExportInfo();
}
function buildPanels() {
  buildMemberList(); buildLayoutCtrls(); buildInspector(); buildStylePanel(); buildAnimPanel(); buildExportPanels();
  $$('#designList .design-card').forEach(b => b.classList.toggle('on', b.dataset.id === S.design));
  scheduleThumbs(); scheduleInfo();
}
function closeSheetsOnMobile() { if (matchMedia('(max-width:1100px)').matches) { $$('.side').forEach(s => s.classList.remove('open')); $$('.mobile-bar button').forEach(b => b.classList.remove('on')); setTimeout(fitView, 260); } }
function bindUI() {
  $$('.views button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('.tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $('#tglSafe').checked = S.safe; $('#tglGuides').checked = S.guides;
  $('#tglSafe').onchange = e => { S.safe = e.target.checked; save(); view.dirty = true; };
  $('#tglGuides').onchange = e => { S.guides = e.target.checked; save(); view.dirty = true; };
  $('#btnPlay').onclick = () => setPlaying(!view.playing);
  $('#btnRestart').onclick = restartAnim;
  const sc = $('#scrub');
  sc.addEventListener('input', () => { view.scrubbing = true; if (S.anim.preset === 'ninguna') return; if (view.playing) setPlaying(false); view.animOn = true; view.t = sc.value / 1000 * cycleLen(); view.dirty = true; updateTime(); });
  sc.addEventListener('change', () => view.scrubbing = false);
  $('#quickAnim').innerHTML = ANIMS.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  $('#quickAnim').onchange = e => { S.anim.preset = e.target.value; save(); buildAnimPanel(); updateExportInfo(); view.t = 0; if (S.anim.preset === 'ninguna') stopAnimPreview(); else setPlaying(true); };
  syncQuickAnim();
  $('#btnRelayout').onclick = () => { beginChange(); const o = S.over[compKey(S.design, S.fmt)]; if (o) for (const k of Object.keys(o)) { delete o[k].x; delete o[k].y; delete o[k].h; delete o[k].r; delete o[k].z; } invalidate(); buildInspector(); toast('Posiciones recalculadas automáticamente para este formato.'); };
  $('#btnResetComp').onclick = () => { beginChange(); delete S.over[compKey(S.design, S.fmt)]; delete S.layout[S.design]; invalidate(); buildPanels(); toast('Composición restaurada (Ctrl+Z para deshacer).'); };
  $('#btnResetStyle').onclick = () => { beginChange(); delete S.styles[S.design]; invalidate(); buildPanels(); toast('Estilo del diseño restaurado.'); };
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnPng').onclick = $('#btnQuickPng').onclick = exportPNG;
  $('#btnMp4').onclick = $('#btnQuickMp4').onclick = exportMP4;
  $('#btnZipFormats').onclick = () => exportZip('formats');
  $('#btnZipDesigns').onclick = () => exportZip('designs');
  $('#btnSheet').onclick = exportSheet;
  $('#modalCancel').onclick = () => { modal.cancelled = true; if (modal.onCancel) modal.onCancel(); $('#modalText').textContent = 'Cancelando…'; };
  $('#modalClose').onclick = () => modal.close();
  $('#fileInput').onchange = e => onFile(e.target.files[0]);
  $$('#cmpMode button').forEach(b => b.onclick = () => { cmp.mode = b.dataset.m; $$('#cmpMode button').forEach(x => x.classList.toggle('on', x === b)); buildCompare(); });
  $('#cmpAnimate').onchange = e => { cmp.animate = e.target.checked; cmp.t = 0; if (!cmp.animate) drawCompare(0, true); };
  $('#presPrev').onclick = () => presStep(-1); $('#presNext').onclick = () => presStep(1); $('#presClose').onclick = closePresent;
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && S.view === 'present') closePresent(); });
  $$('.mobile-bar button').forEach(b => b.onclick = () => {
    const p = b.dataset.panel, isOpen = b.classList.contains('on');
    $$('.mobile-bar button').forEach(x => x.classList.remove('on')); $$('.side').forEach(s => s.classList.remove('open'));
    if (!isOpen) { b.classList.add('on'); if (p === 'sideLeft') $('#sideLeft').classList.add('open'); else { $('#sideRight').classList.add('open'); setTab(p); } }
  });
  window.addEventListener('keydown', onKey);
  new ResizeObserver(() => { fitView(); }).observe($('#stage'));
  window.addEventListener('resize', () => { if (S.view === 'compare') drawCompare(0, true); });
}

/* ───────────────────────── Inicio ───────────────────────── */
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo cargar ' + src)); i.src = src; }); }
async function init() {
  loadState();
  view.cv = $('#view'); view.ctx = view.cv.getContext('2d');
  const list = [['logo', 'img/logo_horizontal.png'], ['eduardo', 'img/eduardo.png'], ['eduardo_3q', 'img/eduardo_3q.png'], ['pelusa', 'img/pelusa.png'], ['lyn', 'img/lyn.png']];
  let done = 0; const errors = [];
  await Promise.all(list.map(async ([k, src]) => {
    try { const img = await loadImg(src); prepareAsset(k, img); } catch (e) { errors.push(e.message); }
    done++; $('#loaderFill').style.width = (done / list.length * 100) + '%'; $('#loaderText').textContent = `Cargando imágenes… ${done}/${list.length}`;
  }));
  MEGA = makeMegaphone();
  await restoreUploads();
  window.__md = { S, ASSETS, FORMATS, DESIGNS, ANIMS, resolveComp, renderPNG, exportMP4, exportPNG, exportZip, inspectMP4, findCodec, view, renderScene, setFormat, setView, errors };
  bindUI(); buildDesignList(); buildFormatList(); buildPanels(); setTab(S.tab || 'elementos'); bindCanvas();
  fitView(); updateTime(); requestAnimationFrame(loop);
  detectCodecs();
  try { await document.fonts.ready; } catch { }
  $('#loader').classList.add('done'); setTimeout(() => $('#loader').remove(), 500);
  if (errors.length) toast('Algunas imágenes no se cargaron: ' + errors.join('; '), true, 8000);
  else {
    const miss = MEMBERS.filter(m => !ASSETS[memberAssetKey(m, layoutOf(S.design))]).map(m => m.name);
    if (miss.length) toast(`Faltan los PNG de ${miss.join(', ')}. Cárgalos en "Integrantes" y se suman solos a todas las composiciones.`, false, 7000);
  }
}
init();
