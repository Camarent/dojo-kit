'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

const sandbox = { console };
loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ui/answer-block.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js'] });
const t = (k) => k;

function find(node, pred, out) {
  out = out || [];
  if (Array.isArray(node)) node.forEach((c) => find(c, pred, out));
  else if (node && node.props) {
    if (pred(node)) out.push(node);
    find(node.props.children, pred, out);
  }
  return out;
}
const byTestId = (node, id) => find(node, (n) => n.props['data-testid'] === id);
const inSlot = (node, slot) => find(node, (n) => n.props.class === slot);

test('choice question renders through the answer block, options in the fields slot', () => {
  const def = sandbox.DojoTypes.get('choice');
  const view = { options: [{ index: 0, label: 'a' }, { index: 1, label: 'b' }] };
  const v = def.Question({ item: { answer: 0 }, view, result: null, picked: null, exam: false, t, onSubmit() {} });
  assert.strictEqual(v.props['data-testid'], 'choice');
  assert.strictEqual(v.props.class, 'choice');
  assert.strictEqual(byTestId(inSlot(v, 'ab-fields'), 'options').length, 1);
  assert.strictEqual(inSlot(v, 'ab-submit').length, 0);
});

test('gap question renders through the answer block; check button sits in the submit slot and submits', () => {
  const def = sandbox.DojoTypes.get('gap');
  const calls = [];
  const v = def.Question({ item: { answers: ['x'] }, state: { text: 'x' }, result: null, exam: false, t,
    setState() {}, inputRef() {}, onSubmit(input) { calls.push(input); } });
  assert.strictEqual(v.props['data-testid'], 'gap');
  assert.strictEqual(v.props.class, 'gap-block');
  assert.strictEqual(byTestId(inSlot(v, 'ab-fields'), 'gap-form').length, 1);
  const btn = byTestId(inSlot(v, 'ab-submit'), 'btn-submit');
  assert.strictEqual(btn.length, 1);
  btn[0].props.onClick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [{ text: 'x' }]);
});

test('card question renders through the answer block: back in fields, rating buttons in submit', () => {
  const def = sandbox.DojoTypes.get('card');
  const calls = [];
  const props = (back) => ({ view: { back }, result: null, t, onReveal() {}, onSubmit(input) { calls.push(input); } });
  const shown = def.Question(props('B'));
  assert.strictEqual(shown.props['data-testid'], 'card');
  assert.strictEqual(shown.props.class, 'card-slot');
  assert.strictEqual(byTestId(inSlot(shown, 'ab-fields'), 'card-back').length, 1);
  byTestId(shown, 'btn-known')[0].props.onClick();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [{ rating: 'known' }]);

  const hidden = def.Question(props(undefined));
  assert.strictEqual(hidden.props['data-testid'], 'card');
  assert.strictEqual(byTestId(inSlot(hidden, 'ab-submit'), 'btn-show').length, 1);
  assert.strictEqual(inSlot(hidden, 'ab-fields').length, 0);
});
