'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const DojoMigrate = require('../migrate.js');
const { checkWasmFresh } = require('./loader.js');

const KEY = 'dojo.demo.progress.v1';
const NOW = 1760000000000;
let dojo;
test.before(async () => { dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh())); });

const rec = (s, last) => ({ s, due: last + 1000, ok: 1, bad: 0, last });
const ITEMS = [
  { id: 'a-1', status: 'retired' },
  { id: 'a-2', status: 'retired' },
  { id: 'b-1', supersedes: ['a-1', 'a-2'] },
  { id: 'c-1' }
];
const mkDoc = (items, t) => ({ v: 1, t: t || 5, course: 'demo', resetAt: 0, items, stats: { days: {}, newByDay: {} }, settings: {} });
const OLD = () => mkDoc({ 'a-1': rec(2, NOW), 'a-2': rec(2, NOW), 'c-1': rec(1, NOW) });

function mockLocal(init) {
  const m = new Map(Object.entries(init || {}));
  const l = { map: m, writes: 0, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { l.writes++; m.set(k, v); } };
  return l;
}
function counting() {
  const d = { calls: [], call(n, a) { d.calls.push(n); return dojo.call(n, a); } };
  return d;
}
function mk(ls, items, extra) {
  const spy = counting();
  const store = DojoStorage.createStore(Object.assign({
    courseId: 'demo', dojo: spy, now: () => NOW, localStorage: ls,
    migrate: DojoMigrate.create({ dojo: spy, items }), flushDelayMs: 0
  }, extra || {}));
  return { store, spy };
}
const migrateCalls = (spy) => spy.calls.filter((c) => c === 'migrateProgress').length;

test('load folds retired records into successors and keeps retired', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const { store } = mk(ls, ITEMS);
  await store.load();
  assert.ok(store.doc.items['b-1']);
  assert.deepStrictEqual(store.doc.items['a-1'], OLD().items['a-1']);
  assert.deepStrictEqual(store.doc.items['a-2'], OLD().items['a-2']);
  assert.deepStrictEqual(JSON.parse(ls.map.get(KEY)).items, store.doc.items);
});

test('reload of a migrated doc does not write the progress key', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  await mk(ls, ITEMS).store.load();
  const before = ls.writes;
  const second = mk(ls, ITEMS);
  await second.store.load();
  assert.strictEqual(ls.writes, before, 'no second write');
});

test('course without supersedes never calls migrateProgress', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const { store, spy } = mk(ls, [{ id: 'a-1' }, { id: 'c-1' }]);
  await store.load();
  store.update((d) => { d.items['c-1'] = rec(3, NOW); });
  assert.strictEqual(migrateCalls(spy), 0);
  assert.strictEqual(ls.writes, 1);
});

test('retired item without any supersedes never calls migrateProgress', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const { store, spy } = mk(ls, [{ id: 'a-1', status: 'retired' }, { id: 'c-1' }]);
  await store.load();
  store.update((d) => { d.items['c-1'] = rec(3, NOW); });
  assert.strictEqual(migrateCalls(spy), 0);
});

test('refused links: doc identical, one warn, saving still works', async () => {
  const bad = [{ id: 'a-1' }, { id: 'b-1', supersedes: ['a-1'] }];
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const warns = [];
  const orig = console.warn;
  console.warn = (m) => warns.push(m);
  try {
    const { store } = mk(ls, bad);
    await store.load();
    assert.deepStrictEqual(store.doc.items, OLD().items);
    assert.strictEqual(ls.writes, 0);
    store.update((d) => { d.items['c-1'] = rec(3, NOW); });
    store.update((d) => { d.items['c-1'] = rec(4, NOW); });
  } finally { console.warn = orig; }
  assert.strictEqual(warns.length, 1);
  assert.strictEqual(JSON.parse(ls.map.get(KEY)).items['c-1'].s, 4);
});

test('remote snapshot with a newer predecessor record folds and sets dirty', async () => {
  const sets = [];
  let listener = null;
  const ref = {
    get: async () => ({ exists: false, data: () => null }),
    set: async (b) => { sets.push(b); },
    onSnapshot: (cb) => { listener = cb; return () => {}; }
  };
  const claude = { use: async (n) => (n === 'db' ? { doc: () => ref } : { id: async () => 'u1' }) };
  const ls = mockLocal({ [KEY]: JSON.stringify(mkDoc({ 'c-1': rec(1, NOW) })) });
  const { store } = mk(ls, ITEMS, { claude });
  await store.load();
  assert.strictEqual(store.doc.items['b-1'], undefined);
  const remote = mkDoc({ 'a-1': rec(2, NOW + 10), 'c-1': rec(1, NOW) }, 9);
  listener({ exists: true, data: () => remote, metadata: {} });
  assert.ok(store.doc.items['b-1']);
  assert.ok(store.doc.items['a-1']);
  await store.flush();
  assert.ok(sets.length >= 1 && sets[sets.length - 1].items['b-1'], 'folded doc flushed');
});

test('load keeps local data in memory when committing the fold throws', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const { store, spy } = mk(ls, ITEMS);
  const real = spy.call;
  let first = true;
  spy.call = (n, a) => {
    if (n === 'merge' && first) { first = false; throw new Error('boom'); }
    return real(n, a);
  };
  await store.load();
  assert.deepStrictEqual(store.doc.items, OLD().items);
});
