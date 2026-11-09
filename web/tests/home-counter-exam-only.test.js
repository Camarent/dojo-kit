'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const DAY = 86400000;
const TODAY = '2025-10-09';

function gap(id, unit) {
  return { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id], explanation: 'e' };
}

// Group unit "ga" (2 items) and ungrouped examOnly unit "ex" (3 items).
function items() {
  return [gap('ga-1', 'ga'), gap('ga-2', 'ga'), gap('ex-1', 'ex'), gap('ex-2', 'ex'), gap('ex-3', 'ex')];
}

let dojoPromise;
function getDojo() {
  if (!dojoPromise) dojoPromise = DojoWasm.load(require('node:fs').readFileSync(checkWasmFresh()));
  return dojoPromise;
}

// All items start due; `futureGroup` moves the group unit's items to the future (decoy: group has 0 due).
async function setup(futureGroup) {
  const its = items();
  const content = {
    v: 1,
    version: 't',
    lock: its.map((i) => i.id),
    items: its,
    course: {
      id: 'c',
      title: 'C',
      units: [{ id: 'ga' }, { id: 'ex', examOnly: true }],
      groups: [{ id: 'g', title: 'G', units: ['ga'] }]
    }
  };
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  its.forEach((i) => { doc.items[i.id] = { s: 1, due: NOW - 1000, ok: 1, bad: 0, last: NOW - DAY }; });
  if (futureGroup) its.forEach((i) => { if (i.unit === 'ga') doc.items[i.id].due = NOW + 7 * DAY; });
  const store = { doc, update(fn) { fn(doc); doc.t = NOW; }, noteAnswer() {} };
  const engine = DojoSession.createEngine({
    dojo: await getDojo(), store, content, now: () => NOW, today: () => TODAY, random: () => 0.5
  });
  return { engine };
}

test('top due counts the shared queue only: group unit 2 due, examOnly unit 3 due -> 2', async () => {
  const t = await setup(false);
  assert.strictEqual(t.engine.counts().summary.due, 2);
});

test('decoy: group unit 0 due -> queue falls back to examOnly items -> top due 3', async () => {
  const t = await setup(true);
  assert.strictEqual(t.engine.counts().summary.due, 3);
});
