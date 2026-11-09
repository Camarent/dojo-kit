'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

test('app.css .dojo-credit a is a 44px tap target without growing the footer', () => {
  const css = read('styles/app.css');
  const matches = css.match(/^\.dojo-credit a \{[^}]*\}/gm) || [];
  assert.strictEqual(matches.length, 1, 'app.css should have exactly one .dojo-credit a rule');
  const rule = matches[0];
  assert.ok(rule.includes('display: inline-flex'), '.dojo-credit a should be inline-flex');
  assert.ok(rule.includes('align-items: center'), '.dojo-credit a should center its label');
  assert.ok(rule.includes('min-height: var(--tap)'), '.dojo-credit a should have min-height: var(--tap)');
  assert.ok(/margin-block: calc\(\(var\(--tap\) - 1lh\) \/ -2\)/.test(rule),
    '.dojo-credit a should cancel the extra height with a negative margin-block');
});
