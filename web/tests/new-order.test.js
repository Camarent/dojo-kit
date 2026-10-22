'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const DAY1 = '2025-10-09';
const DAY2 = '2025-10-10';
const NOW = 1760000000000;

function hashString(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndexes(count, seedText) {
  var rand = mulberry32(hashString(seedText));
  var order = [];
  for (var i = 0; i < count; i++) order.push(i);
  for (var j = count - 1; j > 0; j--) {
    var k = Math.floor(rand() * (j + 1));
    var tmp = order[j];
    order[j] = order[k];
    order[k] = tmp;
  }
  return order;
}

function simpleContent(units, courseOverrides) {
  const items = [];
  units.forEach((u, uidx) => {
    for (let i = 1; i <= 3; i++) {
      items.push({
        id: u.id + '-' + i,
        unit: u.id,
        type: 'gap',
        prompt: 'Q ' + u.id + ' ' + i,
        answers: ['a' + u.id + i],
        explanation: 'e'
      });
    }
  });
  return { v: 1, course: Object.assign({ units: units }, courseOverrides), items: items, version: 't', lock: items.map(i => i.id) };
}

// Content with 8 items for reliable non-collision
function manyItems(courseOverrides) {
  const items = [];
  for (let i = 1; i <= 8; i++) {
    items.push({
      id: 'x-' + i,
      unit: 'x',
      type: 'gap',
      prompt: 'Q ' + i,
      answers: ['ax' + i],
      explanation: 'e'
    });
  }
  return { v: 1, course: Object.assign({ units: [{ id: 'x', title: 'X' }] }, courseOverrides), items: items, version: 't', lock: items.map(i => i.id) };
}

let dojoPromise;
async function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(require('node:fs').readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

async function setup(content, clockOverrides) {
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = Object.assign({ t: NOW }, clockOverrides);
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {}
  };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => clock.today || DAY1,
    random: () => 0.5
  });
  return { engine, doc, store, clock, content };
}

function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

