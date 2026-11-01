/* Offline support: app shell cache-first, live API network-first, images/tiles stale-while-revalidate. */
const V = 'dlp-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'data.js', 'manifest.webmanifest', 'icons/icon-192.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && !k.startsWith('dlp-rt')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname === 'api.themeparks.wiki' || u.hostname === 'api.open-meteo.com') {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open('dlp-rt-api').then(x => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request)));
    return;
  }
  if (/wikimedia\.org$|openstreetmap\.org$|gstatic\.com$|googleapis\.com$/.test(u.hostname)) {
    e.respondWith(caches.open('dlp-rt-media').then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && u.origin === location.origin) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
    return r;
  })));
});
