'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

test('group card shows due, new and not-started progress counts', () => {
  const sb = H.loadApp();
  const t = (k, v) => k + (v && v.n !== undefined ? ':' + v.n : '');
  const group = { id: 'g1', title: 'G', due: 3, newToday: 2, fresh: 5, total: 9 };
  const tree = H.expand(sb.DojoGroupCard.GroupCard({ t, group, tagLabels: {}, onGroupSetting() {}, onStart() {}, onMoreNew() {} }));
  assert.strictEqual(H.text(H.find(tree, 'group-g1-due')), 'home.group.stat.due 3');
  assert.strictEqual(H.text(H.find(tree, 'group-g1-new')), 'home.group.stat.new 2');
  assert.strictEqual(H.text(H.find(tree, 'group-g1-notstarted')), 'home.group.notStarted:5');
});
