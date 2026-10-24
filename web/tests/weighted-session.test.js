'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const DojoStorage = require('../storage.js');
const H = require('./app-harness.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const D = 86400000;
const SEED = String(Math.floor(0.5 * 9007199254740992));

let dojoPromise;
function getDojo() {
  if (!dojoPromise) dojoPromise = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoPromise;
}

function gap(id, unit) { return { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id] }; }
const IDS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];
const ITEMS = IDS.map(id => gap(id, 'w')).concat([gap('l1', 'lad'), gap('l2', 'lad')]);

function rec(s, extra) { return Object.assign({ s, due: NOW - 1, ok: s, bad: 0, last: NOW - D }, extra || {}); }

async function setup(opts) {
  opts = opts || {};
  const units = [{ id: 'w', srs: opts.weighted === false ? {} : { mode: 'errorWeighted' } }, { id: 'lad' }];
  const course = Object.assign({ id: 'c', units }, opts.course || {});
  const content = { v: 1, course, items: ITEMS, version: 't', lock: ITEMS.map(i => i.id) };
  const doc = { v: 1, t: 0, items: opts.records || {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, update(fn) { fn(doc); doc.t = NOW; }, noteAnswer() {} };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
  return { engine, doc, dojo };
}

function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

const RECORDS = () => ({
  w1: rec(2, { e: 0.9 }), w2: rec(1, { e: 0.2 }), w3: rec(3), w4: rec(0, { e: 0.6 }),
  l1: rec(2), l2: rec(1)
});

test('weighted unit: daily order equals weightedQueue for the fixed seed', async () => {
  const t = await setup({ records: RECORDS() });
  const expected = t.dojo.call('weightedQueue', { ids: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'], records: RECORDS(), now: NOW, seed: SEED, limit: 20, newAllowance: 2 });
  const got = ids(t.engine.start('daily')).filter(id => id[0] === 'w');
  assert.deepStrictEqual(got, expected);
  assert.ok(got.includes('w1'), 'worst-first item is in the session');
});

test('weighted unit: practice uses weightedQueue; ladder ids stay first', async () => {
  const t = await setup({ records: RECORDS() });
  const q = ids(t.engine.start('practice', { limit: 6 }));
  const wIds = q.filter(id => id[0] === 'w');
  const expected = t.dojo.call('weightedQueue', { ids: IDS, records: RECORDS(), now: NOW, seed: SEED, limit: 6, newAllowance: 6 });
  assert.deepStrictEqual(wIds, expected.slice(0, wIds.length));
  assert.deepStrictEqual(q.slice(0, 2).sort(), ['l1', 'l2']);
});

test('ladder-only course: daily queue unchanged', async () => {
  const a = await setup({ records: RECORDS(), weighted: false });
  const q = ids(a.engine.start('daily'));
  assert.deepStrictEqual(q.filter(id => id[0] === 'w').slice(0, 3), ['w1', 'w2', 'w3']);
});

test('weak list ranks weighted unit by e', async () => {
  const t = await setup({ records: RECORDS() });
  const s = t.engine.start('weak', { limit: 3 });
  const q = s.error ? [] : ids(s);
  assert.strictEqual(q[0], 'w1', 'highest e first: ' + JSON.stringify(q));
});

test('extras: written for a weighted unit; e rises on wrong and cf records the given text', async () => {
  const t = await setup({ records: RECORDS() });
  const s = t.engine.start('practice', { units: ['w'], limit: 6 });
  while (s.current().item.id !== 'w1') s.next();
  s.answer({ text: 'zz' });
  assert.strictEqual(t.doc.items.w1.e, 0.93);
  assert.deepStrictEqual(t.doc.items.w1.cf, [['zz', 1]]);
});

test('extras: n5-like fixture (no timer, ladder, no confusions) gets no e/cf/to', async () => {
  const t = await setup({ records: { w1: rec(2), w2: rec(1), l1: rec(2) }, weighted: false });
  const s = t.engine.start('practice', { units: ['w'], limit: 6 });
  s.answer({ text: 'wrong' });
  assert.strictEqual(t.doc.items.w1.bad + t.doc.items.w2.bad, 1, 'the answer was recorded');
  const written = Object.values(t.doc.items).filter(r => 'e' in r || 'cf' in r || 'to' in r);
  assert.strictEqual(written.length, 0);
});

test('extras: course confusions flag enables cf on a ladder unit', async () => {
  const t = await setup({ records: RECORDS(), weighted: false, course: { confusions: true } });
  const s = t.engine.start('practice', { units: ['lad'], limit: 6 });
  const id = s.current().item.id;
  s.answer({ text: 'nope' });
  assert.deepStrictEqual(t.doc.items[id].cf, [['nope', 1]]);
  assert.strictEqual('e' in t.doc.items[id], false);
});

test('detail shows error rate, timeouts and top-3 confusions by count desc', async () => {
  const items = [{ id: 'a', unit: 'u1', type: 'choice', prompt: 'P', options: ['a', 'b'], answer: 0 }];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } });
  m.doc.items.a = { s: 1, due: NOW + D, ok: 2, bad: 3, last: NOW, e: 0.455, to: 2, cf: [['x', 1], ['y', 4], ['z', 2], ['q', 2], ['w', 9]] };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  assert.match(H.text(H.find(v, 'detail-errrate')), /46%/);
  assert.match(H.text(H.find(v, 'detail-timeouts')), /2/);
  assert.match(H.text(H.find(v, 'detail-confusions')), /w ×9, y ×4, z ×2$/);
});

test('detail without extras renders no extras block', async () => {
  const items = [{ id: 'a', unit: 'u1', type: 'choice', prompt: 'P', options: ['a', 'b'], answer: 0 }];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } });
  m.doc.items.a = { s: 1, due: NOW + D, ok: 2, bad: 3, last: NOW };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  assert.strictEqual(H.find(cat.view(), 'detail-extras'), null);
});

test('progress doc with extras survives sanitize and merge', async () => {
  const dojo = await getDojo();
  const extras = { e: 0.65, to: 1, cf: [['zz', 2], ['9', 1]] };
  const d = dojo.call('emptyProgress', {});
  d.course = 'demo';
  d.items = { a: Object.assign({ s: 1, due: 5, ok: 1, bad: 1, last: 500 }, extras) };
  d.t = 500;
  const s = dojo.call('sanitize', d);
  assert.deepStrictEqual(s.items.a.cf, extras.cf);
  const other = dojo.call('emptyProgress', {});
  other.course = 'demo';
  other.items = { b: { s: 1, due: 5, ok: 1, bad: 0, last: 400 } };
  other.t = 400;
  const merged = dojo.call('merge', { a: s, b: other });
  const doc = merged.doc || merged;
  assert.deepStrictEqual(doc.items.a.cf, extras.cf);
  assert.strictEqual(doc.items.a.e, 0.65);
  assert.strictEqual(doc.items.a.to, 1);
  assert.ok(DojoStorage);
});
