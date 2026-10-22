'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, 'web', p), 'utf8');

// Test (c): CSS rules

test('CSS: .unit-settings-title has no text-overflow: ellipsis', () => {
  const css = read('styles/app.css');
  const match = css.match(/\.unit-settings-title\s*\{[^}]*\}/);
  assert.ok(match, 'app.css should contain .unit-settings-title rule');
  const rule = match[0];
  assert.ok(!rule.includes('text-overflow: ellipsis'),
    '.unit-settings-title should not contain text-overflow: ellipsis');
});

test('CSS: .unit-settings-title has no white-space: nowrap', () => {
  const css = read('styles/app.css');
  const match = css.match(/\.unit-settings-title\s*\{[^}]*\}/);
  assert.ok(match, 'app.css should contain .unit-settings-title rule');
  const rule = match[0];
  assert.ok(!rule.includes('white-space: nowrap'),
    '.unit-settings-title should not contain white-space: nowrap');
});

test('CSS: settings h2 has larger margin-top than margin-bottom, global h2 unchanged', () => {
  const css = read('styles/app.css');
  assert.ok(/(^|\n)h2 \{[^}]*margin: 0 0 var\(--space-2\)/.test(css), 'global h2 margin unchanged');
  const match = css.match(/\.settings-screen h2\s*\{[^}]*\}/);
  assert.ok(match, 'app.css should contain h2 rule with margin');
  const rule = match[0];
  assert.ok(rule.includes('margin-top: var(--space-4)'), rule);
});

test('CSS: form controls have accent-color', () => {
  const css = read('styles/app.css');
  const hasRange = css.includes('input[type=range]');
  const hasCheckbox = css.includes('input[type=checkbox]');
  const hasRadio = css.includes('input[type=radio]');
  const hasAccentColor = css.includes('accent-color: var(--accent)');
  
  assert.ok(hasRange, 'CSS should contain input[type=range]');
  assert.ok(hasCheckbox, 'CSS should contain input[type=checkbox]');
  assert.ok(hasRadio, 'CSS should contain input[type=radio]');
  assert.ok(hasAccentColor, 'CSS should contain accent-color: var(--accent)');
  
  // Check they're in the same rule
  const accentRule = css.match(/input\[type=range\], input\[type=checkbox\], input\[type=radio\]\s*\{[^}]*accent-color[^}]*\}/);
  assert.ok(accentRule, 'Form controls should have accent-color rule');
});

test('CSS: .btn.danger-soft uses var(--fg) for color', () => {
  const css = read('styles/app.css');
  const match = css.match(/\.btn\.danger-soft\s*\{[^}]*color[^}]*\}/);
  assert.ok(match, 'app.css should contain .btn.danger-soft rule with color');
  const rule = match[0];
  assert.ok(rule.includes('color: var(--fg)'),
    '.btn.danger-soft should use var(--fg) for color');
});

// Test (d): i18n distinct values

test('i18n: en and ru values for settings.unitSettings are distinct', () => {
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  
  assert.notStrictEqual(en['settings.unitSettings'], ru['settings.unitSettings'],
    'en and ru values for settings.unitSettings should be different');
});

test('i18n: en and ru values for settings.groupSettings are distinct', () => {
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  
  assert.notStrictEqual(en['settings.groupSettings'], ru['settings.groupSettings'],
    'en and ru values for settings.groupSettings should be different');
});

// Tests (a),(b): summary behaviour through the real App harness

const { mount, walk, find, text } = require('./app-harness.js');

async function settingsScreen(opts) {
  const items = [{ id: 'u1-1', unit: 'u1', type: 'gap', prompt: 'Q', answers: ['a'], explanation: 'e' }];
  const m = await mount(Object.assign({ items }, opts));
  m.app.go('settings');
  return { m, scr: m.screen(m.sb.DojoApp._SettingsScreen) };
}
const summaryOf = (scr, id) => {
  const n = find(scr.view(), id);
  return n ? text(n) : null;
};

test('summary: no override renders no summary span', async () => {
  const { scr } = await settingsScreen();
  assert.strictEqual(summaryOf(scr, 'unit-settings-summary-u1'), null);
  assert.strictEqual(summaryOf(scr, 'unit-settings-summary-u2'), null);
});

test('summary: one override yields only that part, no empty parts', async () => {
  const { m, scr } = await settingsScreen();
  const r = m.engine.setUnitSetting('u1', { newPerDay: 7 });
  assert.ok(!r.error, String(r.error));
  const sum = summaryOf(scr, 'unit-settings-summary-u1');
  assert.ok(sum, 'summary rendered');
  assert.ok(sum.includes('7'), sum);
  assert.ok(!sum.includes(','), 'single part has no separator: ' + sum);
  assert.ok(!/^\s|\s$|,\s*,|^,|,$/.test(sum), sum);
  assert.strictEqual(summaryOf(scr, 'unit-settings-summary-u2'), null);
});

test('summary: two overrides are joined by one separator without empty parts', async () => {
  const { m, scr } = await settingsScreen();
  m.engine.setUnitSetting('u1', { newPerDay: 7, newOrder: 'random' });
  const sum = summaryOf(scr, 'unit-settings-summary-u1');
  assert.strictEqual(sum.split(', ').length, 2, sum);
  assert.ok(sum.split(', ').every((x) => x.trim().length > 0), sum);
  assert.ok(!/,\s*,/.test(sum), sum);
});
