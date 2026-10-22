'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

test('catalogue tabs wrap at >= 600px', () => {
  const css = read('styles/app.css');

  // Check media query exists and contains the wrap rule
  const mediaBlock = css.match(/@media \(min-width: 600px\)\s*\{[^}]*\}/);
  assert.ok(mediaBlock, 'app.css should contain @media (min-width: 600px) block');

  const blockContent = mediaBlock[0];
  assert.ok(blockContent.includes('.catalog-tabs'), 'Media block should contain .catalog-tabs rule');
  assert.ok(blockContent.includes('flex-wrap: wrap'), '.catalog-tabs should have flex-wrap: wrap in media block');
  assert.ok(blockContent.includes('overflow-x: visible'), '.catalog-tabs should have overflow-x: visible in media block');
});

test('phones keep horizontal scroller', () => {
  const css = read('styles/app.css');

  // Extract the base .catalog-tabs rule (outside media blocks)
  // Split by media queries and get the part before the 600px media
  const parts = css.split(/@media \(min-width: 600px\)/);
  const beforeMedia = parts[0];

  // Find .catalog-tabs rule in the base styles
  const catalogTabsMatch = beforeMedia.match(/\.catalog-tabs\s*\{[^}]*\}/);
  assert.ok(catalogTabsMatch, 'app.css should contain base .catalog-tabs rule');

  const rule = catalogTabsMatch[0];
  assert.ok(rule.includes('overflow-x: auto'), 'Base .catalog-tabs should keep overflow-x: auto');
});

test('catalog tabs button has white-space nowrap', () => {
  const css = read('styles/app.css');

  const btnRuleMatch = css.match(/\.catalog-tabs \.btn\s*\{[^}]*\}/);
  assert.ok(btnRuleMatch, 'app.css should contain .catalog-tabs .btn rule');

  const rule = btnRuleMatch[0];
  assert.ok(rule.includes('white-space: nowrap'), '.catalog-tabs .btn should have white-space: nowrap');
  assert.ok(rule.includes('flex-shrink: 0'), '.catalog-tabs .btn should keep flex-shrink: 0');
});
