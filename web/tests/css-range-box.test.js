'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(web, 'styles/app.css'), 'utf8');

test('range fields are border-box and capped at container width', () => {
  const m = css.match(/input\[type="range"\]\.field\s*\{([^}]*)\}/);
  assert.ok(m, 'rule input[type="range"].field exists');
  assert.match(m[1], /box-sizing:\s*border-box/);
  assert.match(m[1], /max-width:\s*100%/);
});
