'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh, TARGET_WASM } = require('./loader.js');

const COURSE = 'demo';
const KEY = 'dojo.demo.progress.v1';
let dojo;
let wasmAvailable = false;

test.before(async () => {
  try {
    checkWasmFresh();
    dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
    wasmAvailable = true;
  } catch (e) {
    wasmAvailable = false;
  }
});

function mockLocal(init, failSet) {
  const m = new Map(Object.entries(init || {}));
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: failSet ? (k, v) => { throw new Error('setItem failed'); } : ((k, v) => { m.set(k, v); })
  };
}

test('storage warn: failing setItem triggers onWarn with label and error', async (t) => {
  if (!wasmAvailable) return t.skip('wasm build missing');
  let warnCalled = false;
  let warnCount = 0;
  let warnWhere = null;
  let warnErr = null;
  const ls = mockLocal({}, true);
  
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: ls,
    onWarn: (where, err) => { warnCalled = true; warnCount++; warnWhere = where; warnErr = err; },
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    flushDelayMs: 0
  });

  store.update(() => {});

  assert.ok(warnCalled, 'onWarn should have been called');
  assert.strictEqual(warnCount, 1, 'onWarn once');
  assert.ok(typeof warnWhere === 'string' && warnWhere.length > 0, 'where should be a non-empty string');
  assert.ok(warnErr instanceof Error, 'err should be an Error instance');
});

test('storage warn: with no onWarn, setItem failure produces no console output', async (t) => {
  if (!wasmAvailable) return t.skip('wasm build missing');
  let consoleWarnCalled = false;
  const originalWarn = console.warn;
  console.warn = function() { consoleWarnCalled = true; };

  try {
    const ls = mockLocal({}, true);
    
    const store = DojoStorage.createStore({
      courseId: COURSE,
      dojo: dojo,
      now: () => 1000000,
      localStorage: ls,
      random: () => 0,
      setTimeoutFn: () => 0,
      clearTimeoutFn: () => {},
      flushDelayMs: 0
    });

    store.update(() => {});

    assert.ok(!consoleWarnCalled, 'console.warn should not have been called');
  } finally {
    console.warn = originalWarn;
  }
});

test('storage warn: app continues after setItem failure', async (t) => {
  if (!wasmAvailable) return t.skip('wasm build missing');
  let warnCalled = false;
  const ls = mockLocal({}, true);
  
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: ls,
    onWarn: (where, err) => { warnCalled = true; },
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    flushDelayMs: 0
  });

  store.update(() => {});
  
  assert.ok(warnCalled, 'onWarn should have been called');
  
  store.update(() => {});
  
  assert.ok(store.doc !== null, 'store.doc should still be valid');
  assert.ok(store.doc.course === COURSE, 'store.doc.course should be set');
});

test('storage warn: throwing onWarn does not propagate out of update', async (t) => {
  if (!wasmAvailable) return t.skip('wasm build missing');
  const store = DojoStorage.createStore({
    courseId: COURSE,
    dojo: dojo,
    now: () => 1000000,
    localStorage: mockLocal({}, true),
    onWarn: () => { throw new Error('hook'); },
    random: () => 0,
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => {},
    flushDelayMs: 0
  });
  assert.doesNotThrow(() => store.update(() => {}));
  assert.strictEqual(store.status, 'error');
});
