'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

test('app.css .group-toggles .chip has min-height and min-width var(--tap)', () => {
  const css = read('styles/app.css');
  const match = css.match(/\.group-toggles \.chip\s*\{[^}]*\}/);
  assert.ok(match, 'app.css should contain .group-toggles .chip rule');
  const rule = match[0];
  assert.ok(rule.includes('min-height: var(--tap)'),
    '.group-toggles .chip should have min-height: var(--tap)');
  assert.ok(rule.includes('min-width: var(--tap)'),
    '.group-toggles .chip should have min-width: var(--tap)');
});
