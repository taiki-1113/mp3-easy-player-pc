const CACHE = 'mp3-easy-player-pc-v2';
const BASE = new URL('./', self.location.href);
const ASSETS = ['./', './index.html', './app.js', './model.js', './library.js', './storage.js', './style.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'].map(path => new URL(path, BASE).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('mp3-easy-player-pc-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  // Only the fixed application shell is cached, never music or another app.
  if (event.request.method !== 'GET' || !ASSETS.includes(event.request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(event.request)) || fetch(event.request);
  })());
});
