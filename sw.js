// Service worker: офлайн-кэш. Код — сеть с откатом на кэш; ресурсы (assets/, icons/) — кэш с дозагрузкой.
const CACHE = 'potionbar-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('potionbar-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const isAsset = (u) => /\/(assets|icons)\//.test(u.pathname);
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (isAsset(url)) {
    e.respondWith(caches.match(url.pathname).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.status === 200) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, cp)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, cp)); }
    return res;
  }).catch(() => caches.match(url.pathname, { ignoreSearch: true }).then((h) => h || caches.match('index.html'))));
});
