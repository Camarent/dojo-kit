'use strict';
// Mutation coverage: combined level in groups.rs topic_levels (`min` over aspects) -> 'combined level is the minimum aspect level' fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const NOW = 1760000000000;
const rec = (s) => ({ s, due: NOW + 1e9, last: NOW - 1000, ok: s, bad: 0 });
const item = (id, tag) => ({ id, unit: 'u1', type: 'gap', entity: 'kanji-hon', tags: [tag], prompt: 'Prompt ' + id, answers: ['ans' + id] });
const KANJI = [item('k-m', 'meaning'), item('k-w', 'writing'), item('k-r', 'reading')];
const ASPECTS = [
  { id: 'meaning', tags: ['meaning'], title: 'Meaning' },
  { id: 'writing', tags: ['writing'], title: 'Writing' },
  { id: 'reading', tags: ['reading'], title: 'Reading' }
];
const COURSE = { id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u1', title: 'U1' }], topics: { aspects: ASPECTS } };

async function detailOf(course, items, records) {
  const m = await H.mount({ items, course, lang: 'en' });
  Object.assign(m.doc.items, records);
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  return cat.view();
}

test('topic levels: catalog card shows no per-aspect level rows, even with topics configured', async () => {
  const v = await detailOf(COURSE, KANJI, { 'k-m': rec(3), 'k-w': rec(1) });
  assert.ok(H.find(v, 'detail-answers'), 'positive control: card body renders');
  assert.strictEqual(H.find(v, 'topic-levels'), null, 'no topic-levels block on the card');
  for (const id of ['topic-level-meaning', 'topic-level-writing', 'topic-level-reading', 'topic-level-combined']) {
    assert.strictEqual(H.find(v, id), null, id + ' is not rendered on the card');
  }
});

test('topic levels: course without topics renders no block and no stage row on the card', async () => {
  const course = { id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u1', title: 'U1' }] };
  const v = await detailOf(course, KANJI, { 'k-m': rec(3) });
  assert.strictEqual(H.find(v, 'topic-levels'), null, 'no topic-levels block without course.topics');
  assert.strictEqual(H.find(v, 'detail-stage'), null, 'no detail-stage row on the card');
});
