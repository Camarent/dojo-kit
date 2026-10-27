'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const item = { id: 'g1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['x'] };
const summary = { mode: 'practice', raw: 1, total: 2, pct: 50, durationMs: 0, review: [], skipped: [], fraction: 0.5, correct: 1, answered: 2 };

test('results screen shows the notice when again cannot start a session', async () => {
  const m = await H.mount({ items: [item] });
  const v = H.expand(m.sb.DojoApp._Results({ t: m.t, byId: { g1: item }, go() {}, onAgain() {}, summary, notice: 'Нет подходящих заданий.' }));
  const n = H.find(v, 'notice');
  assert.ok(n, 'notice node not rendered');
});

test('results screen renders no notice when notice is null', async () => {
  const m = await H.mount({ items: [item] });
  const v = H.expand(m.sb.DojoApp._Results({ t: m.t, byId: { g1: item }, go() {}, onAgain() {}, summary, notice: null }));
  assert.equal(H.find(v, 'notice'), null);
});
