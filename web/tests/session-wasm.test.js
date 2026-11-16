'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { load, DojoError } = require('../dojo-wasm.js');
const { checkWasmFresh } = require('./loader.js');

const course = { id: 'synthetic', units: [{ id: 'u1' }, { id: 'u2' }] };
const items = [
  { id: 'a1', unit: 'u1' },
  { id: 'a2', unit: 'u1' },
  { id: 'b1', unit: 'u2' },
  { id: 'c1', unit: 'u2', status: 'retired' },
];

async function loadDojo() {
  return load(fs.readFileSync(checkWasmFresh()).toString('base64'));
}

test('buildSession through the wasm bundle returns a queue and a plan', async () => {
  const dojo = await loadDojo();
  const out = dojo.call('buildSession', {
    units: course, items, records: {}, now: 100, daysLeft: 4, courseId: 'synthetic', seed: '7',
  });
  assert.ok(Array.isArray(out.queue), 'queue is an array');
  assert.ok(out.queue.includes('b1'), 'unit u2 is queued');
  assert.ok(!out.queue.includes('c1'), 'retired item is not queued');
  assert.strictEqual(out.plan.total, out.queue.length);
  assert.strictEqual(typeof out.plan.daysLeft, 'number');
});

test('sessionRequeue and sessionFinish through the wasm bundle', async () => {
  const dojo = await loadDojo();
  const picked = dojo.call('sessionRequeue', {
    unit: 'u1', pool: ['a1', 'a2'], answered: 'a1', alreadyRepeated: 0, repeatMax: 1, seed: '42',
  });
  assert.strictEqual(picked, 'a2');
  const done = dojo.call('sessionFinish', {
    answers: [{ id: 'a1', right: true }, { id: 'b1', right: false }],
    units: [['a1', 'a2'], ['b1']], records: {}, now: 100, planned: 2, repeatsAdded: 0,
  });
  assert.strictEqual(done.answered, 2);
  assert.strictEqual(done.right, 1);
  assert.strictEqual(done.denominator, 2);
});

test('buildSession bad args reject with a DojoError code', async () => {
  const dojo = await loadDojo();
  let err;
  try {
    dojo.call('buildSession', { items, records: {}, now: 100, daysLeft: 4 });
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof DojoError);
  assert.strictEqual(err.code, 'bad_args');
});
