'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { load } = require('../web/dojo-wasm.js');
const { checkWasmFresh } = require('../web/tests/loader.js');
const { createSim } = require('../tools/sim/index.js');

const DAY_MS = 86400000;

// Synthetic 3-unit course of 30 choice items; no workspace reads.
// Enough items that two different session seeds almost surely give different queues.
const units = ['u1', 'u2', 'u3'];
const course = { id: 'synthetic-seed', units: units.map((id) => ({ id })) };
const items = [];
for (let i = 0; i < 30; i++) {
  items.push({ id: `q${i}`, unit: units[i % 3], type: 'choice', options: ['x', 'y', 'z'], answer: i % 3 });
}

async function newSim(seed, opts = {}, now = 100) {
  const wasm = await load(fs.readFileSync(checkWasmFresh()).toString('base64'));
  return createSim({ course, items, now, seed, wasm, ...opts });
}

test('daySeed true: two sim days give different queues for one base seed', async () => {
  const sim = await newSim('7', { daySeed: true });
  const day1 = sim.buildSession({ daysLeft: 4 }).queue;
  sim.clock.advance(DAY_MS);
  const day2 = sim.buildSession({ daysLeft: 4 }).queue;
  assert.ok(day1.length > 0 && day2.length > 0, 'both days build a queue');
  assert.notDeepStrictEqual(day2, day1, 'the second sim day reshuffles the queue');
});

test('daySeed true: the same base seed and day give the same queue twice', async () => {
  const first = (await newSim('7', { daySeed: true })).buildSession({ daysLeft: 4 }).queue;
  const again = (await newSim('7', { daySeed: true })).buildSession({ daysLeft: 4 }).queue;
  assert.ok(first.length > 0, 'a queue is built');
  assert.deepStrictEqual(again, first);
});

test('default (daySeed off): two sim days keep the constant seed, so the same queue', async () => {
  const sim = await newSim('7');
  const day1 = sim.buildSession({ daysLeft: 4 }).queue;
  sim.clock.advance(DAY_MS);
  const day2 = sim.buildSession({ daysLeft: 4 }).queue;
  assert.ok(day1.length > 0, 'a queue is built');
  assert.deepStrictEqual(day2, day1, 'without daySeed the base seed is passed unchanged');
});
