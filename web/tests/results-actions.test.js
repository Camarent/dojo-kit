'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const item = { id: 'g1', unit: 'u1', type: 'gap', prompt: 'P', answers: ['x'] };

// Test a: mounted results screen has btn-again-session class and results-actions class on parent row
test('results screen: btn-again-session has class and parent row has results-actions', async () => {
  const m = await H.mount({ items: [item] });
  const summary = { mode: 'practice', raw: 1, total: 2, pct: 50, durationMs: 0, review: [], skipped: [], fraction: 0.5, correct: 1, answered: 2 };
  const v = m.sb.DojoApp._Results({ t: m.t, byId: { g1: item }, go() {}, onAgain() {}, summary });
  const btn = H.find(v, 'btn-again-session');
  assert.ok(btn, 'btn-again-session not found');
  assert.ok(btn.props.class.includes('btn-again-session'), 'btn-again-session should have btn-again-session class');
  
  // Find the parent row
  const tree = v;
  let rowNode = null;
  H.walk(tree, (n) => {
    if (!rowNode && n.props && n.props.class && n.props.class.includes('results-actions')) {
      rowNode = n;
    }
  });
  assert.ok(rowNode, 'results-actions row not found');
});

// Test b: CSS source test - parse CSS and check rules in media query
test('app.css has results-actions and btn-again-session rules in max-width:600px', () => {
  const css = read('styles/app.css');
  
  // Find the @media (max-width: 600px) block
  const mediaStart = css.indexOf('@media (max-width: 600px)');
  assert.ok(mediaStart !== -1, 'app.css should have @media (max-width: 600px)');
  
  // Find the opening brace of the media query
  const braceOpenIdx = css.indexOf('{', mediaStart);
  assert.ok(braceOpenIdx > mediaStart, 'Media query should have opening brace');
  
  // Walk through braces to find the closing brace
  let depth = 1;
  let i = braceOpenIdx + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  
  const mediaBlock = css.substring(braceOpenIdx + 1, i - 1);
  
  // Check .results-actions has flex-wrap: wrap
  assert.ok(mediaBlock.includes('.results-actions'), 'Media query block should contain .results-actions rule');
  
  // Extract the .results-actions rule
  const resultsActionsMatch = mediaBlock.match(/\.results-actions\s*\{[^}]*\}/);
  assert.ok(resultsActionsMatch, 'Media query block should contain .results-actions rule with declaration block');
  const resultsActionsRule = resultsActionsMatch[0];
  assert.ok(resultsActionsRule.includes('flex-wrap: wrap'), '.results-actions should have flex-wrap: wrap');
  
  // Check .btn-again-session has width: 100% or flex-basis: 100% or flex: 1 1 100%
  assert.ok(mediaBlock.includes('.btn-again-session'), 'Media query block should contain .btn-again-session rule');
  
  const btnAgainMatch = mediaBlock.match(/\.btn-again-session\s*\{[^}]*\}/);
  assert.ok(btnAgainMatch, 'Media query block should contain .btn-again-session rule with declaration block');
  const btnAgainRule = btnAgainMatch[0];
  
  const hasWidth100 = btnAgainRule.includes('width: 100%');
  const hasFlexBasis100 = btnAgainRule.includes('flex-basis: 100%');
  const hasFlex11100 = btnAgainRule.includes('flex: 1 1 100%');
  
  assert.ok(hasWidth100 || hasFlexBasis100 || hasFlex11100,
    '.btn-again-session should have width: 100% or flex-basis: 100% or flex: 1 1 100%');
});
