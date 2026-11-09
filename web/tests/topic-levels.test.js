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

test('topic levels: one row per aspect (stage, new when never started) and combined min', async () => {
  const v = await detailOf(COURSE, KANJI, { 'k-m': rec(3), 'k-w': rec(1) });
  assert.ok(H.find(v, 'topic-levels'), 'topic-levels block rendered');
  assert.ok(/Meaning: 3/.test(H.text(H.find(v, 'topic-level-meaning'))), 'meaning row shows 3');
  assert.ok(/Writing: 1/.test(H.text(H.find(v, 'topic-level-writing'))), 'writing row shows 1');
  assert.ok(/Reading: New/.test(H.text(H.find(v, 'topic-level-reading'))), 'reading row shows new');
  assert.ok(/Combined level: 1/.test(H.text(H.find(v, 'topic-level-combined'))), 'combined level is min of recorded aspects: 1');
});

test('topic levels: course without topics renders no block; detail still shows stage', async () => {
  const course = { id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u1', title: 'U1' }] };
  const v = await detailOf(course, KANJI, { 'k-m': rec(3) });
  assert.strictEqual(H.find(v, 'topic-levels'), null, 'no topic-levels block without course.topics');
  assert.ok(H.find(v, 'detail-stage'), 'detail-stage still rendered');
});
