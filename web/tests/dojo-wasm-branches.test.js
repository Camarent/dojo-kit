'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { load, DojoError } = require('../dojo-wasm.js');
const { checkWasmFresh } = require('./loader.js');

test('load accepts a base64 string; failing call throws DojoError', async () => {
  const b64 = fs.readFileSync(checkWasmFresh()).toString('base64');
  const dojo = await load(b64);
  let err;
  try { dojo.call('no-such-function', {}); } catch (e) { err = e; }
  assert.ok(err instanceof DojoError);
  assert.strictEqual(typeof err.code, 'string');
  assert.ok(err instanceof Error);
});
