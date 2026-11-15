import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
function worker(fail = false) {
  const handlers = {}, stored = new Map(), deleted = [];
  const cache = {
    async addAll(urls) { if (fail) throw Error('offline'); for (const url of urls) stored.set(url, new Response(url)); },
    async match(request) { return stored.get(request.url)?.clone(); },
  };
  const context = { URL, fetch: async () => { throw Error('offline'); }, caches: {
    open: async () => cache, keys: async () => ['mp3-easy-player-pc-old', 'mp3-easy-player-iphone'], delete: async name => deleted.push(name),
  }, self: { location: { href: 'https://example.test/mp3-easy-player-pc/sw.js' }, addEventListener: (name, handler) => handlers[name] = handler, clients: { claim: async () => {} } } };
  vm.runInNewContext(readFileSync(new URL('../docs/sw.js', import.meta.url), 'utf8'), context);
  return { stored, deleted, async lifecycle(name) { let result; handlers[name]({ waitUntil: p => result = p }); await result; }, async request(url) { let result; handlers.fetch({ request: { url, method: 'GET' }, respondWith: p => result = p }); return result; } };
}
test('オフライン資材が実在し、iPhone版キャッシュは変更しない', async () => {
  const w = worker(); await w.lifecycle('install'); await w.lifecycle('activate');
  assert.deepEqual(w.deleted, ['mp3-easy-player-pc-old']);
  for (const url of w.stored.keys()) {
    const path = new URL(url).pathname.replace('/mp3-easy-player-pc/', '') || 'index.html';
    assert.ok(existsSync(new URL('../docs/' + path, import.meta.url)), path);
    if (path.endsWith('.html') || path.endsWith('.js')) {
      for (const match of readFileSync(new URL('../docs/' + path, import.meta.url), 'utf8').matchAll(/(?:from\s*|(?:src|href)=)["'](\.\/[^"']+)["']/g)) assert.ok(w.stored.has(new URL(match[1], url).href), match[1]);
    }
  }
  assert.equal((await w.request('https://example.test/mp3-easy-player-pc/')).status, 200);
  assert.equal(await w.request('https://example.test/mp3-easy-player/'), undefined);
  assert.equal(await w.request('https://example.test/mp3-easy-player-pc/song.mp3'), undefined);
  await assert.rejects(worker(true).lifecycle('install'));
});
