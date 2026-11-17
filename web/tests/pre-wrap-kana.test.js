'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

// Body of the first rule whose selector text is exactly `selector` (e.g. '.pre {').
function ruleBody(css, selector) {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, 'rule missing: ' + selector);
  return css.slice(start, css.indexOf('}', start));
}

test('a: .pre keeps kana words whole (keep-all, break-word, no anywhere wrap)', () => {
  const body = ruleBody(read('styles/app.css'), '.pre');
  assert.match(body, /word-break:\s*keep-all/, '.pre needs word-break: keep-all');
  assert.match(body, /overflow-wrap:\s*break-word/, '.pre needs overflow-wrap: break-word');
  assert.doesNotMatch(body, /overflow-wrap:\s*anywhere/, '.pre must not wrap anywhere');
});
