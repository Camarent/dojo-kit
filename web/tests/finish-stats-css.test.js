'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const { parseCSS, mediaBlock } = require('./css-helpers.js');
const css = fs.readFileSync(path.join(web, 'styles/app.css'), 'utf8');

const declsOf = (rules, selector) => {
  const hit = rules.filter((r) => r.selector === selector);
  return hit.map((r) => r.declarations).join('\n');
};

test('finish stats: long stat value wraps inside its tile', () => {
  const rules = parseCSS(css, { media: true });
  const body = declsOf(rules.filter((r) => r.media === null), '.stat b');
  assert.match(body, /overflow-wrap:\s*anywhere/);
});

test('finish stats: 480px block sets a 2-column grid on .session-finish', () => {
  const block = mediaBlock(css, '@media (max-width: 480px)');
  assert.ok(block, 'app.css should contain @media (max-width: 480px) block');
  const rules = parseCSS(block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')));
  assert.match(declsOf(rules, '.session-finish'), /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test('finish stats: heading and note span both columns at 480px', () => {
  const block = mediaBlock(css, '@media (max-width: 480px)');
  const rules = parseCSS(block.slice(block.indexOf('{') + 1, block.lastIndexOf('}')));
  const spanRules = rules.filter((r) => r.selector.split(',').map((s) => s.trim()).includes('.session-finish h2') || r.selector.split(',').map((s) => s.trim()).includes('.session-finish .notice'));
  assert.ok(spanRules.length > 0, 'expected a rule for .session-finish h2 and .session-finish .notice');
  for (const r of spanRules) assert.match(r.declarations, /grid-column:\s*1\s*\/\s*-1/);
});
