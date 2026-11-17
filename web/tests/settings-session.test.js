'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { load, DojoError } = require('../dojo-wasm.js');
const { checkWasmFresh } = require('./loader.js');
const { sessionOverrides } = require('../session/queues.js');

// Eight units with one item each: the default perUnitMax of 1 still leaves eight candidates.
const units = Array.from({ length: 8 }, (_, i) => ({ id: 'u' + i }));
const items = units.map((u) => ({ id: 'i' + u.id, unit: u.id }));
const course = { id: 'synthetic', units };

async function loadDojo() {
  return load(fs.readFileSync(checkWasmFresh()).toString('base64'));
}

function build(dojo, overrides, extra) {
  return dojo.call('buildSession', Object.assign({
    units: course, items, records: {}, now: 100, daysLeft: 4, courseId: 'synthetic', seed: '7', overrides,
  }, extra || {}));
}

test('an old save without session:* keys gives no overrides and builds with the defaults', async () => {
  assert.deepStrictEqual(sessionOverrides(undefined), {});
  assert.deepStrictEqual(sessionOverrides({ newPerDay: 5, theme: 'dark', 'unit:u1:newPerDay': 3 }), {});
  const dojo = await loadDojo();
  const out = build(dojo, sessionOverrides({ newPerDay: 5 }));
  assert.ok(Array.isArray(out.queue), 'queue is an array');
  assert.deepStrictEqual(out.queue, build(dojo, {}).queue, 'same as the core defaults');
});

test('manual mode with a cap of 5 gives a session of 5 questions', async () => {
  const dojo = await loadDojo();
  const overrides = sessionOverrides({ 'session:sessionMode': 'manual', 'session:sessionCap': 5 });
  assert.deepStrictEqual(overrides, { 'session:sessionMode': 'manual', 'session:sessionCap': 5 });
  const out = build(dojo, overrides);
  assert.strictEqual(out.queue.length, 5);
  assert.strictEqual(out.plan.capacity, 5);
});

test('auto mode sizes the session from dailyMinutes', async () => {
  const dojo = await loadDojo();
  const short = build(dojo, sessionOverrides({ 'session:sessionMode': 'auto', 'session:dailyMinutes': 5 }));
  const long = build(dojo, sessionOverrides({ 'session:sessionMode': 'auto', 'session:dailyMinutes': 60 }));
  assert.ok(short.plan.capacity < long.plan.capacity, 'more minutes, bigger capacity');
});

test('invalid stored values are dropped and the default session is built', async () => {
  const stored = {
    'session:sessionCap': -1,
    'session:sessionMode': 'sometimes',
    'session:knownDistinct': 0,
    'session:sessionMix': ['bogus'],
    'session:dailyMinutes': 2.5,
    'session:perUnitMax': '3',
    'session:unknownKey': 3,
    'session:constructor': 1,
    'session:reviewDays': 4,
  };
  assert.deepStrictEqual(sessionOverrides(stored), { 'session:reviewDays': 4 });
  const dojo = await loadDojo();
  const out = build(dojo, sessionOverrides(stored));
  assert.deepStrictEqual(out.queue, build(dojo, { 'session:reviewDays': 4 }).queue);
  assert.throws(() => build(dojo, { 'session:sessionCap': -1 }), DojoError, 'core rejects the raw bad value');
});
