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
const H = 3600000;
const D = 24 * H;
let dojo;
test.before(async () => { dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh())); });

const LADDER_FROM = { u1: [0, 2 * H, 4 * H, 8 * H, D, 2 * D, 3 * D, 4 * D, 7 * D, 14 * D, 30 * D] };
const COURSE = {
  id: 'demo', units: [{ id: 'u1', srs: { ladder: [0, D, 3 * D, 7 * D, 14 * D, 30 * D] } }, { id: 'u2' }],
  srs: { migrate: { id: 'm1', ladderFrom: LADDER_FROM, unify: false } }
};
const PLAIN_COURSE = { id: 'demo', units: [{ id: 'u1' }, { id: 'u2' }] };
const ITEMS = [
  { id: 'a-1', unit: 'u1' },
  { id: 'a-2', unit: 'u1' },
  { id: 'b-1', unit: 'u2' }
];
const MEMBERS = ITEMS.map((it) => ({ id: it.id, unit: it.unit }));
const rec = (s, last) => ({ s, due: last + 1000, ok: 1, bad: 0, last });
const mkDoc = (items) => ({ v: 1, t: 5, course: 'demo', resetAt: 0, items, stats: { days: {}, newByDay: {} }, settings: {} });
const OLD = () => mkDoc({ 'a-1': rec(9, NOW), 'a-2': rec(9, NOW), 'b-1': rec(1, NOW) });

function mockLocal(init) {
  const m = new Map(Object.entries(init || {}));
  const l = { map: m, writes: 0, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { l.writes++; m.set(k, v); } };
  return l;
}
async function quietLoad(store) {
  const orig = console.warn;
  console.warn = () => {};
  try { await store.load(); } finally { console.warn = orig; }
}
function mk(ls, course, call) {
  const d = { call };
  return DojoStorage.createStore({
    courseId: 'demo', dojo: d, now: () => NOW, localStorage: ls,
    migrate: DojoMigrate.create({ dojo: d, items: ITEMS, course, now: () => NOW }),
    flushDelayMs: 0, setTimeoutFn: () => 0, clearTimeoutFn: () => {}
  });
}
const real = (n, a) => dojo.call(n, a);

test('load migrates once: marker written, stage remapped, reload is a no-op', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const first = mk(ls, COURSE, real);
  await first.load();
  assert.strictEqual(first.doc.migrated.m1, NOW);
  assert.notStrictEqual(first.doc.items['a-1'].s, 9);
  const writes = ls.writes;
  assert.ok(writes >= 1);
  const second = mk(ls, COURSE, real);
  await second.load();
  assert.strictEqual(ls.writes, writes, 'reload writes nothing');
  assert.deepStrictEqual(second.doc.items, first.doc.items);
});

test('course without srs.migrate leaves docs untouched: no marker', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const store = mk(ls, PLAIN_COURSE, real);
  await store.load();
  assert.strictEqual(store.doc.migrated, undefined);
  assert.strictEqual(store.doc.items['a-1'].s, 9);
  assert.strictEqual(ls.writes, 0);
});

test('import of an unmigrated export into a migrated save keeps the migrated stages', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const store = mk(ls, COURSE, real);
  await store.load();
  const incoming = mkDoc({ 'a-1': rec(9, NOW), 'b-1': rec(1, NOW) });
  const expected = real('migrateDoc', { doc: incoming, course: COURSE, items: [], members: MEMBERS, now: NOW }).doc.items['a-1'].s;
  assert.notStrictEqual(expected, 9);
  const res = store.importText(JSON.stringify(incoming));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(store.doc.items['a-1'].s, expected);
  assert.strictEqual(store.doc.migrated.m1, NOW);
});

test('a failed migrateDoc call keeps the unmigrated doc and does not block load', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const store = mk(ls, COURSE, (n, a) => {
    if (n === 'migrateDoc') throw new Error('boom');
    return real(n, a);
  });
  await quietLoad(store);
  assert.deepStrictEqual(store.doc.items, OLD().items);
  assert.strictEqual(store.doc.migrated, undefined);
});

test('n5-units-1 save is repaired by n5-units-2 (undo + keepLearned) and equals a fresh migration', async () => {
  const units = [{ id: 'u1', srs: { ladder: [0, D, 3 * D, 7 * D, 14 * D, 30 * D] } }, { id: 'u2' }];
  const C1 = { id: 'demo', units, srs: { migrate: { id: 'n5-units-1', ladderFrom: LADDER_FROM } } };
  const C2 = { id: 'demo', units, srs: { migrate: { id: 'n5-units-2', undo: 'n5-units-1', ladderFrom: LADDER_FROM, keepLearned: { u1: 5 } } } };
  const ls = mockLocal({ [KEY]: JSON.stringify(OLD()) });
  const first = mk(ls, C1, real);
  await first.load();
  assert.strictEqual(first.doc.migrated['n5-units-1'], NOW);
  const repaired = mk(ls, C2, real);
  await repaired.load();
  const fresh = mk(mockLocal({ [KEY]: JSON.stringify(OLD()) }), C2, real);
  await fresh.load();
  assert.deepStrictEqual(repaired.doc.items, fresh.doc.items);
  assert.deepStrictEqual(repaired.doc.migrated, { 'n5-units-2': NOW });
});
