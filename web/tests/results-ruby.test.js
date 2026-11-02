'use strict';
// Mutation: drop renderText around r.expected / label(r, r.given) in Results -> both tests fail.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const item = { id: 'g1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['{川|かわ}で{泳|およ}ぐ'] };
const tr = (k) => k;

async function render(review) {
  const m = await H.mount({ items: [item], course: { id: 'c', title: 'C', uiLanguage: 'en', markup: 'ruby', units: [{ id: 'u1', title: 'U' }] } });
  m.sb.DojoExt.use('ruby');
  const summary = { raw: 0, total: 1, pct: 0, durationMs: 0, review, skipped: [] };
  return m.sb.DojoApp._Results({ t: tr, byId: { g1: item }, go() {}, onAgain() {}, summary });
}
const types = (n) => { const r = []; H.walk(n, (x) => r.push(x.type)); return r; };

test('results mistakes render expected and given answers as ruby, not raw markup', async () => {
  const v = await render([{ id: 'g1', correct: false, given: '{泳|およ}って', expected: '{川|かわ}で{泳|およ}ぐ' }]);
  const li = H.find(v, 'missed-g1');
  assert.ok(li);
  assert.ok(types(li).includes('ruby'), 'ruby element');
  const txt = H.text(li);
  assert.ok(!/[{|}]/.test(txt), 'no raw markup: ' + txt);
});

test('results keep plain answers and escape them (no raw html)', async () => {
  const v = await render([{ id: 'g1', correct: false, given: '<b>x</b>', expected: 'plain' }]);
  const li = H.find(v, 'missed-g1');
  assert.ok(H.text(li).includes('<b>x</b>'));
  assert.ok(!types(li).includes('b'));
});