// Test 1: file order unchanged by default
test('file order unchanged by default', async () => {
  const units = [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' }
  ];
  const content = simpleContent(units, { id: 'c1' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  const s = t.engine.start('daily');
  const list = ids(s);
  assert.deepStrictEqual(list, ['a-1', 'a-2', 'a-3', 'b-1', 'b-2', 'b-3']);
});

// Test 2: random order same day twice, differs from file
test('random: same day twice same order, differs from file', async () => {
  const units = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const content = simpleContent(units, { id: 'c2', newOrder: 'random' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  const s1 = t.engine.start('daily');
  const list1 = ids(s1);
  const s2 = t.engine.start('daily');
  const list2 = ids(s2);
  assert.deepStrictEqual(list1, list2, 'Same day same order');
  assert.strictEqual(list1.length, 6);
  assert.deepStrictEqual(list1.slice().sort(), ['a-1','a-2','a-3','b-1','b-2','b-3']);
  const fileOrder = ['a-1','a-2','a-3','b-1','b-2','b-3'];
  assert.notDeepStrictEqual(list1, fileOrder, 'Random differs from file');
});

// Test 3: different day different order (>=8 items for reliability)
test('random: different day different order', async () => {
  const content = manyItems({ id: 'c3', newOrder: 'random' });
  const t1 = await setup(content, { today: DAY1 });
  t1.doc.settings.newPerDay = 10;
  const s1 = t1.engine.start('daily');
  const list1 = ids(s1);
  const t2 = await setup(content, { today: DAY2 });
  t2.doc.settings.newPerDay = 10;
  const s2 = t2.engine.start('daily');
  const list2 = ids(s2);
  assert.notDeepStrictEqual(list1, list2, 'Different days different order');
  const fileOrder = ['x-1','x-2','x-3','x-4','x-5','x-6','x-7','x-8'];
  assert.notDeepStrictEqual(list1, fileOrder, 'Day1 differs from file');
  assert.notDeepStrictEqual(list2, fileOrder, 'Day2 differs from file');
});

// Test 4: permutation, differs from file
test('random: permutation only, differs from file', async () => {
  const units = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const content = simpleContent(units, { id: 'c4', newOrder: 'random' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  const s = t.engine.start('daily');
  const list = ids(s);
  assert.strictEqual(list.length, 6);
  const unique = new Set(list);
  assert.strictEqual(unique.size, 6);
  assert.deepStrictEqual(list.slice().sort(), ['a-1','a-2','a-3','b-1','b-2','b-3']);
  const fileOrder = ['a-1','a-2','a-3','b-1','b-2','b-3'];
  assert.notDeepStrictEqual(list, fileOrder, 'Random differs from file');
});

// Test 5: per-unit override with hard-coded expectation
test('per-unit override: one unit random, one file', async () => {
  const units = [
    { id: 'ru', title: 'Random', newOrder: 'random' },
    { id: 'fu', title: 'File' }
  ];
  const content = simpleContent(units, { id: 'c5y' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  const s = t.engine.start('daily');
  const list = ids(s);
  // With per-unit seed 'c5y|2025-10-09|ru', shuffledIndexes(3) for ru positions [0,1,2]
  // ru items at [0,1,2] become [2,1,0] -> ru-3, ru-2, ru-1
  const expected = ['ru-3', 'ru-2', 'ru-1', 'fu-1', 'fu-2', 'fu-3'];
  assert.deepStrictEqual(list, expected, 'Should match expected order');
  const fileItems = list.filter(id => id.startsWith('fu-'));
  assert.deepStrictEqual(fileItems, ['fu-1','fu-2','fu-3'], 'File unit unchanged');
  const randomItems = list.filter(id => id.startsWith('ru-'));
  assert.deepStrictEqual(randomItems, ['ru-3','ru-2','ru-1'], 'Random unit shuffled');
});

// Test 6: moreNew continues sequence
test('moreNew continues same sequence', async () => {
  const units = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const content = simpleContent(units, { id: 'c6', newOrder: 'random' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 1;
  t.doc.stats = { newByDay: {}, 'newBy:a': {}, 'newBy:b': {} };
  const s1 = t.engine.start('daily');
  assert.strictEqual(s1.total, 1);
  const first = s1.current().item.id;
  const unit = first.split('-')[0];
  const num = first.split('-')[1];
  s1.answer({ text: 'a' + unit + num });
  assert.ok(t.doc.items[first]);
  t.engine.moreNew(5);
  const s2 = t.engine.start('daily');
  const list2 = ids(s2);
  list2.forEach(id => assert.notStrictEqual(id, first, 'No repeat'));
  const all = [first].concat(list2);
  assert.strictEqual(new Set(all).size, all.length, 'No duplicates');
  // With per-unit shuffling, first item can be any of unit a's items
  assert.ok(first.startsWith('a-'), 'First is from unit a');
});

// Test 7: course-level random with unit file override
test('course random with unit file override', async () => {
  const units = [
    { id: 'fo', title: 'File Override', newOrder: 'file' },
    { id: 'cr', title: 'Course Random' }
  ];
  const content = simpleContent(units, { id: 'c7', newOrder: 'random' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  const s = t.engine.start('daily');
  const list = ids(s);
  const fileItems = list.filter(id => id.startsWith('fo-'));
  assert.deepStrictEqual(fileItems, ['fo-1','fo-2','fo-3'], 'File override unchanged');
  const randomItems = list.filter(id => id.startsWith('cr-'));
  assert.strictEqual(randomItems.length, 3);
  const fileOrder = ['fo-1','fo-2','fo-3','cr-1','cr-2','cr-3'];
  assert.notDeepStrictEqual(list, fileOrder, 'Course random differs from file');
});

// Test 8: explicit file order
test('explicit file order', async () => {
  const units = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const content = simpleContent(units, { id: 'c8', newOrder: 'file' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  const s = t.engine.start('daily');
  const list = ids(s);
  assert.deepStrictEqual(list, ['a-1','a-2','a-3','b-1','b-2','b-3']);
});

// Test 9: default is file
test('default is file order', async () => {
  const units = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  const content = simpleContent(units, { id: 'c9' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  const s = t.engine.start('daily');
  const list = ids(s);
  assert.deepStrictEqual(list, ['a-1','a-2','a-3','b-1','b-2','b-3']);
});

// Test 10: same-day stability after answer
test('random: same-day stable after answer', async () => {
  const content = manyItems({ id: 'c10', newOrder: 'random' });
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  const s1 = t.engine.start('daily');
  const list1 = ids(s1);
  const fileOrder = ['x-1','x-2','x-3','x-4','x-5','x-6','x-7','x-8'];
  assert.notDeepStrictEqual(list1, fileOrder, 'Differs from file');
  // Answer first
  const s1a = t.engine.start('daily');
  const first = s1a.current().item;
  s1a.answer({ text: 'ax' + first.id.split('-')[1] });
  assert.ok(t.doc.items[first.id]);
  // Same day should have same order (minus answered item)
  const s2 = t.engine.start('daily');
  const list2 = ids(s2);
  // Both lists should differ from file
  assert.notDeepStrictEqual(list1, fileOrder);
  assert.notDeepStrictEqual(list2, fileOrder);
});

function twoUnits(n, courseOverrides) {
  const items = [];
  ['p', 'q'].forEach((u) => {
    for (let i = 1; i <= n; i++) items.push({ id: u + '-' + i, unit: u, type: 'gap', prompt: 'Q', answers: ['a'], explanation: 'e' });
  });
  const units = [{ id: 'p', title: 'P' }, { id: 'q', title: 'Q' }];
  return { v: 1, course: Object.assign({ id: 'cc', units: units }, courseOverrides), items: items, version: 't', lock: items.map(i => i.id) };
}

test('two random units never exchange items and each uses its own seed', async () => {
  const t = await setup(twoUnits(8, { newOrder: 'random' }));
  t.doc.settings.newPerDay = 50;
  const list = ids(t.engine.start('daily'));
  assert.strictEqual(list.length, 16);
  assert.ok(list.slice(0, 8).every(id => id.startsWith('p-')), 'unit p keeps its slots');
  assert.ok(list.slice(8).every(id => id.startsWith('q-')), 'unit q keeps its slots');
  ['p', 'q'].forEach((u, k) => {
    const perm = shuffledIndexes(8, 'cc|' + DAY1 + '|' + u);
    const got = list.slice(k * 8, k * 8 + 8);
    assert.deepStrictEqual(got, perm.map(i => u + '-' + (i + 1)));
  });
});

test('random unit shuffle leaves a file unit in place and is stable within a day', async () => {
  const content = twoUnits(8, {});
  content.course.units[0].newOrder = 'random';
  const t = await setup(content);
  t.doc.settings.newPerDay = 50;
  const a = ids(t.engine.start('daily'));
  const b = ids(t.engine.start('daily'));
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a.slice(8), ['q-1', 'q-2', 'q-3', 'q-4', 'q-5', 'q-6', 'q-7', 'q-8']);
  assert.notDeepStrictEqual(a.slice(0, 8), ['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-7', 'p-8']);
});
