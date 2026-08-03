const CACHE = 'machado-v1';
const ASSETS = ['/', '/index.html', '/static/js/main.chunk.js', '/static/js/bundle.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
