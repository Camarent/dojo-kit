'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

test('app.css .field has 1px border and no 2px solid var(--control-border)', () => {
  const css = read('styles/app.css');
  const fieldMatch = css.match(/\.field\s*\{[^}]*border[^}]*\}/);
  assert.ok(fieldMatch, 'app.css should contain .field rule with border');
  const rule = fieldMatch[0];
  assert.ok(rule.includes('border: 1px solid var(--control-border)'),
    '.field rule should have border: 1px solid var(--control-border)');
  assert.ok(!rule.includes('2px solid var(--control-border)'),
    '.field rule should not contain 2px solid var(--control-border)');
});

test('app.css .session .gap .field has min-height var(--tap)', () => {
  const css = read('styles/app.css');
  const gapFieldMatch = css.match(/\.session \.gap \.field\s*\{[^}]*\}/);
  assert.ok(gapFieldMatch, 'app.css should contain .session .gap .field rule');
  const rule = gapFieldMatch[0];
  assert.ok(rule.includes('min-height: var(--tap)'),
    '.session .gap .field should have min-height: var(--tap)');
  assert.ok(rule.includes('flex-basis: 100%'),
    '.session .gap .field should have flex-basis: 100%');
});

test('types-cloze.css .cloze-field has 1px border and no 2px solid var(--control-border)', () => {
  const css = read('styles/types-cloze.css');
  const clozeFieldMatch = css.match(/\.cloze-field\s*\{[^}]*border[^}]*\}/);
  assert.ok(clozeFieldMatch, 'types-cloze.css should contain .cloze-field rule with border');
  const rule = clozeFieldMatch[0];
  assert.ok(rule.includes('border: 1px solid var(--control-border)'),
    '.cloze-field rule should have border: 1px solid var(--control-border)');
  assert.ok(!rule.includes('2px solid var(--control-border)'),
    '.cloze-field rule should not contain 2px solid var(--control-border)');
});

test('app.css .field.right keeps border-color', () => {
  const css = read('styles/app.css');
  const fieldRightMatch = css.match(/\.field\.right\s*\{[^}]*\}/);
  assert.ok(fieldRightMatch, 'app.css should contain .field.right rule');
  const rule = fieldRightMatch[0];
  assert.ok(rule.includes('border-color'),
    '.field.right should set border-color');
});

test('app.css .field.wrong keeps border-color', () => {
  const css = read('styles/app.css');
  const fieldWrongMatch = css.match(/\.field\.wrong\s*\{[^}]*\}/);
  assert.ok(fieldWrongMatch, 'app.css should contain .field.wrong rule');
  const rule = fieldWrongMatch[0];
  assert.ok(rule.includes('border-color'),
    '.field.wrong should set border-color');
});

test('app.css has focus-visible outline rule for .field', () => {
  const css = read('styles/app.css');
  const fieldFocusMatch = css.match(/\.field:focus-visible\s*\{[^}]*outline[^}]*\}/);
  assert.ok(fieldFocusMatch, 'app.css should contain .field:focus-visible rule with outline');
  const rule = fieldFocusMatch[0];
  assert.ok(rule.includes('outline: 2px solid'),
    '.field:focus-visible should have outline: 2px solid');
});
