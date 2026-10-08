const C = 'kimbo-v1';
const SHELL = ['editor.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).catch(()=>{})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    // red primero: siempre lo último cuando hay internet; cache si no hay
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('editor.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(r2 => { const cp = r2.clone(); caches.open(C).then(c => c.put(req, cp)); return r2; }).catch(()=>r)));
  }
});
