'use strict';
// order, match and multi Question views must render through ui/answer-block.js (its slot classes).
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');
const { makeT } = require('./type-match.helpers.js');

function loadAll() {
  const sandbox = { console: console, document: {} };
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ui/answer-block.js', 'types/registry.js', 'types/order.js', 'types/match.js', 'types/multi.js'] });
  return sandbox;
}

// Every props.class string in a vnode tree.
function classesIn(node, out) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => classesIn(n, out)); return out; }
  if (node.props) {
    if (typeof node.props.class === 'string') out.add(node.props.class);
    classesIn(node.props.children, out);
  }
  return out;
}

const BLOCK_SLOTS = ['ab-prompt', 'ab-fields', 'ab-submit'];

function assertBlock(vnode, label) {
  const classes = classesIn(vnode, new Set());
  for (const slot of BLOCK_SLOTS) {
    assert.ok(classes.has(slot), `${label} renders the answer-block slot ${slot}`);
  }
}

const noop = () => {};

test('order Question (list and sentence) renders through answer-block', () => {
  const sandbox = loadAll();
  const def = sandbox.DojoTypes.get('order');
  const view = { steps: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
  const base = { view: view, result: null, exam: false, state: { placed: [], total: 2 }, setState: noop, onSubmit: noop, t: makeT() };
  assertBlock(def.Question(base), 'order list');
  assertBlock(def.Question(Object.assign({}, base, { item: { prompt: '___ ___' } })), 'order sentence');
});

test('match Question renders through answer-block', () => {
  const sandbox = loadAll();
  const def = sandbox.DojoTypes.get('match');
  const view = {
    lefts: [{ label: 'A', id: 'a1' }],
    rights: [{ label: 'X', id: 'x1' }]
  };
  const vnode = def.Question({ view: view, result: null, exam: false, state: { mapping: [null] }, setState: noop, onSubmit: noop, t: makeT() });
  assertBlock(vnode, 'match');
});

test('multi Question renders through answer-block', () => {
  const sandbox = loadAll();
  const def = sandbox.DojoTypes.get('multi');
  const view = { options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }] };
  const vnode = def.Question({ view: view, result: null, exam: false, state: { selected: [] }, setState: noop, onSubmit: noop, t: makeT() });
  assertBlock(vnode, 'multi');
});
