const CACHE = 'mp3-easy-player-pc-v3';
const BASE = new URL('./', self.location.href);
const ASSETS = ['./', './index.html', './app.js', './model.js', './library.js', './storage.js', './style.css?v=3', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'].map(path => new URL(path, BASE).href);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
  // Switch the shell cache after a complete download. Existing playback is left running.
  await self.skipWaiting();
})()));
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
