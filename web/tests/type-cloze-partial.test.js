'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { load } = require('../dojo-wasm.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');
const { create } = require('../session/run-view.js');
const gradeMod = require('../session/grade.js');

const sandbox = { console };
loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ui/answer-block.js', 'types/registry.js', 'types/cloze.js'] });
const def = sandbox.DojoTypes.get('cloze');

const EN = {
  'session.partial': 'Partly correct', 'session.correct': 'Correct', 'session.wrong': 'Wrong',
  'session.timedOut': 'Time out', 'session.field.right': 'right', 'session.field.wrong': 'wrong',
  'q.result.blankRight': 'Blank right', 'q.result.blankWrong': 'Blank wrong',
};
const t = (key) => EN[key] || key;

// Three blanks: 'Paris', 'Rome', 'Oslo'.
const ITEM = { id: 'cp3', type: 'cloze', parts: ['Capitals: ', ['Paris'], ', ', ['Rome'], ', ', ['Oslo'], ''] };

// Collects the aria-label of every cloze mark, in document order.
function markLabels(node, out) {
  if (Array.isArray(node)) { node.forEach((n) => markLabels(n, out)); return out; }
  if (node && typeof node === 'object') {
    const cls = node.props && node.props.class;
    if (typeof cls === 'string' && cls.includes('cloze-mark')) out.push(node.props['aria-label']);
    markLabels(node.props && node.props.children, out);
  }
  return out;
}

async function graderFor() {
  const real = await load(fs.readFileSync(checkWasmFresh()).toString('base64'));
  return gradeMod.create({ dojo: real, fn: { normalizeOpts: (item) => item.opts || {} } }, { session: { id: 's1' } });
}

function questionFor(result, inputs) {
  return def.Question({
    t,
    exam: false,
    result,
    state: { inputs },
    view: create({}, { session: { id: 's1' } }).viewFor(ITEM),
  });
}

test('2 of 3 right: partial verdict, not wrong', async () => {
  const g = await graderFor();
  const r = g.gradeInput(ITEM, { inputs: ['Paris', 'Rome', 'X'] });
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.detail.partial, true);
  assert.deepStrictEqual(r.detail.results, [true, true, false]);
  assert.strictEqual(def.verdict({ ...r, timedOut: false }, t), 'Partly correct');
});

test('2 of 3 right: three field marks with right, right, wrong classes and session.field labels', async () => {
  const g = await graderFor();
  const inputs = ['Paris', 'Rome', 'X'];
  const r = g.gradeInput(ITEM, { inputs });
  const labels = markLabels(questionFor(r, inputs), []);
  assert.deepStrictEqual(labels, ['right', 'right', 'wrong']);
});

test('0 of 3 right: wrong verdict, not partial', async () => {
  const g = await graderFor();
  const r = g.gradeInput(ITEM, { inputs: ['X', 'Y', 'Z'] });
  assert.strictEqual(r.detail.partial, false);
  assert.strictEqual(def.verdict({ ...r, timedOut: false }, t), 'Wrong');
});

test('3 of 3 right: correct verdict, not partial, blank-result labels', async () => {
  const g = await graderFor();
  const inputs = ['Paris', 'Rome', 'Oslo'];
  const r = g.gradeInput(ITEM, { inputs });
  assert.strictEqual(r.correct, true);
  assert.strictEqual(r.detail.partial, false);
  assert.strictEqual(def.verdict({ ...r, timedOut: false }, t), 'Correct');
  assert.deepStrictEqual(markLabels(questionFor(r, inputs), []), ['Blank right', 'Blank right', 'Blank right']);
});
