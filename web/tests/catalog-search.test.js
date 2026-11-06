'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');
const RU = JSON.parse(H.read('i18n/ru.json'));

const gap = (id, unit, extra) => Object.assign({ id, unit, type: 'gap', prompt: 'Prompt ' + id, answers: ['ans' + id] }, extra);

async function open(items, o) {
  const m = await H.mount(Object.assign({ items }, o));
  if (o && o.markup) m.sb.DojoExt.use(o.markup);
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  return { m, cat, ids: () => H.findAll(cat.view(), /^topic-(?!state-|mastery-|label-)/).map((n) => n.props['data-testid'].slice(6)), count: () => H.text(H.find(cat.view(), 'catalog-count')), empty: () => H.find(cat.view(), 'catalog-empty'), search: () => H.find(cat.view(), 'catalog-search') };
}

test('reading found when stored in nested meta', async () => {
  const c = await open([
    gap('a', 'u1', { meta: { a: [{ k: 'dore' }] } }),
    gap('b', 'u1', { meta: { x: { y: ['kare'] } } })
  ]);
  c.cat.filter({ search: 'dore' });
  assert.deepStrictEqual(c.ids(), ['a']);
  c.cat.filter({ search: 'kare' });
  assert.deepStrictEqual(c.ids(), ['b']);
});

test('reading found when in markup prompt {base|reading}', async () => {
  const c = await open([
    gap('a', 'u1', { prompt: '{Kanji|dore}' }),
    gap('b', 'u1', { prompt: 'He {Kare|kare}' })
  ], { markup: 'ruby' });
  c.cat.filter({ search: 'dore' });
  assert.deepStrictEqual(c.ids(), ['a']);
  c.cat.filter({ search: 'kare' });
  assert.deepStrictEqual(c.ids(), ['b']);
});

test('query with no match shows catalog-empty; empty query does not', async () => {
  const c = await open([gap('a', 'u1')]);
  
  // Empty query should not show empty message
  assert.strictEqual(c.empty(), null);
  
  // Query with no match should show empty message
  c.cat.filter({ search: 'zzqx' });
  assert.ok(c.empty());
  assert.ok(/Nothing found/.test(H.text(c.empty())));
});

test('query with no match shows catalog-empty in Russian', async () => {
  const c = await open([gap('a', 'u1')], { lang: 'ru' });
  
  // Empty query should not show empty message
  assert.strictEqual(c.empty(), null);
  
  // Query with no match should show empty message in Russian
  c.cat.filter({ search: 'zzqx' });
  assert.ok(c.empty());
  assert.ok(H.text(c.empty()).includes(RU['catalog.empty']));
});

test('placeholder is non-empty in English', async () => {
  const c = await open([gap('a', 'u1')]);
  const placeholder = c.search().props.placeholder;
  assert.ok(placeholder && placeholder.trim() !== '', 'Placeholder should be non-empty');
  assert.strictEqual(placeholder, 'Search by word, reading or meaning...');
});

test('placeholder is non-empty in Russian', async () => {
  const c = await open([gap('a', 'u1')], { lang: 'ru' });
  const placeholder = c.search().props.placeholder;
  assert.ok(placeholder && placeholder.trim() !== '', 'Placeholder should be non-empty');
  assert.strictEqual(placeholder, RU['catalog.search']);
});

test('catalog empty message does not contain undefined or object strings', async () => {
  const c = await open([gap('a', 'u1')]);
  c.cat.filter({ search: 'zzqx' });
  const text = H.text(c.cat.view());
  assert.ok(!/undefined/.test(text), 'Should not contain undefined');
  assert.ok(!/\{/.test(text), 'Should not contain {');
  assert.ok(!/\[object/.test(text), 'Should not contain [object');
});
