'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

const css = read('styles/types-cloze.css');
const clozeJs = read('types/cloze.js');

test('cloze-groups rule declares gap: var(--space-3)', () => {
  const groupMatch = css.match(/\.cloze-groups\s*\{[^}]*\}/);
  assert.ok(groupMatch, 'types-cloze.css should contain .cloze-groups rule');
  const groupRule = groupMatch[0];
  assert.ok(groupRule.includes('gap: var(--space-3)'),
    '.cloze-groups rule should contain gap: var(--space-3)');
});

test('@media (max-width: 500px) stacks groups, stretches blanks and the single-blank field', () => {
  const mediaMatch = css.match(/@media \(max-width: 500px\)\s*\{.*\}/);
  assert.ok(mediaMatch, 'types-cloze.css should contain @media (max-width: 500px) block');
  assert.ok(/\.cloze-groups\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/.test(mediaMatch[0]));
  assert.ok(/\.cloze-blank,\s*\.cloze-sentence \.cloze-field\s*\{[^}]*width: 100%/.test(mediaMatch[0]));
  assert.ok(!/justify-self|align-self/.test(mediaMatch[0]), 'grouped stretch is declared once, outside the media block');
});

test('phone media block comes after the base single-blank field width so it wins', () => {
  assert.ok(css.indexOf('@media (max-width: 500px)') > css.indexOf('.cloze-sentence .cloze-field {'));
});

test('single-blank sentence field width comes from --blank-w (inline on desktop)', () => {
  assert.ok(/\.cloze-sentence \.cloze-field\s*\{\s*width: var\(--blank-w, 100%\)/.test(css));
});

test('input rule declares min-width: 10ch', () => {
  const fieldMatch = css.match(/\.cloze-field\s*\{[^}]*\}/);
  assert.ok(fieldMatch, 'types-cloze.css should contain .cloze-field rule');
  const fieldRule = fieldMatch[0];
  assert.ok(fieldRule.includes('min-width: 10ch'),
    '.cloze-field rule should contain min-width: 10ch');
});

test('input rule has no flex: 1 shrink-to-content', () => {
  const fieldMatch = css.match(/\.cloze-field\s*\{[^}]*\}/);
  assert.ok(fieldMatch, 'types-cloze.css should contain .cloze-field rule');
  const fieldRule = fieldMatch[0];
  assert.ok(!fieldRule.includes('flex: 1'),
    '.cloze-field rule should not contain flex: 1');
});

test('input rule has a single min-width declaration: 10ch floor', () => {
  const rule = css.match(/\.cloze-field\s*\{[^}]*\}/)[0];
  const decls = rule.match(/(^|[\s;{])min-width:\s*[^;}]+/g) || [];
  assert.equal(decls.length, 1);
  assert.ok(/min-width:\s*10ch/.test(decls[0]));
});

test('base .cloze-blank does not stretch (single-blank stays inline)', () => {
  const rule = css.match(/(^|\n)\.cloze-blank\s*\{[^}]*\}/)[0];
  assert.ok(!/(^|[\s;{])width:\s*100%/.test(rule));
  assert.ok(!/justify-self/.test(rule));
});

test('grouped .cloze-blank stretches', () => {
  const rule = css.match(/\.cloze-groups \.cloze-blank\s*\{[^}]*\}/)[0];
  assert.ok(/justify-self:\s*stretch/.test(rule) && /(^|[\s;{])width:\s*100%/.test(rule));
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
