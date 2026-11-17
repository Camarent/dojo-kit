'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { load } = require('../../web/dojo-wasm.js');
const { checkWasmFresh } = require('../../web/tests/loader.js');
const { createSim } = require('./index.js');

const DAY_MS = 86400000;

// Synthetic 2-unit course; no workspace reads.
const course = { id: 'synthetic', units: [{ id: 'u1' }, { id: 'u2' }] };
const items = [
  { id: 'a1', unit: 'u1', type: 'choice', options: ['x', 'y', 'z'], answer: 0 },
  { id: 'a2', unit: 'u1', type: 'gap', answers: ['alpha'] },
  { id: 'b1', unit: 'u2', type: 'choice', options: ['x', 'y', 'z'], answer: 1 },
  { id: 'b2', unit: 'u2', type: 'choice', options: ['x', 'y', 'z'], answer: 2 },
];

async function loadWasm() {
  return load(fs.readFileSync(checkWasmFresh()).toString('base64'));
}

async function newSim() {
  const wasm = await loadWasm();
  return createSim({ course, items, now: 100, seed: '7', wasm });
}

test('one session builds a queue and a plan from the core', async () => {
  const sim = await newSim();
  const built = sim.buildSession({ daysLeft: 4 });
  assert.ok(Array.isArray(built.queue) && built.queue.length > 0, 'queue has items');
  assert.ok(built.queue.includes('b1'), 'unit u2 is queued');
  assert.strictEqual(built.plan.total, built.queue.length);
});

test('answers move the finish counters; a wrong typed answer is not counted right', async () => {
  const sim = await newSim();
  sim.buildSession({ daysLeft: 4 });
  const first = sim.answer('a1', true);
  assert.strictEqual(first.correct, true);
  assert.strictEqual(first.finish.answered, 1);
  assert.strictEqual(first.finish.right, 1);
  const second = sim.answer('a2', 'nope');
  assert.strictEqual(second.correct, false);
  assert.strictEqual(second.finish.answered, 2);
  assert.strictEqual(second.finish.right, 1);
  assert.ok(sim.records().a1, 'record written for the answered item');
});

test('a typed correct answer is graded right by the core', async () => {
  const sim = await newSim();
  sim.buildSession({ daysLeft: 4 });
  const res = sim.answer('a2', 'alpha');
  assert.strictEqual(res.correct, true);
  assert.strictEqual(res.finish.right, 1);
});

test('a wrong answer re-queues the item once', async () => {
  const sim = await newSim();
  const built = sim.buildSession({ daysLeft: 4 });
  const first = built.queue.find((id) => id === 'a1' || id === 'a2');
  const res = sim.answer(first, false);
  assert.strictEqual(res.correct, false);
  assert.ok(res.requeued !== null, 'a unit mate is re-queued');
  assert.strictEqual(res.finish.right, 0);
});

test('a 3-day run with 100% accuracy introduces all items', async () => {
  const sim = await newSim();
  const days = [];
  for (let d = 0; d < 3; d++) {
    days.push(sim.runSession({ accuracy: 1 }));
    sim.clock.advance(DAY_MS);
  }
  assert.strictEqual(days.length, 3);
  for (const it of items) assert.ok(sim.records()[it.id], `${it.id} introduced`);
});
