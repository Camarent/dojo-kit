'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { load } = require('../dojo-wasm.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');
const util = require('../session/util.js');
const gradeMod = require('../session/grade.js');

const EN = 'Also correct: {order}';
const sandbox = { console };
loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/order.js'] });
const def = sandbox.DojoTypes.get('order');

function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') return textOf(node.props && node.props.children);
  return node == null ? '' : String(node);
}
const t = (key, v) => (key === 'q.order.alsoCorrect' ? EN : 'First mistake at {n}').replace('{order}', v && v.order).replace('{n}', v && v.n);

async function setup(wrap) {
  const real = await load(fs.readFileSync(checkWasmFresh()).toString('base64'));
  const dojo = wrap ? { call: (n, a) => real.call(n, wrap(n, a)) } : real;
  const sx = { session: { id: 's1' } };
  return gradeMod.create({ dojo }, sx);
}
const base = { id: 'o1', type: 'order', steps: ['A', 'B', 'C'] };
function ids(item, orig) {
  const op = util.orderPerm(item.steps.length, 's1|' + item.id);
  return orig.map((o) => op.indexOf(o));
}

test('alt order grades correct with matched 0', async () => {
  const g = await setup();
  const item = { ...base, altOrders: [[1, 0, 2]] };
  const r = g.gradeInput(item, { sequence: ids(item, [1, 0, 2]) });
  assert.strictEqual(r.correct, true);
  assert.strictEqual(r.detail.matched, 0);
  assert.deepStrictEqual(r.detail.alsoCorrect, []);
});

test('wrong sequence: firstWrong and also-correct line, no raw keys', async () => {
  const g = await setup();
  const item = { ...base, altOrders: [[1, 0, 2]] };
  const r = g.gradeInput(item, { sequence: ids(item, [2, 1, 0]) });
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.detail.firstWrong, 0);
  assert.strictEqual(r.detail.alsoCorrect.length, 1);
  const text = textOf(def.Extra({ result: r, t }));
  assert.ok(text.includes('Also correct: 1. B; 2. A; 3. C'), text);
  assert.ok(!/q\.order|undefined/.test(text));
});

test('no altOrders behaves as before', async () => {
  const g = await setup();
  const ok = g.gradeInput(base, { sequence: ids(base, [0, 1, 2]) });
  assert.strictEqual(ok.correct, true);
  const bad = g.gradeInput(base, { sequence: ids(base, [0, 2, 1]) });
  assert.strictEqual(bad.correct, false);
  assert.strictEqual(bad.detail.firstWrong, 1);
  assert.deepStrictEqual(bad.detail, { firstWrong: 1 });
  const text = textOf(def.Extra({ result: bad, t }));
  assert.ok(!text.includes('Also correct'));
});

test('mutation: dropping altOrders makes the alt answer wrong', async () => {
  const g = await setup((n, a) => { if (n === 'checkOrder') { const c = { ...a }; delete c.altOrders; return c; } return a; });
  const item = { ...base, altOrders: [[1, 0, 2]] };
  const r = g.gradeInput(item, { sequence: ids(item, [1, 0, 2]) });
  assert.strictEqual(r.correct, false);
});
