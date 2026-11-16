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

const EN = { 'session.partial': 'Partly correct', 'session.correct': 'Correct', 'session.wrong': 'Wrong', 'session.timedOut': 'Time out' };
const t = (key) => EN[key] || key;

// Two blanks: first is 'Paris', second is 'Rome'. The learner types Paris and X.
const ITEM = { id: 'cp1', type: 'cloze', parts: ['Capital: ', ['Paris'], ' and ', ['Rome'], ''] };

function classesOf(node, out) {
  if (Array.isArray(node)) { node.forEach((n) => classesOf(n, out)); return out; }
  if (node && typeof node === 'object') {
    const cls = node.props && (node.props.class || node.props.className);
    if (typeof cls === 'string' && cls.includes('cloze-field')) out.push(cls);
    classesOf(node.props && node.props.children, out);
  }
  return out;
}

async function graderFor() {
  const real = await load(fs.readFileSync(checkWasmFresh()).toString('base64'));
  return gradeMod.create({ dojo: real, fn: { normalizeOpts: (item) => item.opts || {} } }, { session: { id: 's1' } });
}

test('one blank right: grade is partial, not correct, marks agree with the verdict', async () => {
  const g = await graderFor();
  const r = g.gradeInput(ITEM, { inputs: ['Paris', 'X'] });
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.detail.partial, true);
  assert.deepStrictEqual(r.detail.results, [true, false]);
  assert.strictEqual(def.verdict({ ...r, timedOut: false }, t), 'Partly correct');
});

test('feedback shows the partial verdict and one right and one wrong mark', async () => {
  const g = await graderFor();
  const r = g.gradeInput(ITEM, { inputs: ['Paris', 'X'] });
  const p = {
    t,
    exam: false,
    result: r,
    state: { inputs: ['Paris', 'X'] },
    view: create({}, { session: { id: 's1' } }).viewFor(ITEM)
  };
  const classes = classesOf(def.Question(p), []);
  const right = classes.filter((c) => c.includes('right')).length;
  const wrong = classes.filter((c) => c.includes('wrong')).length;
  assert.strictEqual(right, 1, classes.join(' | '));
  assert.strictEqual(wrong, 1, classes.join(' | '));
});

test('both right is correct and not partial; both wrong is neither', async () => {
  const g = await graderFor();
  const both = g.gradeInput(ITEM, { inputs: ['Paris', 'Rome'] });
  assert.strictEqual(both.correct, true);
  assert.strictEqual(both.detail.partial, false);
  assert.strictEqual(def.verdict(both, t), 'Correct');
  const none = g.gradeInput(ITEM, { inputs: ['X', 'Y'] });
  assert.strictEqual(none.detail.partial, false);
  assert.strictEqual(def.verdict(none, t), 'Wrong');
});

test('partial takes the SRS wrong path: stored record drops by dropOnWrong', async () => {
  const g = await graderFor();
  const r = g.gradeInput(ITEM, { inputs: ['Paris', 'X'] });
  const dojo = await load(fs.readFileSync(checkWasmFresh()).toString('base64'));
  const rec = { s: 3, ok: 1, bad: 0, due: 1000, last: 1000 };
  const out = dojo.call('applyAnswer', { rec, correct: r.correct, now: 1000, drop: 2 });
  assert.strictEqual(out.s, 1);
  assert.strictEqual(out.bad, 1);
});
