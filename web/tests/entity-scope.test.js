'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const D = 86400000;
const TODAY = '2025-10-09';

function gap(id, unit, entity) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id] };
  if (entity) it.entity = entity;
  return it;
}

const ITEMS = [gap('m1a', 'g', 'E1'), gap('m1b', 'g', 'E1'), gap('m1c', 'g', 'E1'), gap('m2a', 'g', 'E2'), gap('m2b', 'g', 'E2'), gap('p1', 'plain'), gap('p2', 'plain')];

function content(scoped) {
  const units = [scoped ? { id: 'g', srs: { scope: 'entity', dropOnWrong: 1 } } : { id: 'g' }, { id: 'plain' }];
  return { v: 1, course: { id: 'c', units }, items: ITEMS, version: 't', lock: ITEMS.map(i => i.id) };
}

let dojoPromise;
function getDojo() {
  if (!dojoPromise) dojoPromise = DojoWasm.load(require('node:fs').readFileSync(checkWasmFresh()));
  return dojoPromise;
}

async function setup(scoped, records) {
  const doc = { v: 1, t: 0, items: records || {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const saves = { n: 0 };
  const store = { doc, update(fn) { saves.n++; fn(doc); doc.t = clock.t; }, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo: await getDojo(), store, content: content(scoped), now: () => clock.t, today: () => TODAY, random: () => 0.5 });
  return { engine, doc, saves };
}

function rec(s, due, extra) {
  return Object.assign({ s, due, ok: s, bad: 0, last: NOW - D }, extra || {});
}

function dueAll(ids, s) {
  const out = {};
  ids.forEach(id => { out[id] = rec(s, NOW - 1); });
  return out;
}

function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

test('course without scope: per-item records and queue as before', async () => {
  const t = await setup(false, dueAll(['m1a', 'm1b', 'm1c'], 2));
  const s = t.engine.start('daily');
  assert.deepStrictEqual(ids(s).slice(0, 3), ['m1a', 'm1b', 'm1c']);
  const s2 = t.engine.start('daily');
  s2.answer({ text: 'am1a' });
  assert.strictEqual(t.doc.items.m1a.s, 3);
  assert.strictEqual(t.doc.items.m1b.s, 2, 'siblings untouched');
  assert.strictEqual(t.engine.unitConfig('g').scope, 'item');
});

test('daily queue: one slot per due entity, fresh entity costs one', async () => {
  const t = await setup(true, dueAll(['m1a', 'm1b', 'm1c'], 2));
  const q = ids(t.engine.start('daily'));
  assert.strictEqual(q.filter(id => id.startsWith('m1')).length, 1);
  assert.strictEqual(q.filter(id => id.startsWith('m2')).length, 1);
  assert.deepStrictEqual(q.filter(id => id.startsWith('p')), ['p1', 'p2']);
});

test('answer writes every member in one save, identical records', async () => {
  const t = await setup(true, { m1a: rec(4, NOW - 1), m1b: rec(2, NOW - 1) });
  const s2 = t.engine.start('practice', { units: ['g'] });
  while (s2.current().item.id !== 'm1a') s2.next();
  const before = t.saves.n;
  s2.answer({ text: 'am1a' });
  assert.strictEqual(t.saves.n - before, 1);
  const r = ['m1a', 'm1b', 'm1c'].map(id => t.doc.items[id]);
  assert.ok(r[0] && r.every(x => JSON.stringify(x) === JSON.stringify(r[0])), 'members identical');
  assert.strictEqual(r[0].s, 3, 'min view stage 2 plus one');
});

test('second wrong answer in the session does not drop the entity again', async () => {
  const t = await setup(true, dueAll(['m1a', 'm1b', 'm1c'], 3));
  const s = t.engine.start('practice', { units: ['g'] });
  while (s.current().item.id !== 'm1a') s.next();
  s.answer({ text: 'x' });
  assert.deepStrictEqual(['m1a', 'm1b', 'm1c'].map(id => t.doc.items[id].s), [2, 2, 2]);
  s.next();
  assert.strictEqual(s.current().item.id, 'm1b');
  s.answer({ text: 'x' });
  assert.deepStrictEqual(['m1a', 'm1b', 'm1c'].map(id => t.doc.items[id].s), [2, 2, 2]);
  assert.strictEqual(t.doc.items.m1b.bad, 1, 'wrong counted once');
});

test('override restores every member before regrading', async () => {
  const t = await setup(true, { m1a: rec(3, NOW - 1), m1b: rec(3, NOW - 1) });
  const s = t.engine.start('practice', { units: ['g'] });
  while (s.current().item.id !== 'm1a') s.next();
  s.answer({ text: 'x' });
  assert.strictEqual(t.doc.items.m1c.s, 2, 'inherited member written');
  assert.ok(s.canOverride());
  s.overrideLast();
  assert.deepStrictEqual(['m1a', 'm1b', 'm1c'].map(id => t.doc.items[id].s), [4, 4, 4]);
  assert.strictEqual(t.doc.items.m1a.bad, 0);
});

test('override of the first wrong clears the session drop flag', async () => {
  const t = await setup(true, dueAll(['m1a', 'm1b', 'm1c'], 3));
  const s = t.engine.start('practice', { units: ['g'] });
  while (s.current().item.id !== 'm1a') s.next();
  s.answer({ text: 'x' });
  s.overrideLast();
  s.next();
  s.answer({ text: 'x' });
  assert.deepStrictEqual(['m1a', 'm1b', 'm1c'].map(id => t.doc.items[id].s), [3, 3, 3], 'drops again after the override undid the first');
});

test('member added to a started entity is neither new nor counted fresh', async () => {
  const t = await setup(true, { m1a: rec(2, NOW + D), m1b: rec(2, NOW + D) });
  const q = ids(t.engine.start('daily'));
  assert.ok(!q.includes('m1c'));
  assert.strictEqual(t.engine.counts().byUnit.g.fresh, 2, 'only the untouched entity E2 is fresh');
});

test('new entity counts one new item in daily stats', async () => {
  const t = await setup(true, {});
  const s = t.engine.start('daily');
  while (!s.current().item.id.startsWith('m1')) s.next();
  s.answer({ text: 'a' + s.current().item.id });
  assert.strictEqual(t.doc.stats.newByDay[TODAY], 1);
  assert.deepStrictEqual(['m1a', 'm1b', 'm1c'].map(id => t.doc.items[id].s), [1, 1, 1]);
});
