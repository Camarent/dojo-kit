'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ruleFor } = require('./css-helpers');

const web = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(web, 'styles/app.css'), 'utf8');

test('results play row: results qline centres items vertically', () => {
  const rule = ruleFor(css, '[data-testid="results"] .qline');
  assert.ok(rule, 'rule results qline exists');
  assert.match(rule.declarations, /align-items:\s*center/);
});

test('results play row: selector targets real markup', () => {
  const src = fs.readFileSync(path.join(web, 'ui/results.js'), 'utf8');
  assert.match(src, /<main class="screen" data-testid="results">/);
  assert.match(src, /<p class="qline"/);
});

test('results play row: base .qline stays flex-start', () => {
  const rule = ruleFor(css, '.qline');
  assert.ok(rule, 'rule .qline exists');
  assert.match(rule.declarations, /align-items:\s*flex-start/);
});
