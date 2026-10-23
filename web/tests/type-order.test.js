'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

function load() {
  const sandbox = { console };
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/order.js'] });
  return sandbox;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const def = load().DojoTypes.get('order');
const view = { steps: [{ label: 'First', id: 'a' }, { label: 'Second', id: 'b' }, { label: 'Third', id: 'c' }] };
const T = {
  'q.order.hint': 'Tap in order', 'q.order.reset': 'Reset', 'q.order.position': 'Position {n}',
  'session.check': 'Check', 'q.result.firstWrong': 'First mistake at {n}'
};
const t = (key, vars) => T[key].replace('{n}', vars ? vars.n : '');

function find(node, testid, out) {
  out = out || [];
  if (node && typeof node === 'object') {
    if (Array.isArray(node)) node.forEach((c) => find(c, testid, out));
    else {
      if (node.props && node.props['data-testid'] === testid) out.push(node);
      if (node.props) find(node.props.children, testid, out);
    }
  }
  return out;
}
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') return textOf(node.props && node.props.children);
  return node == null ? '' : String(node);
}

function render(placed, extra) {
  const calls = { submitted: [], states: [] };
  const vnode = def.Question(Object.assign({
    view: view, result: null, picked: null, exam: false, t: t,
    state: { placed: placed, total: 3 },
    setState: (s) => calls.states.push(s),
    onSubmit: (input, picked) => calls.submitted.push([input, picked])
  }, extra));
  return { vnode: vnode, calls: calls };
}

test('initialState starts empty with the step count', () => {
  assert.deepStrictEqual(plain(def.initialState(view)), { placed: [], total: 3 });
});

test('canSubmit only when all steps are placed', () => {
  assert.strictEqual(def.canSubmit({ placed: ['a', 'b'], total: 3 }), false);
  assert.strictEqual(def.canSubmit({ placed: ['a', 'b', 'c'], total: 3 }), true);
});

test('unplaced items keep their display index and tapping places at the end', () => {
  const r = render(['b']);
  assert.strictEqual(find(r.vnode, 'order-item-1').length, 0);
  find(r.vnode, 'order-item-2')[0].props.onClick();
  assert.deepStrictEqual(plain(r.calls.states[0].placed), ['b', 'c']);
  assert.ok(find(r.vnode, 'order').length && find(r.vnode, 'order-reset').length);
});

test('placed items are numbered, labelled and tapping removes them', () => {
  const r = render(['c', 'a']);
  const first = find(r.vnode, 'order-placed-0')[0];
  assert.strictEqual(first.props['aria-label'], 'Position 1: Third');
  find(r.vnode, 'order-placed-0')[0].props.onClick();
  assert.deepStrictEqual(plain(r.calls.states[0].placed), ['a']);
  find(r.vnode, 'order-reset')[0].props.onClick();
  assert.deepStrictEqual(plain(r.calls.states[1].placed), []);
});

test('submit is disabled until complete and sends the sequence', () => {
  assert.strictEqual(find(render(['a']).vnode, 'btn-submit')[0].props.disabled, true);
  const r = render(['b', 'a', 'c']);
  const btn = find(r.vnode, 'btn-submit')[0];
  assert.strictEqual(btn.props.disabled, false);
  btn.props.onClick();
  assert.deepStrictEqual(plain(r.calls.submitted), [[{ sequence: ['b', 'a', 'c'] }, ['b', 'a', 'c']]]);
});

test('answered state is read-only and marks right/wrong by firstWrong', () => {
  const result = { correct: false, detail: { firstWrong: 1 } };
  const r = render(['a', 'c', 'b'], { result: result });
  ['order-placed-0', 'order-placed-1', 'order-placed-2', 'order-reset', 'btn-submit'].forEach((id) => {
    assert.strictEqual(find(r.vnode, id)[0].props.disabled, true, id);
  });
  assert.match(find(r.vnode, 'order-placed-0')[0].props.class, /right/);
  assert.match(find(r.vnode, 'order-placed-1')[0].props.class, /wrong/);
  assert.doesNotMatch(find(r.vnode, 'order-placed-2')[0].props.class, /right|wrong/);
});

test('all-right result marks every placed step right', () => {
  const r = render(['a', 'b', 'c'], { result: { correct: true, detail: { firstWrong: null } } });
  [0, 1, 2].forEach((k) => assert.match(find(r.vnode, 'order-placed-' + k)[0].props.class, /right/));
});

test('exam mode shows no right/wrong', () => {
  const r = render(['a', 'c', 'b'], { result: { recorded: true }, exam: true });
  [0, 1, 2].forEach((k) => assert.doesNotMatch(find(r.vnode, 'order-placed-' + k)[0].props.class, /right|wrong/));
});

test('Extra shows q.result.firstWrong with n = firstWrong + 1, nothing otherwise', () => {
  assert.strictEqual(textOf(def.Extra({ result: { detail: { firstWrong: 1 } }, t: t })), 'First mistake at 2');
  assert.strictEqual(def.Extra({ result: { detail: { firstWrong: null } }, t: t }), null);
  assert.strictEqual(def.Extra({ result: { recorded: true }, t: t }), null);
});

test('order.js does not use innerHTML', () => {
  assert.ok(!/innerHTML/.test(read('types/order.js')));
});

test('unknown placed id is skipped in list mode without throwing', () => {
  const r = render(['zzz', 'a']);
  assert.strictEqual(find(r.vnode, 'order-placed-0').length, 0);
  assert.strictEqual(find(r.vnode, 'order-placed-1')[0].props['aria-label'], 'Position 2: First');
});
