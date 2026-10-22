'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

test('CSS: .catalog-detail-header .btn.icon rule exists with padding, white-space', () => {
  const css = read('styles/app.css');
  const ruleMatch = css.match(/\.catalog-detail-header \.btn\.icon\s*\{[^}]*\}/);
  assert.ok(ruleMatch, 'app.css should contain .catalog-detail-header .btn.icon rule');
  const rule = ruleMatch[0];
  
  assert.ok(rule.includes('padding:'),
    '.catalog-detail-header .btn.icon should have padding declaration');
  
  assert.ok(/padding:\s*0\s+var\(--space-\d+\)/.test(rule),
    '.catalog-detail-header .btn.icon padding should have horizontal component > 0 using var(--space-*)');
  
  assert.ok(rule.includes('white-space: nowrap'),
    '.catalog-detail-header .btn.icon should have white-space: nowrap');
});
