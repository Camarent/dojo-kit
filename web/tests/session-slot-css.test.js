'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const { parseCSS } = require('./css-helpers.js');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const appCSS = read('styles/app.css');
const appRules = parseCSS(appCSS, { media: true });

test('.feedback-slot:empty has display: none', () => {
  const feedbackEmptyRules = appRules.filter(r => r.selector === '.feedback-slot:empty');
  assert.ok(feedbackEmptyRules.length > 0, 'Should have .feedback-slot:empty rule');
  
  const rule = feedbackEmptyRules[0];
  assert.ok(rule.declarations.includes('display: none') ||
           rule.declarations.includes('display:none'),
           'Should have display: none');
});

test('No .feedback-slot rule declares a min-height', () => {
  const feedbackSlotRules = appRules.filter(r => r.selector.includes('.feedback-slot'));
  assert.ok(feedbackSlotRules.length > 0, 'Should have a .feedback-slot rule');
  assert.ok(appRules.some(r => r.media !== null), 'parser descends into @media');
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
