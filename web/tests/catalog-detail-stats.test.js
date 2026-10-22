'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const NOW = H.NOW;
const DAY = 24 * 60 * 60 * 1000;

// Helper to create a simple choice item
const choice = (id, unit, extra) => Object.assign({ id, unit, type: 'choice', prompt: 'Prompt ' + id, options: ['a', 'b', 'c'], answer: 0 }, extra);

test('detail-step, detail-due, detail-counts are hidden when item has no record', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  assert.strictEqual(H.find(v, 'detail-step'), null, 'detail-step is not rendered when no record');
  assert.strictEqual(H.find(v, 'detail-due'), null, 'detail-due is not rendered when no record');
  assert.strictEqual(H.find(v, 'detail-counts'), null, 'detail-counts is not rendered when no record');
});

test('detail-due shows "сейчас" when due is in the past', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'ru' }, lang: 'ru' });
  m.doc.items['a'] = { s: 1, due: NOW - 1000, ok: 1, bad: 0, last: NOW - DAY };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const dueEl = H.find(v, 'detail-due');
  assert.ok(dueEl, 'detail-due is rendered');
  const dueText = H.text(dueEl);
  assert.ok(/сейчас/.test(dueText), 'detail-due shows "сейчас" for past due: ' + dueText);
});

test('detail-due shows "через N дн." when due is in the future', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'ru' }, lang: 'ru' });
  m.doc.items['a'] = { s: 1, due: NOW + 3 * DAY, ok: 1, bad: 0, last: NOW - DAY };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const dueEl = H.find(v, 'detail-due');
  assert.ok(dueEl, 'detail-due is rendered');
  const dueText = H.text(dueEl);
  assert.ok(/через 3/.test(dueText), 'detail-due shows "через 3 дн." for +3 days: ' + dueText);
});

test('detail-due shows "in N days" in English when due is in the future', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'en' }, lang: 'en' });
  m.doc.items['a'] = { s: 1, due: NOW + 3 * DAY, ok: 1, bad: 0, last: NOW - DAY };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const dueEl = H.find(v, 'detail-due');
  assert.ok(dueEl, 'detail-due is rendered');
  const dueText = H.text(dueEl);
  assert.ok(/in 3 days/.test(dueText), 'detail-due shows "in 3 days" for +3 days: ' + dueText);
});

test('detail-counts shows correct ok and bad counts', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } });
  m.doc.items['a'] = { s: 2, due: NOW + DAY, ok: 3, bad: 5, last: NOW };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const countsEl = H.find(v, 'detail-counts');
  assert.ok(countsEl, 'detail-counts is rendered');
  const countsText = H.text(countsEl);
  assert.ok(/✓ 3/.test(countsText), 'detail-counts shows ok=3: ' + countsText);
  assert.ok(/✗ 5/.test(countsText), 'detail-counts shows bad=5: ' + countsText);
});

test('detail-step shows stage number', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'ru' }, lang: 'ru' });
  m.doc.items['a'] = { s: 3, due: NOW + DAY, ok: 1, bad: 0, last: NOW };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const stepEl = H.find(v, 'detail-step');
  assert.ok(stepEl, 'detail-step is rendered');
  const stepText = H.text(stepEl);
  assert.ok(/Этап 3/.test(stepText), 'detail-step shows "Этап 3": ' + stepText);
});

test('detail-step shows interval text', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'ru' }, lang: 'ru' });
  m.doc.items['a'] = { s: 3, due: NOW + 3 * DAY, ok: 1, bad: 0, last: NOW };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const stepEl = H.find(v, 'detail-step');
  assert.ok(stepEl, 'detail-step is rendered');
  const stepText = H.text(stepEl);
  assert.ok(/Этап 3/.test(stepText), 'detail-step shows "Этап 3": ' + stepText);
  assert.ok(/через 3/.test(stepText), 'detail-step shows "через 3 дн.": ' + stepText);
});

test('screen text contains no undefined, {, or [object', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }] } });
  m.doc.items['a'] = { s: 3, due: NOW + 3 * DAY, ok: 3, bad: 1, last: NOW };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  
  const fullText = H.text(v);
  assert.ok(!/undefined/.test(fullText), 'no "undefined" in screen text');
  assert.ok(!/\{/.test(fullText), 'no "{" in screen text');
  assert.ok(!/\[object/.test(fullText), 'no "[object" in screen text');
});

test('detail-due uses singular for 1 day and rounds partial days up', async () => {
  const items = [choice('a', 'u1'), choice('b', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'ru' }, lang: 'ru' });
  m.doc.items['a'] = { s: 1, due: NOW + DAY, ok: 1, bad: 0, last: NOW - DAY };
  m.doc.items['b'] = { s: 1, due: NOW + DAY + 1000, ok: 1, bad: 0, last: NOW - DAY };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  assert.ok(/через 1 день/.test(H.text(H.find(cat.view(), 'detail-due'))), 'singular');
  cat.setState({ detailItem: items[1] });
  assert.ok(/через 2 дн/.test(H.text(H.find(cat.view(), 'detail-due'))), 'ceil to 2');
});

test('record without ok/bad/s renders no undefined', async () => {
  const items = [choice('a', 'u1')];
  const m = await H.mount({ items, course: { id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }], uiLanguage: 'ru' }, lang: 'ru' });
  m.doc.items['a'] = { due: NOW + DAY };
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.setState({ detailItem: items[0] });
  const v = cat.view();
  for (const id of ['detail-step', 'detail-due', 'detail-counts']) {
    assert.ok(!/undefined|NaN/.test(H.text(H.find(v, id))), id);
  }
});
