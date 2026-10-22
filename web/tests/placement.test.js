'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const ROOT = path.join(__dirname, '..', '..');
const DAY = 86400000;
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function loadContent() {
  const dir = path.join(ROOT, 'examples', 'demo');
  const course = JSON.parse(fs.readFileSync(path.join(dir, 'course.json'), 'utf8'));
  const items = [];
  course.units.forEach((u) => {
    const text = fs.readFileSync(path.join(dir, 'content', u.id + '.jsonl'), 'utf8');
    text.split('\n').filter(Boolean).forEach((line) => items.push(JSON.parse(line)));
  });
  return { v: 1, course, items, version: 'test', lock: items.map((i) => i.id) };
}

let dojoPromise;
function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

async function setup(opts) {
  const o = opts || {};
  const doc = o.doc || { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: o.now || NOW };
  let noted = 0;
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() { noted++; }
  };
  const content = o.content || loadContent();
  const dojo = o.dojo || await getDojo();
  let seq = 0;
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: o.random || (() => ((seq++ * 0.37) % 1)),
  });
  return { engine, doc, store, clock, content, notes: () => noted };
}

function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

function withPlacement(cfg) {
  const content = loadContent();
  content.course.placement = { mode: 'self', ...(cfg || {}) };
  return content;
}

function unitOf(t, id) { return t.content.items.find((i) => i.id === id).unit; }

function runAll(s, knownFor) {
  const answered = [];
  for (let c = s.current(); c; c = s.next()) {
    const known = knownFor(c.item.id, answered.length);
    assert.deepStrictEqual(s.answer({ rating: known ? 'known' : 'again' }), { recorded: true });
    answered.push({ id: c.item.id, known });
  }
  return answered;
}

test('placement returns no_placement error when course.placement is absent', async () => {
  const content = loadContent();
  delete content.course.placement;
  const t = await setup({ content });
  assert.deepStrictEqual(t.engine.start('placement'), { error: 'no_placement' });
});

test('not offered without config: engine.placement().available is false, true with config', async () => {
  const content = loadContent();
  delete content.course.placement;
  const off = await setup({ content });
  assert.deepStrictEqual(off.engine.placement(), { available: false, done: false });
  const on = await setup({ content: withPlacement() });
  assert.deepStrictEqual(on.engine.placement(), { available: true, done: false });
});

test('placement default samples 5 per unit', async () => {
  const t = await setup({ content: withPlacement() });
  const list = ids(t.engine.start('placement', {}));
  const counts = {};
  list.forEach((id) => { const u = unitOf(t, id); counts[u] = (counts[u] || 0) + 1; });
  assert.deepStrictEqual(counts, { geo: 5, math: 5 });
  assert.strictEqual(new Set(list).size, 10);
});

test('placement perUnit from course.placement is exact when units are larger', async () => {
  const t = await setup({ content: withPlacement({ perUnit: 3 }) });
  const list = ids(t.engine.start('placement', {}));
  const counts = {};
  list.forEach((id) => { const u = unitOf(t, id); counts[u] = (counts[u] || 0) + 1; });
  assert.deepStrictEqual(counts, { geo: 3, math: 3 });
});

test('placement seed is exposed on session and same seed gives same samples', async () => {
  const content = withPlacement();
  const a = (await setup({ content })).engine.start('placement', { seed: '42' });
  const b = (await setup({ content })).engine.start('placement', { seed: '42' });
  assert.strictEqual(a.seed, '42');
  assert.deepStrictEqual(ids(a), ids(b));
});

test('placement default seed is kept on the session', async () => {
  const t = await setup({ content: withPlacement() });
  const s = t.engine.start('placement', {});
  assert.strictEqual(s.seed, String(NOW));
});

test('placement different seeds give different samples (units larger than perUnit)', async () => {
  const content = withPlacement();
  const a = (await setup({ content })).engine.start('placement', { seed: '42' });
  const b = (await setup({ content })).engine.start('placement', { seed: '99' });
  assert.notDeepStrictEqual(ids(a), ids(b));
});

test('placement known writes core records; unknown leaves items untouched', async () => {
  const t = await setup({ content: withPlacement() });
  const s = t.engine.start('placement', { seed: '42' });
  const answered = runAll(s, (id, n) => n % 2 === 0);
  assert.strictEqual(t.doc.settings.placementDone, undefined);
  s.finish();
  answered.forEach((a) => {
    const rec = t.doc.items[a.id];
    if (a.known) {
      assert.ok(rec, a.id);
      assert.strictEqual(rec.s, 4);
      assert.strictEqual(rec.last, NOW);
      assert.ok(rec.due > NOW);
    } else {
      assert.strictEqual(rec, undefined, a.id);
    }
  });
  const known = answered.filter((a) => a.known).map((a) => a.id);
  assert.strictEqual(Object.keys(t.doc.items).length, known.length);
  assert.ok(new Set(known.map((id) => t.doc.items[id].due)).size > 1, 'due dates are spread');
});

