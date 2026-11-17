'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

// Synthetic course: u1 uses random new order, u2 file order. Pins the queue order of the main builders.
const NOW = 1760000000000;
const TODAY = '2025-10-09';
const ITEMS = ['p1', 'p2', 'p3', 'p4', 'f1', 'f2', 'f3', 'f4'].map((id) => ({
  id, unit: id[0] === 'p' ? 'u1' : 'u2', entity: id, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id],
}));
const COURSE = { id: 'qo', units: [{ id: 'u1', newOrder: 'random' }, { id: 'u2' }] };

let dojoPromise;
function getDojo() {
  if (!dojoPromise) dojoPromise = DojoWasm.load(require('node:fs').readFileSync(checkWasmFresh()));
  return dojoPromise;
}

async function orderOf(mode) {
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const content = { v: 1, course: COURSE, items: ITEMS, version: 't', lock: ITEMS.map((i) => i.id) };
  const engine = DojoSession.createEngine({ dojo: await getDojo(), store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  const session = engine.start(mode);
  assert.ok(session && !session.error, 'session starts');
  const ids = [];
  while (ids.length < session.total) {
    const cur = session.current();
    if (!cur || !cur.item) break;
    ids.push(cur.item.id);
    session.answer({ text: cur.item.answers[0] });
    session.next();
  }
  return ids;
}

test('daily queue order is pinned', async () => {
  // u1 is random-order: its slots are shuffled with the day seed; u2 keeps file order.
  assert.deepStrictEqual(await orderOf('daily'), ['p2', 'p1', 'p4', 'p3', 'f1', 'f2', 'f3', 'f4']);
});

test('practice queue order is pinned', async () => {
  assert.deepStrictEqual(await orderOf('practice'), ['p1', 'p2', 'p3', 'p4', 'f1', 'f2', 'f3', 'f4']);
});
