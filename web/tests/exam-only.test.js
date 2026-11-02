'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
let dojoP;

function gap(unit, n) { return { id: unit + '-' + n, unit, type: 'gap', prompt: unit + n, answers: ['x'] }; }
function many(unit, n) { const out = []; for (let i = 1; i <= n; i++) out.push(gap(unit, i)); return out; }

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

const UA = { id: 'a', title: 'A' };
const UE = { id: 'e', title: 'E', examOnly: true };
const mixed = () => setup([UA, UE], many('a', 3).concat(many('e', 2)));

test('1: daily, practice and weak queues take shared items only while shared items exist', async () => {
  const t = await mixed();
  assert.deepStrictEqual(ids(t.engine.start('daily')).sort(), ['a-1', 'a-2', 'a-3']);
  assert.deepStrictEqual(ids(t.engine.start('practice')).sort(), ['a-1', 'a-2', 'a-3']);
  t.doc.items['a-1'] = { s: 1, due: NOW + 1e9, ok: 0, bad: 1, last: NOW };
  t.doc.items['e-1'] = { s: 1, due: NOW + 1e9, ok: 0, bad: 3, last: NOW };
  assert.deepStrictEqual(ids(t.engine.start('weak')), ['a-1']);
  assert.deepStrictEqual(t.engine.weakList(5).map((x) => x.id), ['a-1']);
});

test('1b: examOnly items are used when explicitly practised, when nothing else is queued, or when only examOnly exists', async () => {
  const t = await mixed();
  assert.deepStrictEqual(ids(t.engine.start('practice', { units: ['e'] })).sort(), ['e-1', 'e-2']);
  // a exhausted for today: its new cap is 0 -> queue falls back to e instead of being empty
  const capped = await setup([{ id: 'a', title: 'A', newPerDay: 0 }, UE], many('a', 3).concat(many('e', 2)));
  assert.deepStrictEqual(ids(capped.engine.start('daily')).sort(), ['e-1', 'e-2']);
  // weak: only an examOnly item is weak
  t.doc.items['e-1'] = { s: 1, due: NOW + 1e9, ok: 0, bad: 3, last: NOW };
  assert.deepStrictEqual(ids(t.engine.start('weak')), ['e-1']);
  const only = await setup([UE], many('e', 2));
  assert.deepStrictEqual(ids(only.engine.start('daily')).sort(), ['e-1', 'e-2']);
  assert.deepStrictEqual(ids(only.engine.start('practice')).sort(), ['e-1', 'e-2']);
});

test('2: exam section over [a,e] count 3 takes both examOnly items and fills with one a item', async () => {
  const t = await setup([UA, UE], many('a', 3).concat(many('e', 2)), { exam: { passMark: 0.5, sections: [{ title: 'S', count: 3, units: ['a', 'e'] }] } });
  const list = ids(t.engine.start('exam'));
  assert.strictEqual(list.length, 3);
  assert.ok(list.includes('e-1') && list.includes('e-2'));
  assert.strictEqual(list.filter((id) => id.startsWith('a-')).length, 1);
});

test('3: exam stays full when the examOnly unit has no usable items', async () => {
  const t = await setup([UA, UE], many('a', 3).concat([{ id: 'e-1', unit: 'e', type: 'card', prompt: 'E', answers: ['x'] }]),
    { exam: { passMark: 0.5, sections: [{ title: 'S', count: 3, units: ['a', 'e'] }] } });
  assert.deepStrictEqual(ids(t.engine.start('exam')).sort(), ['a-1', 'a-2', 'a-3']);
});

test('4: a course without examOnly units behaves as before', async () => {
  const t = await setup([UA, { id: 'b', title: 'B' }], many('a', 2).concat(many('b', 2)),
    { exam: { passMark: 0.5, sections: [{ title: 'S', count: 4, units: ['a', 'b'] }] } });
  assert.strictEqual(ids(t.engine.start('daily')).length, 4);
  assert.strictEqual(ids(t.engine.start('practice')).length, 4);
  assert.deepStrictEqual(ids(t.engine.start('exam')).sort(), ['a-1', 'a-2', 'b-1', 'b-2']);
});

test('placement keeps examOnly items out while shared items exist', async () => {
  const t = await setup([UA, UE], many('a', 3).concat(many('e', 2)), { placement: { mode: 'self' } });
  assert.deepStrictEqual(ids(t.engine.start('placement', { seed: '1' })).sort(), ['a-1', 'a-2', 'a-3']);
});

test('daily queue of a group made only of examOnly units is not empty', async () => {
  const groups = [{ id: 'g1', title: 'G1', units: ['a'] }, { id: 'g2', title: 'G2', units: ['e'] }];
  const t = await setup([UA, UE], many('a', 3).concat(many('e', 2)), { groups });
  assert.deepStrictEqual(ids(t.engine.start('daily', { groupId: 'g1' })).sort(), ['a-1', 'a-2', 'a-3']);
  assert.deepStrictEqual(ids(t.engine.start('daily', { groupId: 'g2' })).sort(), ['e-1', 'e-2']);
});
