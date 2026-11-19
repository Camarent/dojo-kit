'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const item = { id: 'g1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['x'] };

async function render(summary) {
  const m = await H.mount({ items: [item] });
  return m.sb.DojoApp._Results({ t: m.t, byId: { g1: item }, go() {}, onAgain() {}, summary });
}

// Exam: 3 items, 1 answered correct, 2 never answered (not in review, not skipped).
test('exam results count unanswered items and do not say no errors', async () => {
  const v = await render({ mode: 'exam', raw: 1, total: 3, pct: 33, durationMs: 0, review: [{ id: 'g1', correct: true, given: 'x', expected: 'x' }], skipped: [], fraction: 0.33, correct: 1, answered: 1 });
  const un = H.find(v, 'results-unanswered');
  assert.ok(un, 'results-unanswered not found');
  assert.ok(H.text(un).includes('2'), `Expected count 2 in: ${H.text(un)}`);
  assert.strictEqual(H.find(v, 'no-missed'), null, 'no-missed must not show with unanswered items');
});

// Exam with every item answered: no unanswered line, the no-errors message stays.
test('exam results with all items answered show no unanswered line', async () => {
  const v = await render({ mode: 'exam', raw: 1, total: 1, pct: 100, durationMs: 0, review: [{ id: 'g1', correct: true, given: 'x', expected: 'x' }], skipped: [], fraction: 1, correct: 1, answered: 1 });
  assert.strictEqual(H.find(v, 'results-unanswered'), null);
  assert.ok(H.find(v, 'no-missed'), 'no-missed not found');
});

// Practice has no fixed total: an unfinished practice run is not counted as unanswered.
test('practice results never count unanswered items', async () => {
  const v = await render({ mode: 'practice', raw: 1, total: 3, pct: 33, durationMs: 0, review: [{ id: 'g1', correct: true, given: 'x', expected: 'x' }], skipped: [], fraction: 0.33, correct: 1, answered: 1 });
  assert.strictEqual(H.find(v, 'results-unanswered'), null);
});
