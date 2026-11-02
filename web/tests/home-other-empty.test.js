'use strict';
// Mutation coverage: dropping the byUnit total filter in renderOtherSection fails 'retired-only ungrouped unit is hidden'.
const test = require('node:test');
const assert = require('node:assert');
const { find, walk, mount, NOW } = require('./app-harness.js');

const DAY = 86400000;
function gap(id, unit, status) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e' };
  if (status) it.status = status;
  return it;
}
function hasId(tree, id) {
  let r = false;
  walk(tree, (n) => { if (n.props && n.props.id === id) r = true; });
  return r;
}
const ITEMS = [gap('g1', 'grammar'), gap('o1', 'other'), gap('r1', 'kana', 'retired'), gap('r2', 'kana', 'retired')];
const COURSE = {
  learnedStage: 1,
  units: [{ id: 'grammar', title: 'Grammar' }, { id: 'other', title: 'Other unit' }, { id: 'kana', title: 'Kana' }],
  groups: [{ id: 'gr', title: 'GR', units: ['grammar'], newPerDay: 1 }]
};
const due = { s: 0, due: NOW - DAY };

async function home(doc, items = ITEMS, course = COURSE) {
  const m = await mount({ items, course, lang: 'en', settings: {} });
  Object.assign(m.doc.items, doc);
  m.app.refresh();
  return m;
}

test('ungrouped unit with only retired items is not listed and the section is omitted', async () => {
  const items = [gap('g1', 'grammar'), gap('r1', 'kana', 'retired'), gap('r2', 'kana', 'retired')];
  const course = { learnedStage: 1, units: [{ id: 'grammar', title: 'Grammar' }, { id: 'kana', title: 'Kana' }],
    groups: [{ id: 'gr', title: 'GR', units: ['grammar'], newPerDay: 1 }] };
  const m = await home({ g1: due }, items, course);
  const tree = m.tree();
  assert.strictEqual(find(tree, 'unit-kana'), null);
  assert.strictEqual(find(tree, 'other-units'), null);
  assert.strictEqual(hasId(tree, 'other-title'), false);
});

test('ungrouped unit with active items is still listed', async () => {
  const m = await home({ g1: due, o1: due });
  const tree = m.tree();
  assert.ok(find(tree, 'other-units'));
  assert.strictEqual(hasId(tree, 'other-title'), true);
  assert.ok(find(tree, 'unit-other'));
});

test('mixed: only the unit with active items is listed', async () => {
  const m = await home({ g1: due, o1: due });
  const tree = m.tree();
  assert.ok(find(tree, 'unit-other'));
  assert.strictEqual(find(tree, 'unit-kana'), null);
});

test('course without groups: a unit with only retired items is not listed', async () => {
  const items = [gap('g1', 'grammar'), gap('r1', 'kana', 'retired'), gap('r2', 'kana', 'retired')];
  const course = { learnedStage: 1, units: [{ id: 'grammar', title: 'Grammar' }, { id: 'kana', title: 'Kana' }] };
  const m = await home({ g1: due }, items, course);
  const tree = m.tree();
  assert.notStrictEqual(find(tree, 'unit-grammar'), null);
  assert.strictEqual(find(tree, 'unit-kana'), null);
});
