'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const NOW = H.NOW;
const DAY = 24 * 60 * 60 * 1000;

test('renderRecordStats returns null when there is no record', async () => {
  const m = await H.mount({ items: [], course: { id: 'c', title: 'C', units: [] } });
  assert.strictEqual(m.sb.DojoDetail.renderRecordStats(null, NOW, m.t), null);
  assert.strictEqual(m.sb.DojoDetail.renderRecordStats(undefined, NOW, m.t), null);
});

test('renderRecordStats shows dueNow and counts when record is due in the past', async () => {
  const m = await H.mount({ items: [], course: { id: 'c', title: 'C', units: [] } });
  const rec = { s: 2, due: NOW - 1000, ok: 3, bad: 1 };
  const v = H.expand(m.sb.DojoDetail.renderRecordStats(rec, NOW, m.t));
  assert.ok(H.text(H.find(v, 'detail-step')).includes(m.t('catalog.dueNow')), 'detail-step shows dueNow');
  assert.ok(H.text(H.find(v, 'detail-due')).includes(m.t('catalog.dueNow')), 'detail-due shows dueNow');
  assert.strictEqual(H.text(H.find(v, 'detail-counts')), m.t('catalog.counts', { ok: 3, bad: 1 }));
});

test('renderRecordStats shows dueIn when record is due in the future', async () => {
  const m = await H.mount({ items: [], course: { id: 'c', title: 'C', units: [] } });
  const rec = { s: 1, due: NOW + 3 * DAY, ok: 1, bad: 0 };
  const v = H.expand(m.sb.DojoDetail.renderRecordStats(rec, NOW, m.t));
  assert.ok(H.text(H.find(v, 'detail-due')).includes(m.t('catalog.dueIn', { n: 3 })), 'detail-due shows dueIn 3');
  assert.strictEqual(H.text(H.find(v, 'detail-counts')), m.t('catalog.counts', { ok: 1, bad: 0 }));
});
