// GarrinchApp service worker: cache básico + notificações push
const CACHE = 'garrinchapp-v4';
const BASE = new URL(self.registration.scope).pathname; // ex.: /garrinchapp/
const rel = (u) => new URL(String(u || '').replace(/^\//, ''), self.registration.scope).href;
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // network-first para HTML, cache-first para assets com hash
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(BASE + 'index.html', c)); return r; }).catch(() => caches.match(BASE + 'index.html')));
    return;
  }
  if (url.pathname.startsWith(BASE + 'assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); return r; })));
  }
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'GarrinchApp', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'GarrinchApp', {
    body: d.body || '', icon: rel('icon-192.png'), badge: rel('icon-192.png'), tag: d.tag, data: { url: rel(d.url || '') },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
