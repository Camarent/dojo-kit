'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const TODAY = '2025-10-09';

function gap(id, unit, entity, tags) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id], explanation: 'e' };
  if (entity) it.entity = entity;
  if (tags) it.tags = tags;
  return it;
}

// E1 has 4 items (kanji + 3 words); E5 is untagged, E3/E4 carry n5.
function items() {
  return [
    gap('k1', 'kanji', 'E1', ['n5']), gap('w1a', 'vocab', 'E1', ['n5']), gap('w1b', 'vocab', 'E1', ['n5']), gap('w1c', 'vocab', 'E1', ['n5']),
    gap('k2', 'kanji', 'E2', ['n5']), gap('w2', 'vocab', 'E2', ['n5']),
    gap('k5', 'kanji', 'E5'),
    gap('k3', 'kanji', 'E3', ['n5']),
    gap('k4', 'kanji', 'E4', ['n5']),
    gap('o1', 'other'), gap('o2', 'other'), gap('o3', 'other')
  ];
}

function content(courseExtra) {
  const its = items();
  const course = Object.assign({ id: 'c', units: [{ id: 'kanji' }, { id: 'vocab' }, { id: 'other' }] }, courseExtra);
  return { v: 1, course, items: its, version: 't', lock: its.map(i => i.id) };
}

const GROUPS = [{ id: 'kv', title: 'KV', units: ['kanji', 'vocab'], newPerDay: 2, extraNew: true, extraTags: ['n5'] }];

let dojoPromise;
function getDojo() {
  if (!dojoPromise) dojoPromise = DojoWasm.load(require('node:fs').readFileSync(checkWasmFresh()));
  return dojoPromise;
}

async function setup(c) {
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = { doc, update(fn) { fn(doc); doc.t = clock.t; }, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo: await getDojo(), store, content: c, now: () => clock.t, today: () => TODAY, random: () => 0.5 });
  return { engine, doc };
}

function queue(engine) {
  const s = engine.start('daily');
  const out = [];
  for (let c = s.current(); c; c = s.next()) out.push(c.item.id);
  return out;
}

function answerAll(engine, ids) {
  const s = engine.start('daily');
  for (let c = s.current(); c; c = s.next()) {
    if (ids.includes(c.item.id)) s.answer({ text: 'a' + c.item.id });
    else s.answer({ text: 'x' });
  }
}

test('course without groups: queue and counts unchanged', async () => {
  const t = await setup(content({}));
  assert.deepStrictEqual(queue(t.engine), items().map(i => i.id).slice(0, 10));
  const c = t.engine.counts();
  assert.strictEqual(c.groups, undefined);
  assert.strictEqual(c.bars, undefined);
});

test('group cap counts entities and never splits an entity', async () => {
  const t = await setup(content({ groups: [Object.assign({}, GROUPS[0], { newPerDay: 1 })] }));
  const q = queue(t.engine);
  assert.deepStrictEqual(q.filter(id => !id.startsWith('o')), ['k1', 'w1a', 'w1b', 'w1c']);
  assert.deepStrictEqual(q.filter(id => id.startsWith('o')), ['o1', 'o2', 'o3']);
});

test('entity of 4 items is counted once and the group key is written once', async () => {
  const t = await setup(content({ groups: GROUPS }));
  answerAll(t.engine, ['k1', 'w1a', 'w1b', 'w1c']);
  assert.strictEqual(t.doc.stats['newBy:g:kv'][TODAY], 2); // E1 and E2 only
  assert.strictEqual(t.doc.stats.newByDay[TODAY], 9); // items still counted for older builds
  const g = t.engine.counts().groups.kv;
  assert.strictEqual(g.total, 5);
  assert.strictEqual(g.started, 2);
  assert.strictEqual(g.newToday, 0);
});

test('group stats key counts entity once even with a single answered item per entity', async () => {
  const t = await setup(content({ groups: GROUPS }));
  const s = t.engine.start('daily');
  s.answer({ text: 'ak1' });
  s.next();
  s.answer({ text: 'aw1a' });
  assert.strictEqual(t.doc.stats['newBy:g:kv'][TODAY], 1);
});

