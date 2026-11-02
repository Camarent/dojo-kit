'use strict';
// Mutation coverage: dropping the active-item filter in CatalogScreen's tab list fails 'unit with only retired items gets no tab'.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, unit, status) => {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e' };
  if (status) it.status = status;
  return it;
};
const COURSE = { units: [{ id: 'grammar', title: 'Grammar' }, { id: 'other', title: 'Other unit' }, { id: 'kana', title: 'Kana' }] };

async function catalog(items, course = COURSE) {
  const m = await H.mount({ items, course, lang: 'en', settings: {} });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  const tabs = () => H.findAll(cat.view(), /^tab-/).map((n) => n.props['data-testid']);
  return { m, cat, tabs };
}

test('a unit with only retired items gets no tab', async () => {
  const items = [gap('g1', 'grammar'), gap('o1', 'other'), gap('r1', 'kana', 'retired'), gap('r2', 'kana', 'retired')];
  const c = await catalog(items);
  assert.deepStrictEqual(c.tabs(), ['tab-all', 'tab-grammar', 'tab-other']);
});

test('a unit with no items at all gets no tab', async () => {
  const c = await catalog([gap('g1', 'grammar')]);
  assert.deepStrictEqual(c.tabs(), ['tab-all', 'tab-grammar']);
});

test('the default selection is the first visible unit, so the list is not empty', async () => {
  const items = [gap('g1', 'grammar', 'retired'), gap('o1', 'other')];
  const c = await catalog(items);
  assert.deepStrictEqual(c.tabs(), ['tab-all', 'tab-other']);
  assert.strictEqual(c.cat.state.selectedUnit, 'other');
});
