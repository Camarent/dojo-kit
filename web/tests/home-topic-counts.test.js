'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const DUE = NOW - 1000;
const TOPICS = { aspects: [{ id: 'meaning', tags: ['vocab'] }] };
let dojoP;

function gap(unit, n, entity) { return { id: unit + '-' + n, unit, type: 'gap', prompt: unit + n, answers: ['x'], entity }; }

async function setup(units, its, extra) {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const course = Object.assign({ id: 'c', title: 'C', units }, extra || {});
  const content = { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course };
  const engine = DojoSession.createEngine({ dojo: await dojoP, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
  return { engine, doc };
}

function due(doc, id) { doc.items[id] = { s: 1, due: DUE, ok: 1, bad: 0, last: DUE - 1000 }; }

// Unit a: topic T1 = a-1, a-2; topic T2 = a-3. All three are due.
async function twoTopics(extra) {
  const t = await setup([{ id: 'a', title: 'A' }], [gap('a', 1, 'T1'), gap('a', 2, 'T1'), gap('a', 3, 'T2')], extra);
  ['a-1', 'a-2', 'a-3'].forEach((id) => due(t.doc, id));
  return t;
}

test('home due counts topics: 2 topics with 3 due items -> due 2', async () => {
  const t = await twoTopics({ topics: TOPICS });
  assert.strictEqual(t.engine.counts().due, 2);
});

test('home due ignores the session cap: cap 1 -> due 2, queue 1', async () => {
  const t = await twoTopics({ topics: Object.assign({ sessionCap: 1 }, TOPICS) });
  const c = t.engine.counts();
  assert.strictEqual(c.due, 2, 'due ' + c.due);
  assert.strictEqual(c.queue, 1, 'queue ' + c.queue);
});

test('home due: a linked due exam item of a due topic adds 0', async () => {
  const t = await setup([{ id: 'a', title: 'A' }, { id: 'e', title: 'E', examOnly: true }],
    [gap('a', 1, 'T1'), gap('a', 2, 'T1'), gap('a', 3, 'T2'), gap('e', 1, 'T1')], { topics: TOPICS });
  ['a-1', 'a-2', 'a-3', 'e-1'].forEach((id) => due(t.doc, id));
  assert.strictEqual(t.engine.counts().due, 2);
});

test('home due decoy: the same items without topics config count every due item -> due 3', async () => {
  const t = await twoTopics();
  assert.strictEqual(t.engine.counts().due, 3);
});
