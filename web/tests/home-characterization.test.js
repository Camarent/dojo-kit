'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

function render(group) {
  const sb = H.loadApp();
  const calls = [];
  const t = (k, v) => k + (v && v.tag !== undefined ? ':' + v.tag : '');
  const tree = H.expand(sb.DojoHome.GroupCard({ t, group, tagLabels: { x: 'Ex' }, onGroupSetting: (...a) => calls.push(a), onStart() {}, onMoreNew() {} }));
  return { tree, calls };
}
const inputOf = (label) => { let r = null; H.walk(label, (n) => { if (n.type === 'input') r = n; }); return r; };
const grp = { id: 'g1', title: 'G', extraNew: true, extraTags: ['x'] };

test('group toggles call onGroupSetting with the right key', () => {
  const { tree, calls } = render(grp);
  inputOf(H.find(tree, 'toggle-random-g1')).props.onChange();
  inputOf(H.find(tree, 'toggle-onlyTags-g1')).props.onChange();
  assert.deepStrictEqual(calls, [['g1', 'extraRandom', true], ['g1', 'onlyTags', true]]);
});

test('group toggles are unrendered without extraNew/extraTags', () => {
  const { tree } = render({ id: 'g2', title: 'G' });
  assert.strictEqual(H.find(tree, 'toggle-random-g2'), null);
  assert.strictEqual(H.find(tree, 'toggle-onlyTags-g2'), null);
});

test('group toggle checkboxes have id and aria-label equal to the visible text', () => {
  const { tree } = render(grp);
  const r = inputOf(H.find(tree, 'toggle-random-g1')).props;
  const o = inputOf(H.find(tree, 'toggle-onlyTags-g1')).props;
  assert.strictEqual(r.id, 'group-toggle-random-g1');
  assert.strictEqual(r['aria-label'], 'home.group.randomOrder');
  assert.strictEqual(o.id, 'group-toggle-onlyTags-g1');
  assert.strictEqual(o['aria-label'], 'home.group.onlyTags:Ex');
});
