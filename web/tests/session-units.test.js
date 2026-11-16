'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const D = 86400000;
const TODAY = '2025-10-09';

function gap(id, entity) {
  return { id, unit: 'u', entity, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id] };
}

const ITEMS = [gap('a1', 'A'), gap('a2', 'A'), gap('b1', 'B'), gap('b2', 'B'), gap('c1', 'C'), gap('c2', 'C')];
const COURSE = { id: 'c', units: [{ id: 'u', srs: { scope: 'unit' } }], groups: [{ id: 'g', title: 'G', units: ['u'] }] };
const MEMBERS = ['a1', 'a2', 'b1', 'b2'];

let dojoPromise;
function getDojo() {
  if (!dojoPromise) dojoPromise = DojoWasm.load(require('node:fs').readFileSync(checkWasmFresh()));
  return dojoPromise;
}

async function mount(records) {
  const doc = { v: 1, t: 0, items: records, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const content = { v: 1, course: COURSE, items: ITEMS, version: 't', lock: ITEMS.map((i) => i.id) };
  const engine = DojoSession.createEngine({ dojo: await getDojo(), store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  return { engine, doc };
}

function dueRecords() {
  const out = {};
  MEMBERS.forEach((id) => { out[id] = { s: 2, due: NOW - 1, ok: 2, bad: 0, last: NOW - D }; });
  return out;
}

test('home counters equal the plan of the session that starts', async () => {
  const { engine } = await mount(dueRecords());
  const counts = engine.counts();
  const session = engine.start('daily');
  assert.strictEqual(counts.queue, counts.plan.total);
  assert.strictEqual(counts.queue, session.total);
  assert.strictEqual(counts.due, counts.plan.due);
  assert.strictEqual(counts.groups.g.due, 2);
});

test('one right answer lowers the group counter by 1 and writes every unit member', async () => {
  const { engine, doc } = await mount(dueRecords());
  const before = engine.counts().groups.g.due;
  const session = engine.start('daily');
  const first = session.current().item;
  const members = ITEMS.filter((i) => i.entity === first.entity).map((i) => i.id);
  session.answer({ text: first.answers[0] });
  assert.strictEqual(engine.counts().groups.g.due, before - 1);
  const [x, y] = members.map((id) => doc.items[id]);
  assert.ok(x && y, 'both members have a record');
  assert.strictEqual(x.s, y.s);
  assert.strictEqual(x.due, y.due);
  assert.ok(x.s > 2, 'stage rose');
  assert.ok(doc.items[first.id].qok >= 1, 'answered member carries qok');
  assert.strictEqual(doc.stats.answerMs.length, 1, 'answer time recorded');
});

test('reload with copied records gives the same counts', async () => {
  const first = await mount(dueRecords());
  const session = first.engine.start('daily');
  session.answer({ text: session.current().item.answers[0] });
  const second = await mount(JSON.parse(JSON.stringify(first.doc.items)));
  const a = first.engine.counts();
  const b = second.engine.counts();
  assert.strictEqual(b.queue, a.queue);
  assert.deepStrictEqual(b.groups, a.groups);
});
