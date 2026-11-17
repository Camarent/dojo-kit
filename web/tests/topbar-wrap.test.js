'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(web, 'styles', 'app.css'), 'utf8');

// Top-level `.topbar` rules only: the selector must start its line.
const TOPBAR_RULE = /^\.topbar \{([^}]*)\}/gm;

function topbarRules() {
  const out = [];
  let m;
  while ((m = TOPBAR_RULE.exec(css)) !== null) out.push(m[1]);
  return out;
}

test('app.css has one .topbar rule (no duplicate)', () => {
  assert.strictEqual(topbarRules().length, 1);
});

test('.topbar lets its children wrap instead of clipping at 390px', () => {
  const [body] = topbarRules();
  assert.match(body, /flex-wrap:\s*wrap\b/);
});
