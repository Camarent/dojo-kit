'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

function load() {
  const sandbox = { console };
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ui/answer-block.js', 'types/registry.js', 'types/gap.js'] });
  return sandbox.DojoTypes.get('gap');
}

// Find the first vnode with the given data-testid in the vnode tree.
function findTestId(vnode, testid) {
  if (!vnode || typeof vnode !== 'object') return null;
  if (vnode.props && vnode.props['data-testid'] === testid) return vnode;
  if (vnode.props && vnode.props.children) {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children];
    for (const child of children) {
      const found = findTestId(child, testid);
      if (found) return found;
    }
  }
  return null;
}

const t = (k) => k;

function render(def, state, extra) {
  const calls = [];
  const patches = [];
  const props = Object.assign({
    view: { unitLabel: null }, result: null, exam: false, t,
    state, setState: (p) => { patches.push(p); }, onSubmit: (...a) => { calls.push(a); },
    inputRef: null, item: {}
  }, extra || {});
  return { vnode: def.Question(props), calls, patches };
}

test('empty submit does not grade and sets the inline hint flag', () => {
  const def = load();
  const r = render(def, { text: '', emptyTried: false });
  const btn = findTestId(r.vnode, 'btn-submit');
  assert.ok(btn, 'btn-submit found');
  assert.ok(!btn.props.disabled, 'check button stays enabled when empty');
  btn.props.onClick();
  assert.strictEqual(r.calls.length, 0, 'empty submit must not call onSubmit');
  assert.strictEqual(JSON.stringify(r.patches), JSON.stringify([{ emptyTried: true }]));
});

test('whitespace-only submit is not graded', () => {
  const def = load();
  const r = render(def, { text: '   ', emptyTried: false });
  findTestId(r.vnode, 'btn-submit').props.onClick();
  assert.strictEqual(r.calls.length, 0);
});

test('inline hint shows after an empty submit', () => {
  const def = load();
  const before = render(def, { text: '', emptyTried: false });
  assert.strictEqual(findTestId(before.vnode, 'gap-empty'), null, 'no hint before submit');
  const after = render(def, { text: '', emptyTried: true });
  const line = findTestId(after.vnode, 'gap-empty');
  assert.ok(line, 'gap-empty hint rendered');
  assert.strictEqual(line.props.children, 'session.emptyAnswer');
});

test('typed answer is graded', () => {
  const def = load();
  const r = render(def, { text: '42', emptyTried: false });
  findTestId(r.vnode, 'btn-submit').props.onClick();
  assert.strictEqual(r.calls.length, 1, 'typed submit calls onSubmit once');
  assert.strictEqual(JSON.stringify(r.calls[0]), JSON.stringify([{ text: '42' }, '42']));
  assert.strictEqual(r.patches.length, 0);
});
