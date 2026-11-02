'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
require('node:path');
const DojoWasm = require('../dojo-wasm.js');
require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

test.before(async () => {
    checkWasmFresh();
    await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});





() => new Promise((r) => setImmediate(r));
































// ---- data-safety regressions (dev-8b) ----

test('sortKeys keeps prototype and constructor keys as data on a null-prototype result', () => {
  const { sortKeys } = require('../storage.js');
  const input = { b: 2, constructor: { x: 1 }, prototype: { y: 2 } };
  const result = sortKeys(input);
  assert.strictEqual(Object.getPrototypeOf(result), null);
  assert.deepStrictEqual(Object.keys(result), ['b', 'constructor', 'prototype']);
  assert.strictEqual(result.b, 2);
  assert.strictEqual(({}).x, undefined);
});
