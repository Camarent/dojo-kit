'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const NOW = H.NOW;
const DAY = 24 * 60 * 60 * 1000;

// Helper to create a simple choice item
const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

// Catalog card rows that show learner progress internals; none may render on a catalog card.
const INTERNAL_IDS = ['detail-stage', 'detail-step', 'detail-due', 'detail-counts'];

async function openCard(rec, course) {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: course || { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'en' }, lang: 'en' });
  if (rec) m.doc.items['a'] = rec;
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  return cat.view();
}

test('catalog card hides stage, step, due and counts when item has no record', async () => {
  const v = await openCard(null);
  for (const id of INTERNAL_IDS) assert.strictEqual(H.find(v, id), null, id + ' is not rendered without record');
});

test('catalog card hides due row when due is in the past', async () => {
  const v = await openCard({ s: 1, due: NOW - 1000, ok: 1, bad: 0, last: NOW - DAY });
  assert.strictEqual(H.find(v, 'detail-due'), null, 'detail-due is not rendered for past due');
  assert.ok(!/now/.test(H.text(v)), 'no "now" due text on the card');
});

test('catalog card hides due row when due is in the future', async () => {
  const v = await openCard({ s: 1, due: NOW + 3 * DAY, ok: 1, bad: 0, last: NOW - DAY });
  assert.strictEqual(H.find(v, 'detail-due'), null, 'detail-due is not rendered for future due');
  assert.ok(!/in 3 days/.test(H.text(v)), 'no "in 3 days" due text on the card');
});

test('catalog card hides ok and bad counts', async () => {
  const v = await openCard({ s: 2, due: NOW + DAY, ok: 3, bad: 5, last: NOW });
  assert.strictEqual(H.find(v, 'detail-counts'), null, 'detail-counts is not rendered');
  assert.ok(!/✓ 3|✗ 5/.test(H.text(v)), 'no ok/bad counts on the card');
});

test('catalog card hides stage number and interval', async () => {
  const v = await openCard({ s: 3, due: NOW + 3 * DAY, ok: 1, bad: 0, last: NOW });
  assert.strictEqual(H.find(v, 'detail-step'), null, 'detail-step is not rendered');
  assert.ok(!/Stage 3|in 3 days/.test(H.text(v)), 'no stage number or interval on the card');
});

test('screen text contains no undefined, {, or [object', async () => {
  const v = await openCard({ s: 3, due: NOW + 3 * DAY, ok: 3, bad: 1, last: NOW });
  const fullText = H.text(v);
  assert.ok(!/undefined/.test(fullText), 'no "undefined" in screen text');
  assert.ok(!/\{/.test(fullText), 'no "{" in screen text');
  assert.ok(!/\[object/.test(fullText), 'no "[object" in screen text');
});

test('record without ok/bad/s renders the card without undefined or NaN', async () => {
  const v = await openCard({ due: NOW + DAY });
  for (const id of INTERNAL_IDS) assert.strictEqual(H.find(v, id), null, id);
  assert.ok(!/undefined|NaN/.test(H.text(v)), 'no undefined or NaN on the card');
});

test('detail without record does not call p.now and renders', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  const p = { t: (k) => k, engine: { record: () => null, expected: () => 'x', stage: () => 'new' }, now: () => { throw new Error('p.now called'); } };
  const real = cat.props || {};
  const base = Object.assign({}, real);
  assert.doesNotThrow(() => cat.renderDetail(Object.assign(base, p, { engine: Object.assign(Object.create(real.engine || null), p.engine) }), { }, p.t, items[0]));
});
