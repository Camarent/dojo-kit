'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

const sb = { console };
loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'session/util.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js'] });
const common = sb.DojoCommon;

test('isActive: retired, active, missing status', () => {
  assert.strictEqual(common.isActive({ id: 'a', status: 'retired' }), false);
  assert.strictEqual(common.isActive({ id: 'b', status: 'active' }), true);
  assert.strictEqual(common.isActive({ id: 'c' }), true);
});

test('countActiveByUnit skips retired', () => {
  const by = common.countActiveByUnit([{ unit: 'u', status: 'retired' }, { unit: 'u' }]);
  assert.strictEqual(by.u.total, 1);
});
