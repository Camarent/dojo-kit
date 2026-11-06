'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const DAY = 86400000;
const TODAY = '2025-10-09';

let dojoPromise;
function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

function gap(id, unit) {
  return { id, type: 'gap', unit, prompt: 'Q' + id, answers: ['ans' + id] };
}

// Shared unit u1 and examOnly unit u2; every item is a due review (not new).
async function setup() {
  const dojo = await getDojo();
  const items = [gap('a-1', 'u1'), gap('a-2', 'u1'), gap('a-3', 'u1'), gap('x-1', 'u2'), gap('x-2', 'u2'), gap('x-3', 'u2')];
  const course = {
    id: 'test', title: 'Test',
    units: [{ id: 'u1', title: 'Shared' }, { id: 'u2', title: 'Exam only', examOnly: true }]
  };
  const content = { v: 1, version: 'test', lock: items.map((i) => i.id), items, course };
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  items.forEach((i) => { doc.items[i.id] = { s: 1, due: NOW - 1000, ok: 1, bad: 0, last: NOW - DAY }; });
  const store = { doc, update(fn) { fn(doc); doc.t = NOW; }, noteAnswer() {} };
  const engine = DojoSession.createEngine({
    dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5
  });
  return { engine, doc };
}

test('home review count equals the daily session size', async () => {
  const t = await setup();
  const home = t.engine.counts().due;
  const session = t.engine.start('daily', {}).total;
  assert.strictEqual(home, session, 'home shows ' + home + ' but session has ' + session);
});

test('after shared items are done, home count still matches the next session', async () => {
  const t = await setup();
  // Answer every shared item as due-reviewed: move them to the future so they stop being due.
  ['a-1', 'a-2', 'a-3'].forEach((id) => { t.doc.items[id].due = NOW + 7 * DAY; });
  const home = t.engine.counts().due;
  const session = t.engine.start('daily', {}).total;
  assert.strictEqual(home, session, 'home shows ' + home + ' but session has ' + session);
});
