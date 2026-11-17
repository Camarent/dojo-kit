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

const TOPICS = { aspects: [{ id: 'meaning', tags: ['vocab'] }, { id: 'writing', tags: ['write'] }, { id: 'reading', tags: ['read'] }] };
// Unit scope gives one queue slot per unit, so the three topic items sit in three units.
const UNIT_SCOPE = ['a', 'b', 'c'].map((id) => ({ id, title: id.toUpperCase(), srs: { scope: 'unit' } }));
const ASPECT_TAGS = ['vocab', 'write', 'read'];

// Items of one topic (entity T): one per aspect tag, so each has its own unit key.
function gap(unit, n, entity) { return { id: unit + '-' + n, unit, type: 'gap', prompt: unit + n, answers: ['x'], entity, tags: [ASPECT_TAGS[n - 1]] }; }

const TOPIC_ITEMS = [gap('a', 1, 'T'), gap('b', 2, 'T'), gap('c', 3, 'T')];

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

test('C2: three due items of one topic show one item in the unit-scope daily queue', async () => {
  const t = await setup(UNIT_SCOPE, TOPIC_ITEMS, { topics: TOPICS });
  TOPIC_ITEMS.forEach((i) => due(t.doc, i.id));
  assert.strictEqual(ids(t.engine.start('daily')).length, 1);
});

// Same course without topics config, each item its own entity: no cut applies, so all three are shown.
// (Shared entities without topics config would collapse in the unit key, so the decoy uses distinct entities.)
test('C3 decoy: the same course without topics config shows all three items', async () => {
  const its = TOPIC_ITEMS.map((i, k) => Object.assign({}, i, { entity: 'T' + (k + 1) }));
  const t = await setup(UNIT_SCOPE, its);
  its.forEach((i) => due(t.doc, i.id));
  assert.deepStrictEqual(ids(t.engine.start('daily')).sort(), ['a-1', 'b-2', 'c-3']);
});

test('C4: onlyTags drops untagged items from the unit-scope daily queue', async () => {
  const its = [
    { id: 'a-1', unit: 'a', type: 'gap', prompt: 'a1', answers: ['x'], entity: 'E1', tags: ['vocab'] },
    { id: 'a-2', unit: 'a', type: 'gap', prompt: 'a2', answers: ['x'], entity: 'E2', tags: [] },
    { id: 'a-3', unit: 'a', type: 'gap', prompt: 'a3', answers: ['x'], entity: 'E3', tags: ['vocab'] },
  ];
  const groups = [{ id: 'g', title: 'G', units: ['a'], extraTags: ['vocab'] }];
  const t = await setup(UNIT_SCOPE, its, { groups });
  its.forEach((i) => due(t.doc, i.id));
  assert.deepStrictEqual(ids(t.engine.start('daily')).sort(), ['a-1', 'a-2', 'a-3']);
  t.engine.setGroupSetting('g', { onlyTags: true });
  assert.deepStrictEqual(ids(t.engine.start('daily')).sort(), ['a-1', 'a-3']);
});
