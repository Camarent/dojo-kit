'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const DUE = NOW - 1000;
let dojoP;

const TOPICS = { aspects: [{ id: 'meaning', tags: ['vocab'] }] };

function gap(unit, n, entity) { return { id: unit + '-' + n, unit, type: 'gap', prompt: unit + n, answers: ['x'], entity }; }

async function setup(units, its, extra) {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const course = Object.assign({ id: 'c', title: 'C', units }, extra || {});
  const content = { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course };
  return { engine: DojoSession.createEngine({ dojo: await dojoP, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 }), doc };
}

function ids(s) {
  const out = [];
  for (let c = s.current(); c; c = s.next()) out.push(c.item.id);
  return out;
}

function due(doc, id) { doc.items[id] = { s: 1, due: DUE, ok: 1, bad: 0, last: DUE - 1000 }; }

// Unit a: three topics T1 (a-1..a-3), T2 (a-4..a-6), T3 (a-7..a-9); every item due.
function threeTopics(extra) {
  const its = [];
  for (let n = 1; n <= 9; n++) its.push(gap('a', n, n <= 3 ? 'T1' : n <= 6 ? 'T2' : 'T3'));
  return setup([{ id: 'a', title: 'A' }], its, extra);
}

function dueAll(doc, prefix, n) { for (let i = 1; i <= n; i++) due(doc, prefix + '-' + i); }

test('1: three due items of one topic show one item in the daily queue', async () => {
  const t = await setup([{ id: 'a', title: 'A' }], [1, 2, 3].map((n) => gap('a', n, 'T')), { topics: TOPICS });
  dueAll(t.doc, 'a', 3);
  assert.deepStrictEqual(ids(t.engine.start('daily')).length, 1);
});

test('1 decoy: the same items without topics config are all shown', async () => {
  const t = await setup([{ id: 'a', title: 'A' }], [1, 2, 3].map((n) => gap('a', n, 'T')));
  dueAll(t.doc, 'a', 3);
  assert.deepStrictEqual(ids(t.engine.start('daily')).sort(), ['a-1', 'a-2', 'a-3']);
});

test('2: a linked due exam item joins the review order, an unlinked one does not while shared items exist', async () => {
  const its = [gap('a', 1, 'T1'), gap('e', 1, 'T1'), gap('e', 2, 'T2')];
  const t = await setup([{ id: 'a', title: 'A' }, { id: 'e', title: 'E', examOnly: true }], its, { topics: TOPICS });
  // a-1 is not due: only the exam items are candidates; e-1 shares topic T1 with a-1, e-2 does not.
  t.doc.items['a-1'] = { s: 1, due: NOW + 1e9, ok: 1, bad: 0, last: NOW };
  due(t.doc, 'e-1');
  due(t.doc, 'e-2');
  assert.deepStrictEqual(ids(t.engine.start('daily')), ['e-1']);
});

test('2 decoy: without topics config no exam item is linked, so the examOnly fallback gives both', async () => {
  const its = [gap('a', 1, 'T1'), gap('e', 1, 'T1'), gap('e', 2, 'T2')];
  const t = await setup([{ id: 'a', title: 'A' }, { id: 'e', title: 'E', examOnly: true }], its);
  t.doc.items['a-1'] = { s: 1, due: NOW + 1e9, ok: 1, bad: 0, last: NOW };
  due(t.doc, 'e-1');
  due(t.doc, 'e-2');
  assert.deepStrictEqual(ids(t.engine.start('daily')).sort(), ['e-1', 'e-2']);
});

test('3: cap from settings: 1 gives one topic, 0 gives unlimited, no setting gives the course sessionCap', async () => {
  const withCap = await threeTopics({ topics: Object.assign({ sessionCap: 2 }, TOPICS) });
  dueAll(withCap.doc, 'a', 9);
  assert.strictEqual(ids(withCap.engine.start('daily')).length, 2);

  withCap.doc.settings['topics:sessionCap'] = 1;
  assert.strictEqual(ids(withCap.engine.start('daily')).length, 1);

  withCap.doc.settings['topics:sessionCap'] = 0;
  assert.strictEqual(ids(withCap.engine.start('daily')).length, 3);

  const noSetting = await threeTopics({ topics: Object.assign({ sessionCap: 1 }, TOPICS) });
  dueAll(noSetting.doc, 'a', 9);
  assert.strictEqual(ids(noSetting.engine.start('daily')).length, 1);
});

test('4 decoy: course without topics keeps the queue of today', async () => {
  const t = await setup([{ id: 'a', title: 'A' }], [1, 2, 3].map((n) => gap('a', n)), { topics: undefined });
  dueAll(t.doc, 'a', 3);
  assert.deepStrictEqual(ids(t.engine.start('daily')).sort(), ['a-1', 'a-2', 'a-3']);
});
