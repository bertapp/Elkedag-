// Eerst het netwerk proberen (zo komt een nieuwe versie meteen binnen), anders de bewaarde kopie (werkt offline).
// Je gegevens staan los hiervan op de telefoon en blijven bij elke update gewoon bewaard.
const CACHE = 'elkedag-v12';
const FILES = ['./', './index.html', './app.js', './manifest.webmanifest', './ring-192.png', './ring-512.png', './ring-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  // cache: 'no-cache' = altijd even bij de server navragen of er een nieuwere versie is
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (!r.ok) return r; const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
