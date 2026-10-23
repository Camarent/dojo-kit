'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const css = read('styles/types-cloze.css');

function getFieldRule() {
  const lines = css.split('\n');
  const start = lines.findIndex(l => l.trim().startsWith('.cloze-field {'));
  const rule = [];
  let depth = 0;
  let found = false;
  for (let i = start; i < lines.length; i++) {
    for (const c of lines[i]) {
      if (c === '{') { depth++; found = true; }
      else if (c === '}') { depth--; }
    }
    rule.push(lines[i]);
    if (found && depth === 0) break;
  }
  return rule.join('\n');
}

test('.cloze-groups is one grid; .cloze-group uses display: contents (shared label column)', () => {
  assert.ok(/\.cloze-groups\s*\{[^}]*display: grid[^}]*grid-template-columns: max-content/.test(css));
  assert.ok(/\.cloze-group\s*\{[^}]*display: contents/.test(css));
});

test('cloze.js: reading inputs skip the inline width; inline blanks keep it', () => {
  const js = read('types/cloze.js');
  assert.ok(/style=\$\{fill \? null : \{ width:/.test(js));
  assert.ok(js.includes('renderBlank(seg.blank, true)'));
});

test('.cloze-field min-width is >= 10ch', () => {
  const rule = getFieldRule();
  assert.ok(rule.includes('min-width: 10ch'),
    '.cloze-field rule should contain min-width: 10ch');
});

test('.cloze-field has no flex: 1 shrink-to-content rule', () => {
  const rule = getFieldRule();
  assert.ok(!rule.includes('flex: 1'),
    '.cloze-field rule should not contain flex: 1');
});
