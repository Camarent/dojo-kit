'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const Qtimer = require('../session/qtimer.js');
const H = require('./app-harness.js');
const { setup } = require('./fixtures.js');
const { checkWasmFresh } = require('./loader.js');

const T = { baseMs: 8000, adaptive: true, replays: 1 };
let dojoP;
function getDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}
function gapItem(id, unit, extra) { return Object.assign({ id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id], explanation: 'e' }, extra || {}); }
function mk(units, items, course) {
  return { v: 1, version: 't', lock: items.map(i => i.id), items, course: Object.assign({ id: 'c', title: 'C', units }, course || {}) };
}

test('weighted perf: a course without weighted units costs at most one unitConfig per unit', async () => {
  const units = [];
  const items = [];
  for (let u = 0; u < 40; u++) {
    units.push({ id: 'u' + u, title: 'U' });
    for (let i = 0; i < 30; i++) items.push(gapItem('u' + u + '-' + i, 'u' + u));
  }
  const real = await getDojo();
  let calls = 0;
  const dojo = { call(name, args) { if (name === 'unitConfig' && /weighted-queue/.test(new Error().stack)) calls++; return real.call(name, args); } };
  const env = await setup({ content: mk(units, items), dojo });
  env.engine.start('weak', {});
  env.engine.start('weak', {});
  env.engine.start('daily', {});
  assert.ok(calls <= units.length, 'unitConfig calls: ' + calls);
});

test('a started timer of another item does not block an untimed item', async () => {
  const units = [{ id: 't', title: 'T', timer: T }, { id: 'p', title: 'P' }];
  const env = await setup({ content: mk(units, [gapItem('t-1', 't'), gapItem('p-1', 'p')]) });
  const s = env.engine.start('practice', { limit: 5 });
  const first = s.current().item;
  const timed = first.unit === 't';
  if (timed) { s.timerStart(first); env.clock.t += 9000; s.next(); }
  assert.strictEqual(timed ? s.current().item.unit : 'p', 'p');
  if (timed) assert.strictEqual(s.answer({ text: 'ap-1' }).correct, true);
});

test('quitting mid-item leaves no expiry for the next session', async () => {
  const env = await setup({ content: mk([{ id: 't', title: 'T', timer: T }], [gapItem('t-1', 't')]) });
  const a = env.engine.start('practice', { limit: 5 });
  a.timerStart(a.current().item);
  env.clock.t += 9000;
  const b = env.engine.start('practice', { limit: 5 });
  assert.strictEqual(b.answer({ text: 'at-1' }).correct, true);
});

test('qtimer.clear drops the started item', () => {
  const clock = { t: 0 };
  const dojo = { call: (n) => (n === 'timerLimit' ? 1000 : {}) };
  const ctx = { dojo, now: () => clock.t, store: { doc: { settings: {} }, update() {} }, course: { timer: T, units: [] } };
  const q = Qtimer.create(ctx);
  const session = { current: () => ({ item: { id: 'x', unit: 'u' } }), answer: () => ({ ok: 1 }) };
  q.attach(session);
  session.timerStart({ id: 'x', unit: 'u' });
  clock.t = 5000;
  assert.deepStrictEqual(session.answer({}), { error: 'timed_out' });
  q.clear();
  assert.deepStrictEqual(session.answer({}), { ok: 1 });
});

test('timed gap item with a retry reading is graded wrong at expiry and the session advances', async () => {
  const items = [gapItem('t-1', 't', { answers: ['x'], retry: ['y'] }), gapItem('t-2', 't')];
  const env = await setup({ content: mk([{ id: 't', title: 'T', timer: T }], items) });
  const s = env.engine.start('practice', { limit: 5 });
  const first = s.current().item;
  s.timerStart(first);
  env.clock.t += 9000;
  const r = s.answerTimed({ text: first.id === 't-1' ? 'y' : '' });
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.timedOut, true);
  assert.notStrictEqual(r.retry, true);
  s.next();
  const second = s.current();
  if (second && second.item.id !== first.id) assert.notStrictEqual(s.answer({ text: 'zz' }).error, 'timed_out');
});

