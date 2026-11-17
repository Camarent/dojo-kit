'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const TODAY = '2025-10-09';

let dojoPromise;
function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

// Synthetic typed audio item: a numeric question with a stimulus.
function audioItem(id) {
  return { id, type: 'numeric', unit: 'u1', prompt: 'How many do you hear? Type the number', answer: 3, stimulus: 's-' + id, entity: 'r-u1' };
}

async function startDaily(courseOverrides) {
  const dojo = await getDojo();
  const content = {
    v: 1, version: 'test', lock: ['a1'], items: [audioItem('a1')],
    course: { id: 'test', title: 'Test', units: [{ id: 'u1', title: 'Unit 1' }], ...courseOverrides }
  };
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {}
  };
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  return engine.start('daily');
}

test('typed audio item offers dontKnow when course.dontKnow is true', async () => {
  const s = await startDaily({ dontKnow: true });
  assert.strictEqual(s.current().item.type, 'numeric');
  assert.strictEqual(s.canDontKnow(), true);
});

test('dontKnow on typed audio item records a miss', async () => {
  const s = await startDaily({ dontKnow: true });
  const r = s.dontKnow();
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.given, '-');
});

test('typed audio item hides dontKnow when course.dontKnow is absent', async () => {
  const s = await startDaily({});
  assert.strictEqual(s.canDontKnow(), false);
  assert.deepStrictEqual(s.dontKnow(), { error: 'no_dont_know' });
});