test('placement records are deterministic per seed and come from core spread', async () => {
  const content = withPlacement();
  async function run(seed) {
    const t = await setup({ content });
    const s = t.engine.start('placement', { seed });
    runAll(s, () => true);
    return JSON.parse(JSON.stringify(t.doc.items));
  }
  const a = await run('42');
  const b = await run('42');
  const c = await run('99');
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.notDeepStrictEqual(Object.keys(a).sort(), Object.keys(c).sort());
  const dojo = await getDojo();
  const rec = Object.values(a)[0];
  const direct = dojo.call('applyPlacement', { rec: null, known: true, now: NOW, seed: '1' });
  assert.strictEqual(direct.s, rec.s);
});

test('placement known does not downgrade an existing higher-stage record', async () => {
  const t = await setup({ content: withPlacement() });
  const s = t.engine.start('placement', { seed: '42' });
  const first = s.current().item.id;
  const rec = { s: 5, due: NOW + 9 * DAY, ok: 7, bad: 1, last: NOW - DAY };
  t.doc.items[first] = Object.assign({}, rec);
  s.answer({ rating: 'known' });
  assert.deepStrictEqual(t.doc.items[first], rec);
});

test('placement does not touch stats.days, newByDay or noteAnswer', async () => {
  const t = await setup({ content: withPlacement() });
  const s = t.engine.start('placement', { seed: '42' });
  runAll(s, () => true);
  s.finish();
  assert.deepStrictEqual(t.doc.stats, { days: {}, newByDay: {} });
  assert.strictEqual(t.notes(), 0);
});

test('placementDone false before finish, true after, other settings survive', async () => {
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: { newPerDay: 7, ts: 123 }, exams: {} };
  const t = await setup({ content: withPlacement(), doc });
  const s = t.engine.start('placement', { seed: '42' });
  runAll(s, () => false);
  assert.strictEqual(t.doc.settings.placementDone, undefined);
  assert.strictEqual(t.engine.placement().done, false);
  const summary = s.finish();
  assert.ok(!summary.error);
  assert.deepStrictEqual(t.doc.settings, { newPerDay: 7, ts: 123, placementDone: true });
  assert.strictEqual(t.engine.placement().done, true);
  assert.deepStrictEqual(t.doc.items, {});
});

test('placement re-run allowed after placementDone and updates items', async () => {
  const t = await setup({ content: withPlacement() });
  const s1 = t.engine.start('placement', { seed: '42' });
  runAll(s1, () => false);
  s1.finish();
  assert.strictEqual(t.doc.settings.placementDone, true);
  assert.deepStrictEqual(t.doc.items, {});
  const s2 = t.engine.start('placement', { seed: '99' });
  assert.ok(!s2.error);
  const answered = runAll(s2, () => true);
  s2.finish();
  assert.strictEqual(t.doc.settings.placementDone, true);
  answered.forEach((a) => assert.strictEqual(t.doc.items[a.id].s, 4));
});

test('placement bad input is rejected without writing', async () => {
  const t = await setup({ content: withPlacement() });
  const s = t.engine.start('placement', { seed: '42' });
  assert.deepStrictEqual(s.answer({ rating: 'maybe' }), { error: 'bad_input' });
  assert.deepStrictEqual(t.doc.items, {});
});

test('placement queue excludes examOnly unit items', async () => {
  const t = await setup({ content: withPlacement() });
  const list = ids(t.engine.start('placement', { seed: '42' }));
  // examOnly units in demo course are geo-exam and math-exam
  // Their items (geox-1, mathx-1) should NOT be in placement
  assert.ok(!list.includes('geox-1'), 'examOnly item geox-1 should not be in placement');
  assert.ok(!list.includes('mathx-1'), 'examOnly item mathx-1 should not be in placement');
  // Non-examOnly items should be present
  const geoItems = t.content.items.filter(i => i.unit === 'geo').map(i => i.id);
  const mathItems = t.content.items.filter(i => i.unit === 'math').map(i => i.id);
  // At least some non-examOnly items should be in the placement
  assert.ok(list.some(id => geoItems.includes(id) || mathItems.includes(id)), 'Should have non-examOnly items');
});
