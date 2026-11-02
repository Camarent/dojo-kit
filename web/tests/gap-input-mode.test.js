'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

function loadType(typeName) {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', `types/${typeName}.js`] });
  return sb.DojoTypes.get(typeName);
}

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

function gapInputFor(item) {
  const def = loadType('gap');
  const props = { item, view: {}, result: null, exam: false, t, state: { text: '' }, setState: () => {}, onSubmit: () => {}, inputRef: null };
  return findTestId(def.Question(props), 'gap-input');
}

test('gap input carries inputmode="numeric" when item.inputMode is numeric', () => {
  const input = gapInputFor({ id: 'g1', inputMode: 'numeric' });
  assert.ok(input, 'gap-input should exist');
  assert.strictEqual(input.props.inputmode, 'numeric');
});

test('gap input has no inputmode attribute when item.inputMode is absent', () => {
  const input = gapInputFor({ id: 'g1' });
  assert.ok(input, 'gap-input should exist');
  assert.ok(!('inputmode' in input.props) || input.props.inputmode == null,
    'gap input should carry no inputmode attribute');
});