test('user override beats course newPerDay; null tombstone restores it', async () => {
  const t = await setup(content({ groups: GROUPS }));
  assert.deepStrictEqual(queue(t.engine).filter(id => !id.startsWith('o')), ['k1', 'w1a', 'w1b', 'w1c', 'k2', 'w2']);
  assert.deepStrictEqual(t.engine.setGroupSetting('kv', { newPerDay: 1 }), {});
  assert.strictEqual(t.doc.settings['group:kv:newPerDay'], 1);
  assert.ok(t.doc.settings.ts['group:kv:newPerDay'] > 0);
  assert.deepStrictEqual(queue(t.engine).filter(id => !id.startsWith('o')), ['k1', 'w1a', 'w1b', 'w1c']);
  assert.strictEqual(t.engine.counts().groups.kv.newToday, 1);
  t.engine.setGroupSetting('kv', { newPerDay: null });
  assert.strictEqual(t.doc.settings['group:kv:newPerDay'], null);
  assert.deepStrictEqual(queue(t.engine).filter(id => !id.startsWith('o')), ['k1', 'w1a', 'w1b', 'w1c', 'k2', 'w2']);
  assert.deepStrictEqual(t.engine.setGroupSetting('kv', { newPerDay: 99 }), { error: 'bad_value' });
  assert.deepStrictEqual(t.engine.setGroupSetting('nope', { newPerDay: 1 }), { error: 'unknown_group' });
});

test('extraNew adds entities to the group; onlyTags skips untagged extras', async () => {
  const t = await setup(content({ groups: GROUPS }));
  t.engine.moreNew(1);
  const grouped = () => queue(t.engine).filter(id => !id.startsWith('o'));
  assert.deepStrictEqual(grouped(), ['k1', 'w1a', 'w1b', 'w1c', 'k2', 'w2', 'k5']);
  t.engine.setGroupSetting('kv', { onlyTags: true });
  assert.deepStrictEqual(grouped(), ['k1', 'w1a', 'w1b', 'w1c', 'k2', 'w2', 'k3']);
  t.engine.setGroupSetting('kv', { onlyTags: null });
  assert.deepStrictEqual(grouped(), ['k1', 'w1a', 'w1b', 'w1c', 'k2', 'w2', 'k5']);
  assert.deepStrictEqual(queue(t.engine).filter(id => id.startsWith('o')), ['o1', 'o2', 'o3']);
});

test('random group order shuffles entities, keeping each entity contiguous', async () => {
  const t = await setup(content({ groups: [Object.assign({}, GROUPS[0], { newPerDay: 5, newOrder: 'random' })] }));
  const q = queue(t.engine).filter(id => !id.startsWith('o'));
  assert.strictEqual(q.length, 9);
  const e1 = q.indexOf('k1');
  assert.deepStrictEqual(new Set(q.slice(e1, e1 + 4)), new Set(['k1', 'w1a', 'w1b', 'w1c']));
});

test('counts() returns groups and bars over entities', async () => {
  const t = await setup(content({ groups: GROUPS, bars: [{ title: 'N5', tags: ['n5'] }] }));
  const c = t.engine.counts();
  assert.deepStrictEqual(c.groups.kv, { due: 0, fresh: 5, newToday: 2, started: 0, total: 5 });
  assert.deepStrictEqual(c.bars, [{ title: 'N5', learned: 0, started: 0, total: 4 }]);
});

test('extraRandom shuffles only the extra entities; the daily base keeps file order', async () => {
  const t = await setup(content({ groups: GROUPS }));
  t.engine.moreNew(2);
  const grouped = () => queue(t.engine).filter(id => !id.startsWith('o'));
  const fileOrder = grouped();
  assert.deepStrictEqual(fileOrder.slice(0, 6), ['k1', 'w1a', 'w1b', 'w1c', 'k2', 'w2']);
  t.engine.setGroupSetting('kv', { extraRandom: true });
  const r = grouped();
  assert.deepStrictEqual(r.slice(0, 6), ['k1', 'w1a', 'w1b', 'w1c', 'k2', 'w2']);
  assert.strictEqual(r.length, fileOrder.length);
  assert.deepStrictEqual(r, grouped());
  const extras = r.slice(6);
  assert.ok(extras.every(id => ['k3', 'k4', 'k5'].includes(id)));
  assert.deepStrictEqual(t.engine.groupSettings('kv'), { extraRandom: true });
  assert.deepStrictEqual(t.engine.setGroupSetting('kv', { extraRandom: 'x' }), { error: 'bad_value' });
  t.engine.setGroupSetting('kv', { extraRandom: null });
  assert.strictEqual(t.doc.settings['group:kv:extraRandom'], null);
  assert.deepStrictEqual(grouped(), fileOrder);
});

test('extraRandom combined with onlyTags still skips untagged extras', async () => {
  const t = await setup(content({ groups: GROUPS }));
  t.engine.moreNew(2);
  t.engine.setGroupSetting('kv', { extraRandom: true, onlyTags: true });
  const r = queue(t.engine).filter(id => !id.startsWith('o'));
  assert.deepStrictEqual(r.slice(0, 6), ['k1', 'w1a', 'w1b', 'w1c', 'k2', 'w2']);
  assert.deepStrictEqual(r.slice(6).sort(), ['k3', 'k4']);
});
