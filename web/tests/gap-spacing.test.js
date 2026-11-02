'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const appCss = read('styles/app.css');
const tokensCss = read('styles/tokens.css');

test('.gap rule declares row-gap using a var(--space-N) token', () => {
  const gapMatch = appCss.match(/\.gap\s*\{[^}]*\}/);
  assert.ok(gapMatch, 'app.css should contain .gap rule');
  const gapRule = gapMatch[0];
  assert.ok(gapRule.includes('row-gap:'),
    '.gap rule should contain row-gap declaration');
  assert.ok(gapRule.match(/row-gap:\s*var\(--space-\d+\)/),
    '.gap rule should use row-gap: var(--space-N) token');
});

test('row-gap token exists in tokens.css and is >= 12px', () => {
  const gapMatch = appCss.match(/\.gap\s*\{[^}]*\}/);
  assert.ok(gapMatch, 'app.css should contain .gap rule');
  const gapRule = gapMatch[0];
  
  const rowGapMatch = gapRule.match(/row-gap:\s*var\(--space-(\d+)\)/);
  assert.ok(rowGapMatch, '.gap rule should contain row-gap with var(--space-N)');
  
  const tokenNum = rowGapMatch[1];
  const tokenName = `--space-${tokenNum}`;
  
  const tokenMatch = tokensCss.match(new RegExp(`${tokenName}:\\s*(\\d+)px`));
  assert.ok(tokenMatch, `tokens.css should contain ${tokenName} definition`);
  
  const tokenValue = parseInt(tokenMatch[1], 10);
  assert.ok(tokenValue >= 12, 
    `${tokenName} value (${tokenValue}px) should be >= 12px`);
});
