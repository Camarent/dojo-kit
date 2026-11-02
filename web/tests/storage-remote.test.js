'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'demo';
const KEY = 'dojo.demo.progress.v1';
const PATH = 'data/users/u1/progress-demo';
let dojo;

test.before(async () => {
  checkWasmFresh();
  dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});

function mockLocal() {
  const m = new Map();
  return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

function mockClaude() {
  const c = { paths: [], remote: null };
  const ref = {
    get: async () => ({ exists: false, data: () => null }),
    set: async (body) => { c.remote = JSON.parse(JSON.stringify(body)); },
    onSnapshot: () => () => {}
  };
  c.use = async (name) => {
    if (name === 'db') return { doc: (p) => { c.paths.push(p); return ref; } };
    return { id: async () => 'u1' };
  };
  return c;
}

function make(o) {
  const statuses = [];
  const ls = mockLocal();
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: ls,
    claude: o.claude === undefined ? null : o.claude,
    storageProvider: o.storageProvider,
    onStatus: (s) => statuses.push(s),
    onRemoteChange: () => {},
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {}
  });
  return { store, ls, statuses };
}

test('claude path: db path and local key stay unchanged without a provider', async () => {
  const claude = mockClaude();
  const t = make({ claude: claude });
  await t.store.load();
  assert.deepStrictEqual(claude.paths, [PATH]);
  t.store.update((d) => { d.items = {}; });
  assert.ok(t.ls.map.has(KEY), 'local write uses ' + KEY);
});

test('provider path: openRef(ctx) result is attached and used for writes', async () => {
  const calls = [];
  const remote = { data: null };
  const ref = {
    get: async () => ({ exists: false, data: () => null }),
    set: async (body) => { remote.data = JSON.parse(JSON.stringify(body)); },
    onSnapshot: () => () => {}
  };
  const provider = {
    openRef: async (ctx) => { calls.push(ctx); return { ref: ref, snap: { exists: false, data: () => null } }; }
  };
  const t = make({ storageProvider: provider });
  await t.store.load();
  assert.deepStrictEqual(calls, [{ courseId: COURSE, key: KEY }]);
  assert.ok(t.statuses.includes('cloud'), 'status cloud, got ' + t.statuses.join(','));
  t.store.update((d) => { d.items = {}; });
  await new Promise((r) => setImmediate(r));
  assert.ok(remote.data, 'provider ref received a write');
});

test('provider works without claude', async () => {
  const provider = {
    openRef: async () => ({ ref: { get: async () => ({ exists: false }), set: async () => {}, onSnapshot: () => () => {} }, snap: { exists: false } })
  };
  const t = make({ storageProvider: provider, claude: null });
  await t.store.load();
  assert.ok(t.statuses.includes('cloud'));
});

test('provider rejection with kind absent goes local', async () => {
  const provider = { openRef: async () => { throw { kind: 'absent' }; } };
  const t = make({ storageProvider: provider, claude: mockClaude() });
  await t.store.load();
  assert.strictEqual(t.statuses[t.statuses.length - 1], 'local');
});
