'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const NOW = 1760000000000;
const gap = (id, unit, extra) => Object.assign({ id, unit, type: 'gap', prompt: 'Prompt ' + id, answers: ['ans' + id] }, extra);
const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

async function open(items, o) {
  const m = await H.mount(Object.assign({ items }, o));
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  return { m, cat, topics: () => H.findAll(cat.view(), /^topic-(?!state-|mastery-)/).map((n) => n.props['data-testid']), items: () => H.findAll(cat.view(), /^item-/).map((n) => n.props['data-testid']) };
}

test('The catalog never renders a per-item row for any unit', async () => {
  const items = [
    gap('a', 'u1'),
    gap('b', 'u1'),
    choice('c', 'u2', { entity: 'e1' }),
    choice('d', 'u2', { entity: 'e1' })
  ];
  const c = await open(items, { course: { units: [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }] } });
  assert.strictEqual(c.items().length, 0, 'No item rows should be rendered');
  assert.ok(c.topics().length > 0, 'Topic rows should be rendered');
});

test('The kanji tab rows show the kanji character and its meaning', async () => {
  const items = [
    gap('a', 'u1', { entity: 'kanji-1', meta: { title: '日 sun', kanji: '日', ru: 'sun' } }),
    gap('b', 'u1', { entity: 'kanji-2', meta: { title: '月 moon', kanji: '月', ru: 'moon' } })
  ];
  const c = await open(items, { course: { units: [{ id: 'u1', title: 'Kanji' }] } });
  const view = c.cat.view();
  const text = H.text(view);
  assert.ok(text.includes('日') && text.includes('sun'), 'Should show kanji and meaning for 日/sun');
  assert.ok(text.includes('月') && text.includes('moon'), 'Should show kanji and meaning for 月/moon');
});

test('Search finds an entity by its reading', async () => {
  const items = [
    gap('a', 'u1', { entity: 'kanji-1', meta: { kanji: '日', ru: 'ひ' } }),
    gap('b', 'u1', { entity: 'kanji-2', meta: { kanji: '月', ru: 'つき' } })
  ];
  const c = await open(items, { course: { units: [{ id: 'u1', title: 'Kanji' }] } });
  c.cat.filter({ search: 'ひ' });
  const found = c.topics().filter(id => id.startsWith('topic-kanji-1'));
  assert.strictEqual(found.length, 1, 'Should find entity by reading');
});

test('The stage filter applies to the entity', async () => {
  const items = [
    gap('a', 'u1', { entity: 'e1' }),
    gap('b', 'u1', { entity: 'e2' })
  ];
  const c = await open(items, { course: { units: [{ id: 'u1', title: 'U1' }] } });
  const cat = c.cat;
  
  c.m.doc.items['a'] = { s: 3, due: NOW + 10000, ok: 1, bad: 0, last: NOW - 1000 };
  c.m.doc.items['b'] = { s: 1, due: NOW + 10000, ok: 1, bad: 0, last: NOW - 1000 };
  
  cat.filter({ selectedStages: ['review'] });
  assert.ok(c.topics().some(id => id.includes('e1')), 'e1 (minStage=3) should be shown as review');
  assert.strictEqual(c.topics().filter(id => id.includes('e2')).length, 0, 'e2 (minStage=1) should be filtered out');
  
  cat.filter({ selectedStages: ['learning'] });
  assert.strictEqual(c.topics().filter(id => id.includes('e1')).length, 0, 'e1 (minStage=3) should be filtered out');
  assert.ok(c.topics().some(id => id.includes('e2')), 'e2 (minStage=1) should be shown as learning');
  
  cat.filter({ selectedStages: [] });
  assert.ok(c.topics().some(id => id.includes('e1')), 'e1 should be shown with no filter');
  assert.ok(c.topics().some(id => id.includes('e2')), 'e2 should be shown with no filter');
});

test('There is no mode-items chip', async () => {
  const c = await open([gap('a', 'u1')]);
  assert.strictEqual(H.find(c.cat.view(), 'mode-items'), null, 'mode-items chip should not exist');
  assert.strictEqual(H.find(c.cat.view(), 'catalog-mode'), null, 'catalog-mode container should not exist');
});
