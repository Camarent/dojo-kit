'use strict';
// Catalog card field rules (synthetic items only; ASCII source, Russian labels read from web/i18n/ru.json):
// (a) no internal progress fields (stage, topic levels, step, due, counts) on a card.
// (b) a declarative section with an empty body renders no heading.
// (c) a type `list` field renders <li> items with no separator text between or before them.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./app-harness.js');

const NOW = H.NOW;
const DAY = 24 * 60 * 60 * 1000;
const RU = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'ru.json'), 'utf8'));

const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

// Course with a declarative detail config and one unit; uiLanguage picks the UI strings.
function courseWithDetail(detailConfig, uiLanguage) {
  return {
    id: 'test-course',
    title: 'Test Course',
    uiLanguage: uiLanguage || 'en',
    units: [{ id: 'u1', title: 'Unit 1' }],
    detail: detailConfig
  };
}

// Mount a catalog screen, open the detail card of item 'a' and return its view tree.
async function openCard(item, course, lang) {
  const m = await H.mount({ items: [item], course, lang: lang || 'en' });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: item });
  return cat.view();
}

// Russian label text of each internal progress key, placeholders cut off (the step template loses its " {s}" tail).
// The stage label was removed from ru.json; it is kept as char codes so the source stays ASCII.
const INTERNAL_LABELS = [String.fromCharCode(0x421, 0x442, 0x430, 0x434, 0x438, 0x44f)]
  .concat(['catalog.topicLevels', 'catalog.topicLevel', 'catalog.step', 'catalog.due'].map((key) => RU[key].split(' {')[0]));

// Text of every <li> under a view node, in document order.
function liTexts(node) {
  const out = [];
  H.walk(node, (x) => { if (x.type === 'li') out.push(H.text(x)); });
  return out;
}

test('(a) catalog card shows no stage, level, step, due or counts rows for a record in ru', async () => {
  const item = choice('a', 'u1', { meta: {} });
  const m = await H.mount({ items: [item], course: courseWithDetail(null, 'ru'), lang: 'ru' });
  m.doc.items['a'] = { s: 3, due: NOW + 3 * DAY, ok: 3, bad: 5, last: NOW };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: item });
  const v = cat.view();
  const card = H.find(v, 'catalog-detail');
  assert.ok(card, 'card is open');
  const text = H.text(card);
  assert.ok(H.find(v, 'detail-answers'), 'positive control: answers row renders');
  for (const label of INTERNAL_LABELS) {
    assert.ok(!text.includes(label), 'card text has no internal label "' + label + '"');
  }
  assert.strictEqual(H.find(v, 'detail-stage'), null, 'no detail-stage row');
  assert.strictEqual(H.find(v, 'detail-step'), null, 'no detail-step row');
  assert.strictEqual(H.find(v, 'detail-due'), null, 'no detail-due row');
  assert.strictEqual(H.find(v, 'detail-counts'), null, 'no detail-counts row');
  assert.ok(!/✓ 3|✗ 5/.test(text), 'no ok/bad counts in card text');
});

test('(b) a declarative section with an empty body renders no heading', async () => {
  const course = courseWithDetail({
    fields: [
      { key: 'meta.irregular', label: 'Irregular', type: 'objects' },
      { key: 'meta.note', label: 'Note' }
    ]
  });
  const item = choice('a', 'u1', { meta: { irregular: {}, note: 'visible text' } });
  const v = await openCard(item, course);
  assert.ok(H.find(v, 'detail-field-meta.note'), 'positive control: non-empty field renders');
  assert.strictEqual(H.find(v, 'detail-field-meta.irregular'), null, 'empty section row is not rendered');
  assert.ok(!H.text(v).includes('Irregular'), 'empty section heading is not in card text');
});

test('(c) a list field renders list items with no separator text', async () => {
  const course = courseWithDetail({
    fields: [{ key: 'meta.similar', label: 'Similar', type: 'list' }]
  });
  const item = choice('a', 'u1', { meta: { similar: ['alpha', 'beta', 'gamma'] } });
  const v = await openCard(item, course);
  const list = H.find(v, 'detail-meta.similar-list');
  assert.ok(list, 'positive control: list renders');
  assert.deepStrictEqual(liTexts(list), ['alpha', 'beta', 'gamma'], 'one li per item, in order');
  assert.ok(!/[;,]/.test(H.text(list)), 'no ";" or "," separators in the list text');
});

test('(c) a list field with a single item renders one item and no separator', async () => {
  const course = courseWithDetail({
    fields: [{ key: 'meta.similar', label: 'Similar', type: 'list' }]
  });
  const item = choice('a', 'u1', { meta: { similar: ['alpha'] } });
  const v = await openCard(item, course);
  const list = H.find(v, 'detail-meta.similar-list');
  assert.ok(list, 'list renders');
  assert.deepStrictEqual(liTexts(list), ['alpha']);
  assert.strictEqual(H.text(list), 'alpha', 'no leading or trailing separator text');
});
