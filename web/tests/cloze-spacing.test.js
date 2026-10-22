'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const css = read('styles/types-cloze.css');
const clozeJs = read('types/cloze.js');

test('cloze-group rule declares gap: var(--space-3)', () => {
  const groupMatch = css.match(/\.cloze-group\s*\{[^}]*\}/);
  assert.ok(groupMatch, 'types-cloze.css should contain .cloze-group rule');
  const groupRule = groupMatch[0];
  assert.ok(groupRule.includes('gap: var(--space-3)'),
    '.cloze-group rule should contain gap: var(--space-3)');
});

test('@media (max-width: 500px) block contains flex-direction: column for cloze row', () => {
  const mediaMatch = css.match(/@media \(max-width: 500px\)\s*\{[^}]*\}/);
  assert.ok(mediaMatch, 'types-cloze.css should contain @media (max-width: 500px) block');
  const mediaBlock = mediaMatch[0];
  assert.ok(mediaBlock.includes('flex-direction: column'),
    '@media (max-width: 500px) block should contain flex-direction: column');
});

test('input rule declares min-width: 6ch', () => {
  const fieldMatch = css.match(/\.cloze-field\s*\{[^}]*\}/);
  assert.ok(fieldMatch, 'types-cloze.css should contain .cloze-field rule');
  const fieldRule = fieldMatch[0];
  assert.ok(fieldRule.includes('min-width: 6ch'),
    '.cloze-field rule should contain min-width: 6ch');
});

test('input rule declares flex: 1', () => {
  const fieldMatch = css.match(/\.cloze-field\s*\{[^}]*\}/);
  assert.ok(fieldMatch, 'types-cloze.css should contain .cloze-field rule');
  const fieldRule = fieldMatch[0];
  assert.ok(fieldRule.includes('flex: 1'),
    '.cloze-field rule should contain flex: 1');
});

test('hint element does not use .muted class', () => {
  assert.ok(!clozeJs.includes('class="muted"'), 'cloze.js should not use class="muted" for hint');
  assert.ok(!clozeJs.includes("class='muted'"), 'cloze.js should not use class=\'muted\' for hint');
});

test('hint element uses cloze-hint class', () => {
  assert.ok(clozeJs.includes('class="cloze-hint"'), 'cloze.js should use class="cloze-hint" for hint');
});

test('hint rule uses --fg and --fs', () => {
  const hintMatch = css.match(/\.cloze-hint\s*\{[^}]*\}/);
  assert.ok(hintMatch, 'types-cloze.css should contain .cloze-hint rule');
  const hintRule = hintMatch[0];
  assert.ok(hintRule.includes('color: var(--fg)'),
    '.cloze-hint rule should contain color: var(--fg)');
  assert.ok(hintRule.includes('font-size: var(--fs)'),
    '.cloze-hint rule should contain font-size: var(--fs)');
  assert.ok(!hintRule.includes('--fs-sm'),
    '.cloze-hint rule should not contain --fs-sm');
});
