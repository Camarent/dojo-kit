'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

// Simple CSS parser: extract rules as { selector, declarations }
function parseCSS(css) {
  const rules = [];
  let i = 0;
  
  while (i < css.length) {
    // Skip whitespace and comments
    if (css[i].match(/\s/)) { i++; continue; }
    if (css[i] === '/' && css[i+1] === '*') {
      const end = css.indexOf('*/', i);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (css[i] === '@') {
      // Skip at-rules (media queries, etc.)
      const brace = css.indexOf('{', i);
      if (brace === -1) break;
      let depth = 1;
      let j = brace + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        if (css[j] === '}') depth--;
        j++;
      }
      i = j;
      continue;
    }
    
    // Parse selector
    const selectorStart = i;
    while (i < css.length && css[i] !== '{') {
      if (css[i] === '/' && css[i+1] === '*') {
        // Skip comment in selector
        const end = css.indexOf('*/', i);
        if (end === -1) break;
        i = end + 2;
        continue;
      }
      i++;
    }
    if (i >= css.length) break;
    
    const selector = css.slice(selectorStart, i).trim();
    if (!selector) { i++; continue; }
    
    // Parse declarations
    i++; // skip '{'
    const declStart = i;
    let depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      if (css[i] === '}') depth--;
      i++;
    }
    
    const declarations = css.slice(declStart, i - 1).trim();
    rules.push({ selector, declarations });
  }
  
  return rules;
}

const appCSS = read('styles/app.css');
const appRules = parseCSS(appCSS);

test('.feedback-slot:empty has display: none', () => {
  const feedbackEmptyRules = appRules.filter(r => r.selector === '.feedback-slot:empty');
  assert.ok(feedbackEmptyRules.length > 0, 'Should have .feedback-slot:empty rule');
  
  const rule = feedbackEmptyRules[0];
  assert.ok(rule.declarations.includes('display: none') ||
           rule.declarations.includes('display:none'),
           'Should have display: none');
});

test('No .feedback-slot rule declares a min-height', () => {
  const feedbackSlotRules = appRules.filter(r => r.selector === '.feedback-slot');
  
  for (const rule of feedbackSlotRules) {
    assert.ok(!rule.declarations.includes('min-height'),
             'No .feedback-slot rule should declare min-height');
  }
});

test('feedback detail flows in the page: no max-height or overflow scroller on .feedback-detail', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'app.css'), 'utf8');
  const rules = css.match(/[^{}]*\.feedback-detail[^{}]*\{[^}]*\}/g) || [];
  assert.ok(rules.length > 0);
  for (const r of rules) assert.ok(!/max-height|overflow/.test(r), r);
});
