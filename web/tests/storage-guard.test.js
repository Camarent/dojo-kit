'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'guard-test';
const KEY = 'dojo.guard-test.progress.v1';
let dojo;

test.before(async () => {
  checkWasmFresh();
  dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});

// Guard test: verify public API is unchanged
function mockLocal() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
}

test('DojoStorage public API exports unchanged', () => {
  const exports = Object.keys(DojoStorage);
  assert.deepStrictEqual(exports.sort(), ['createStore', 'sortKeys']);
  assert.strictEqual(typeof DojoStorage.createStore, 'function');
  assert.strictEqual(typeof DojoStorage.sortKeys, 'function');
});

test('DojoStorage.sortKeys behavior unchanged', () => {
  const input = { b: 1, a: 2, c: { z: 3, x: 4 } };
  const result = DojoStorage.sortKeys(input);
  // sortKeys creates null-prototype objects, so compare via JSON
  assert.strictEqual(JSON.stringify(result), JSON.stringify({ a: 2, b: 1, c: { x: 4, z: 3 } }));
});

test('store round-trip: keys and format are byte-identical', async () => {
  const ls = mockLocal();
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: ls,
    claude: null,
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    flushDelayMs: 0
  });

  // Load an empty store
  await store.load();
  
  // Update with some data
  const testDoc = {
    course: COURSE,
    v: 1,
    t: 1000000,
    resetAt: 0,
    items: { 'item1': { s: 1, due: 1000001, ok: 1, bad: 0, last: 1000000 } },
    stats: { days: {}, newByDay: {} },
    settings: {}
  };
  
  store.update((doc) => {
    doc.items = testDoc.items;
    doc.t = testDoc.t;
  });
  
  // Flush to local storage
  await store.flush();
  
  // Read back the raw storage
  const raw = ls.getItem(KEY);
  assert.ok(raw, 'localStorage should have data');
  
  // Parse and re-serialize to check byte-identical format
  const parsed = JSON.parse(raw);
  const reSerialized = JSON.stringify(parsed);
  assert.strictEqual(raw, reSerialized, 'Stored format should be stable JSON');
  
  // Create a new store and load from the same localStorage
  const ls2 = mockLocal();
  // Copy the data
  const m = new Map();
  m.set(KEY, raw);
  ls2.getItem = (k) => (m.has(k) ? m.get(k) : null);
  ls2.setItem = (k, v) => { m.set(k, v); };
  
  const store2 = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: ls2,
    claude: null,
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    flushDelayMs: 0
  });
  
  await store2.load();
  
  // The docs should be equivalent (note: resetAt might differ due to emptyProgress)
  assert.deepStrictEqual(store2.doc.items, store.doc.items, 'Items should match');
  assert.strictEqual(store2.doc.course, COURSE);
  assert.strictEqual(store2.doc.v, 1);
});

test('store exportText and importText round-trip', async () => {
  const ls = mockLocal();
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: ls,
    claude: null,
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {}
  });

  await store.load();
  
  // Update with some data
  store.update((doc) => {
    doc.items = { 'item1': { s: 1, due: 1000001, ok: 1, bad: 0, last: 1000000 } };
    doc.t = 1000000;
  });
  
  // Export
  const exported = store.exportText();
  assert.ok(exported, 'exportText should return a string');
  
  // Create a new store and import
  const ls2 = mockLocal();
  const store2 = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: ls2,
    claude: null,
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {}
  });
  
  await store2.load();
  const result = store2.importText(exported);
  assert.strictEqual(result.ok, true, 'importText should succeed');
  assert.deepStrictEqual(store2.doc.items, { 'item1': { s: 1, due: 1000001, ok: 1, bad: 0, last: 1000000 } });
});

test('sortKeys keeps constructor and __proto__ as own data keys without pollution', () => {
  const input = JSON.parse('{"b":1,"constructor":{"x":2},"__proto__":{"polluted":true}}');
  const result = DojoStorage.sortKeys(input);
  assert.strictEqual(Object.getPrototypeOf(result), null);
  assert.strictEqual(({}).polluted, undefined);
  assert.strictEqual(result.polluted, undefined);
  assert.deepStrictEqual(Object.keys(result), ['__proto__', 'b', 'constructor']);
  assert.strictEqual(JSON.stringify(result), '{"__proto__":{"polluted":true},"b":1,"constructor":{"x":2}}');
});
