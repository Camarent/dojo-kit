'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const css = read('styles/types-order.css');

test('.order-slot rule declares min-height: var(--tap)', () => {
  const slotMatch = css.match(/\.order-slot\s*\{[^}]*\}/);
  assert.ok(slotMatch, 'types-order.css should contain .order-slot rule');
  const slotRule = slotMatch[0];
  assert.ok(slotRule.includes('min-height: var(--tap)'),
    '.order-slot rule should contain min-height: var(--tap)');
});

test('.order-slot.empty has border with dashed', () => {
  const emptyMatch = css.match(/\.order-slot\.empty\s*\{[^}]*\}/);
  assert.ok(emptyMatch, 'types-order.css should contain .order-slot.empty rule');
  const emptyRule = emptyMatch[0];
  assert.ok(emptyRule.includes('dashed'),
    '.order-slot.empty rule should contain dashed in border');
});

test('.order.sentence .order-unplaced rule contains flex-wrap: wrap', () => {
  const poolMatch = css.match(/\.order\.sentence\s+\.order-unplaced\s*\{[^}]*\}/);
  assert.ok(poolMatch, 'types-order.css should contain .order.sentence .order-unplaced rule');
  const poolRule = poolMatch[0];
  assert.ok(poolRule.includes('flex-wrap: wrap'),
    '.order.sentence .order-unplaced rule should contain flex-wrap: wrap');
});
