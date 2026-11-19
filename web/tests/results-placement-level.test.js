'use strict';
// Mutation: dropping `sum.level` from the placement branch in ui/results.js fails the first test.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const item = { id: 'n1', unit: 'u1', type: 'numeric', prompt: 'How many?', answer: 87 };
const course = { units: [{ id: 'u1', title: 'U1' }] };

async function render(extra) {
  const m = await H.mount({ items: [item], course });
  const summary = Object.assign({ mode: 'placement', raw: 0, total: 1, pct: 0, durationMs: 0, review: [], skipped: [], fraction: 0, correct: 0, answered: 1 }, extra);
  return { m, v: m.sb.DojoApp._Results({ t: m.t, byId: { n1: item }, stimuli: [], course: { id: 'c', title: 'C', uiLanguage: 'en' }, go() {}, onAgain() {}, summary }) };
}

test('placement result shows the level reached when known', async () => {
  const { v } = await render({ level: 'N4' });
  assert.strictEqual(H.text(H.find(v, 'placement-level')), 'Level reached: N4');
});

test('placement result has no level line when level is unknown', async () => {
  const { v } = await render({});
  assert.ok(H.find(v, 'placement-result'));
  assert.strictEqual(H.find(v, 'placement-level'), null);
});
