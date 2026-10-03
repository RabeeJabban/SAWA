const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worker({ cached, offline = false, installFails = false } = {}) {
  const handlers = {}, deleted = [], writes = [];
  let skipped = false;
  const cache = {
    match: async () => cached,
    put: async (...args) => writes.push(args),
    addAll: async () => { if (installFails) throw new Error('offline'); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), {
    URL, Response,
    fetch: async () => { if (offline) throw new Error('offline'); return new Response('fresh'); },
    caches: { open: async () => cache, keys: async () => ['orbyx-10', 'orbyx-15', 'orbyx-17', 'other-app'], delete: async n => deleted.push(n) },
    self: { location: { origin: 'https://example.com' }, registration: { scope: 'https://example.com/orbyx/' },
      addEventListener: (name, fn) => handlers[name] = fn,
      skipWaiting: async () => { skipped = true; }, clients: { claim: async () => {} } }
  });
  return { handlers, deleted, writes, skipped: () => skipped };
}

test('activation preserves other apps and the current cache', async () => {
  const w = worker(); let pending;
  w.handlers.activate({ waitUntil: p => pending = p }); await pending;
  assert.deepEqual(w.deleted, ['orbyx-10', 'orbyx-15']);
});

test('failed precache rejects installation without skipping waiting', async () => {
  const w = worker({ installFails: true }); let pending;
  w.handlers.install({ waitUntil: p => pending = p });
  await assert.rejects(pending); assert.equal(w.skipped(), false);
});

for (const cached of [undefined, new Response('cached')]) {
  test(`offline ${cached ? 'returns cached file' : 'returns 503 on a miss'}`, async () => {
    const w = worker({ cached, offline: true }); let response, pending;
    w.handlers.fetch({ request: { method: 'GET', url: 'https://example.com/orbyx/app.js' },
      respondWith: p => response = p, waitUntil: p => pending = p });
    const result = await response; await pending;
    assert.equal(result.status, cached ? 200 : 503);
    if (cached) assert.equal(await result.text(), 'cached');
  });
}

test('a network response replaces a stale cached file', async () => {
  const w = worker({ cached: new Response('cached') }); let response, pending;
  w.handlers.fetch({ request: { method: 'GET', url: 'https://example.com/orbyx/app.js' },
    respondWith: p => response = p, waitUntil: p => pending = p });
  assert.equal(await (await response).text(), 'fresh'); await pending;
  assert.equal(w.writes.length, 1);
});

test('unlisted URLs and external requests bypass the worker', () => {
  const w = worker();
  for (const url of ['https://example.com/private.json', 'https://www.gstatic.com/firebase.js', 'https://example.com/orbyx/sw.js?frisch=1']) {
    w.handlers.fetch({ request: { method: 'GET', url }, respondWith: () => assert.fail('unexpected interception') });
  }
});
