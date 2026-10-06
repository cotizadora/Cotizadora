// Afiche Urgencia Dental — deja la app lista para abrirse aunque la señal sea mala.
const CACHE = 'afiche-urgencia-v2';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'base-urgencia.jpg',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // La página: primero la red (para recibir cambios) y si no hay, la guardada.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      const copia = r.clone(); caches.open(CACHE).then((c) => c.put('index.html', copia)); return r;
    }).catch(() => caches.match('index.html')));
    return;
  }
  // Imágenes, letras y la biblioteca del QR: lo guardado y se actualiza por detrás.
  e.respondWith(caches.match(req).then((hit) => {
    const red = fetch(req).then((r) => {
      if (r && (r.ok || r.type === 'opaque')) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return r;
    }).catch(() => hit);
    return hit || red;
  }));
});
