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

const def = load().DojoTypes.get('order');
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
function hasClass(node, name) {
  return String(node.props.class || '').split(' ').indexOf(name) >= 0;
}
function findClass(node, name, out) {
  out = out || [];
  if (node && typeof node === 'object') {
    if (Array.isArray(node)) node.forEach((c) => findClass(c, name, out));
    else {
      if (node.props && hasClass(node, name)) out.push(node);
      if (node.props) findClass(node.props.children, name, out);
    }
  }
  return out;
}
// Collect string leaves outside .order-star spans.
function plainText(node) {
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (node && typeof node === 'object') {
    if (node.props && hasClass(node, 'order-star')) return '';
    return plainText(node.props && node.props.children);
  }
  return node == null ? '' : String(node);
}

function render(placed, item, view, extra) {
  const calls = { states: [] };
  const vnode = def.Question(Object.assign({
    item: item,
    view: view,
    result: null,
    picked: null,
    exam: false,
    t: t,
    state: { placed: placed, total: view.steps.length },
    setState: (s) => calls.states.push(s),
    onSubmit: () => {}
  }, extra));
  return { vnode: vnode, calls: calls };
}

const steps = [{ label: 'One', id: 'a' }, { label: 'Two', id: 'b' }, { label: 'Three', id: 'c' }];
const view = { steps: steps };

test('star after slot 1 renders inside slot 1, not as loose text', () => {
  const item = { prompt: 'A ___ ___★ ___ B', type: 'order', steps: steps };
  const r = render([], item, view);
  const slot1 = find(r.vnode, 'order-slot-1')[0];
  assert.ok(slot1, 'slot 1 rendered');
  assert.strictEqual(findClass(slot1, 'order-star').length, 1, 'order-star inside slot 1');
  assert.ok(!plainText(find(r.vnode, 'prompt')[0]).includes('★'), 'no loose star text remains');
});

test('filled slot with star keeps testid and click-to-unplace works', () => {
  const item = { prompt: 'A ___ ___★ ___ B', type: 'order', steps: steps };
  const r = render(['a', 'b'], item, view);
  const slot1 = find(r.vnode, 'order-slot-1')[0];
  assert.ok(slot1, 'filled slot 1 keeps testid');
  assert.strictEqual(findClass(slot1, 'order-star').length, 1, 'star kept in filled slot');
  slot1.props.onClick();
  assert.strictEqual(r.calls.states.length, 1, 'click reported one state change');
  assert.deepStrictEqual(r.calls.states[0].placed, ['a'], 'slot 1 removed from placed');
});

test('prompt without star renders no order-star', () => {
  const item = { prompt: 'A ___ ___ ___ B', type: 'order', steps: steps };
  const r = render([], item, view);
  assert.strictEqual(findClass(r.vnode, 'order-star').length, 0);
});

test('star separated by a space stays plain text', () => {
  const item = { prompt: 'A ___ ★ ___ ___ B', type: 'order', steps: steps };
  const r = render([], item, view);
  assert.strictEqual(findClass(r.vnode, 'order-star').length, 0, 'no order-star');
  assert.ok(plainText(find(r.vnode, 'prompt')[0]).includes('★'), 'star kept as text');
});

test('CSS declares .order-star rule', () => {
  const css = read('styles/types-order.css');
  const m = css.match(/\.order-star\s*\{[^}]*\}/);
  assert.ok(m, 'types-order.css should contain .order-star rule');
  assert.ok(m[0].includes('position: absolute'), '.order-star is absolutely positioned');
});
