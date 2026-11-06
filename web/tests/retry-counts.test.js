'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const TODAY = '2025-10-09';

let dojoP;
function getDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

function gap(id, answers, retry) {
  const item = { id, type: 'gap', unit: 'u', prompt: 'P' + id, answers };
  if (retry) item.retry = retry;
  return item;
}

async function setup(items) {
  const content = {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] }
  };
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  return { engine, doc };
}

test('gap retry variation is not wrong and not counted; the final answer counts once', async () => {
  const t = await setup([gap('g1', ['x', 'xy'], ['y']), gap('g2', ['z'])]);
  const s = t.engine.start('daily');
  const before = t.engine.counts();

  assert.strictEqual(s.answer({ text: 'y' }).verdict, 'retry');
  assert.strictEqual(s.answer({ text: 'y' }).verdict, 'retry');
  assert.deepStrictEqual(t.engine.counts(), before);
  assert.deepStrictEqual(t.doc.stats, { days: {}, newByDay: {} });
  assert.strictEqual(s.retryCount(), 0);

  const ok = s.answer({ text: 'x' });
  assert.strictEqual(ok.correct, true);
  assert.notStrictEqual(ok.verdict, 'retry');

  const after = t.engine.counts();
  assert.strictEqual(after.fresh, before.fresh - 1);
  assert.strictEqual(after.learning, before.learning + 1);
  assert.strictEqual(t.doc.stats.days[TODAY], 1);
  assert.strictEqual(t.doc.stats.newByDay[TODAY], 1);
});
