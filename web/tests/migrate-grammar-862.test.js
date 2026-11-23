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

// grammar-862 shape (docs/decisions.md): the successor keeps its learner m0/s0 through a load; a retired duplicate with a later `last` is folded in.
const SUCC = { s: 4, due: 1793000000000, ok: 25, bad: 4, last: 1793000000000, s0: 5, m0: { ok: 5, bad: 1, due: 1793000000000, last: 1793000000000 } };
const DUP = { s: 2, due: 1793800000000, ok: 0, bad: 10, last: 1793800000000, s0: 0, m0: { bad: 1 } };
const ITEMS = [
  { id: 'grammar-862', supersedes: ['dup-862'] },
  { id: 'dup-862', status: 'retired' }
];
const DOC = { v: 1, t: 5, course: 'demo', resetAt: 0, migrated: { 'n5-units-2': NOW - 1 }, items: { 'grammar-862': SUCC, 'dup-862': DUP }, stats: { days: {}, newByDay: {} }, settings: {} };

function mockLocal(init) {
  const m = new Map(Object.entries(init || {}));
  return { map: m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

test('load keeps grammar-862 m0 and s0 when the unit migration is already marked', async () => {
  const ls = mockLocal({ [KEY]: JSON.stringify(DOC) });
  const store = DojoStorage.createStore({
    courseId: 'demo', dojo, now: () => NOW, localStorage: ls,
    migrate: DojoMigrate.create({ dojo, items: ITEMS }), flushDelayMs: 0
  });
  await store.load();
  const g = store.doc.items['grammar-862'];
  assert.strictEqual(g.s0, 5, 's0 lost');
  assert.deepStrictEqual(g.m0, SUCC.m0, 'm0 lost');
});