test('"don\'t know" is not stored as a confusion', async () => {
  const env = await setup({ content: mk([{ id: 'u', title: 'U' }], [gapItem('u-1', 'u'), gapItem('u-2', 'u')], { confusions: true, dontKnow: true }) });
  const s = env.engine.start('daily', {});
  const id = s.current().item.id;
  s.dontKnow();
  const rec = env.doc.items[id];
  assert.ok(rec, 'record written');
  assert.ok(!rec.cf || rec.cf.length === 0, JSON.stringify(rec.cf));
});

function groupedCourse() {
  const units = [{ id: 'wa', title: 'A', srs: { mode: 'errorWeighted' } }, { id: 'wb', title: 'B', srs: { mode: 'errorWeighted' } },
    { id: 'wx', title: 'X', examOnly: true, srs: { mode: 'errorWeighted' } }];
  const items = [];
  units.forEach(u => { for (let i = 0; i < 30; i++) items.push(gapItem(u.id + '-' + i, u.id)); });
  return mk(units, items, { groups: [{ id: 'ga', title: 'GA', units: ['wa'] }, { id: 'gb', title: 'GB', units: ['wb'] }] });
}

function dueRecords() {
  const past = { s: 1, due: 1, ok: 1, bad: 0, last: 1 };
  const out = {};
  for (let i = 0; i < 15; i++) { out['wa-' + i] = past; out['wb-' + i] = past; }
  for (let i = 0; i < 5; i++) out['wx-' + i] = past;
  return out;
}

test('weighted daily: a group gets only its own items and examOnly units are excluded', async () => {
  const env = await setup({ content: groupedCourse(), doc: { v: 1, t: 0, items: dueRecords(), stats: { days: {}, newByDay: {} }, settings: {}, exams: {} } });
  const s = env.engine.start('daily', { groupId: 'ga' });
  assert.ok(!s.error, JSON.stringify(s.error));
  const ids = [];
  for (let c = s.current(); c; c = s.next()) ids.push(c.item.id);
  assert.ok(ids.length >= 15, 'all due items of the group: ' + ids.length);
  assert.ok(ids.every(id => id.startsWith('wa-')), ids.join());
  const all = env.engine.start('daily', {});
  const allIds = [];
  for (let c = all.current(); c; c = all.next()) allIds.push(c.item.id);
  assert.ok(allIds.every(id => !id.startsWith('wx-')), 'examOnly leaked');
});

test('detail ignores malformed cf entries', async () => {
  const items = [{ id: 'a', unit: 'u1', type: 'choice', prompt: 'P', options: ['a', 'b'], answer: 0 }];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } });
  m.doc.items.a = { s: 1, due: 1e13, ok: 2, bad: 3, last: 1, cf: [['ok', 2], 5, ['bad'], ['x', NaN], ['y', 0], [3, 4], null] };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  const txt = H.text(H.find(cat.view(), 'detail-confusions'));
  assert.match(txt, /ok ×2$/);
  assert.ok(!/undefined|NaN/.test(txt), txt);
});

test('overriding a wrong answer restores the timer scale and streak', async () => {
  const env = await setup({ content: mk([{ id: 't', title: 'T', timer: T }], [gapItem('t-1', 't'), gapItem('t-2', 't')]) });
  const s = env.engine.start('practice', { limit: 5 });
  s.timerStart(s.current().item);
  s.answer({ text: 'zzz' });
  assert.strictEqual(env.doc.settings['timer:scale'], 1.2);
  assert.strictEqual(s.canOverride(), true);
  s.overrideLast();
  assert.strictEqual(env.doc.settings['timer:scale'], undefined);
  assert.strictEqual(env.doc.settings['timer:streak'], undefined);
});
