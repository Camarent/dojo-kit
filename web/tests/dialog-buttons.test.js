'use strict';
// Mutation coverage: removing the `.dialog .row` flex-wrap rule turns test (a) red.
const test = require('node:test');
const assert = require('node:assert');
const { read, mkContent, mkI18n, setup, loadApp, find, allText, renderSettings } = require('./settings-ui-helpers.js');
const RU = JSON.parse(read('i18n/ru.json'));

function assertClean(str) {
  assert.ok(!/undefined/.test(str), 'contains undefined: ' + str);
  assert.ok(!/[{}]/.test(str), 'contains placeholder: ' + str);
  assert.ok(!/\[object/.test(str), 'contains [object: ' + str);
}

// ============================================================================
// (a) CSS rule asserts for the dialog row wrap and button wrap
// ============================================================================

test('CSS: .dialog .row has flex-wrap: wrap', () => {
  const css = read('styles/app.css');
  assert.ok(css.includes('.dialog .row { flex-wrap: wrap; }'), 'app.css should contain .dialog .row { flex-wrap: wrap; }');
});

test('CSS: .dialog .row.end .btn has white-space: normal and overflow-wrap: anywhere', () => {
  const css = read('styles/app.css');
  const ruleMatch = css.match(/\.dialog \.row\.end \.btn\s*\{[^}]*\}/);
  assert.ok(ruleMatch, 'app.css should contain .dialog .row.end .btn rule');
  const rule = ruleMatch[0];
  assert.ok(rule.includes('white-space: normal'), '.dialog .row.end .btn should have white-space: normal');
  assert.ok(rule.includes('overflow-wrap: anywhere'), '.dialog .row.end .btn should have overflow-wrap: anywhere');
  assert.ok(rule.includes('flex: 1 1 auto'), '.dialog .row.end .btn should have flex: 1 1 auto');
  assert.ok(rule.includes('min-width: 0'), '.dialog .row.end .btn should have min-width: 0');
  assert.ok(rule.includes('min-height: var(--tap)'), '.dialog .row.end .btn should have min-height: var(--tap)');
});

// ============================================================================
// (b) Render dialogs and assert buttons exist with correct i18n text
// ============================================================================

for (const lang of ['ru', 'en']) {
  test('unit settings dialog has cancel/save/reset buttons with i18n text (' + lang + ')', async () => {
    const content = mkContent([{ id: 'a', title: 'Unit A' }]);
    const t = await setup(content);
    const sb = loadApp();
    const i18n = mkI18n();
    const tr = sb.DojoApp._makeT(i18n, lang);
    
    const screen = renderSettings({ sb, engine: t.engine, content, doc: t.doc, t: tr });
    
    // Open the unit dialog
    screen.openUnitDialog('a');
    const rendered = screen.render(screen.props, screen.state);
    
    // Check all buttons exist
    const cancelBtn = find(rendered, 'btn-unit-reset-cancel');
    assert.ok(cancelBtn, 'Cancel button not found in unit dialog');
    
    const saveBtn = find(rendered, 'btn-unit-save');
    assert.ok(saveBtn, 'Save button not found in unit dialog');
    
    const resetBtn = find(rendered, 'btn-unit-reset');
    assert.ok(resetBtn, 'Reset button not found in unit dialog');
    
    // Check button text for the language
    const cancelText = allText(cancelBtn).join('');
    const saveText = allText(saveBtn).join('');
    const resetText = allText(resetBtn).join('');
    
    assertClean(cancelText);
    assertClean(saveText);
    assertClean(resetText);
    
    if (lang === 'en') {
      assert.ok(cancelText.includes('Cancel'), 'Cancel button should have "Cancel" text in en: ' + cancelText);
      assert.ok(saveText.includes('Save'), 'Save button should have "Save" text in en: ' + saveText);
      assert.ok(resetText.includes('Reset'), 'Reset button should have "Reset" text in en: ' + resetText);
    } else if (lang === 'ru') {
      assert.ok(cancelText.includes(RU.cancel), 'Cancel button should have the ru cancel text: ' + cancelText);
      assert.ok(saveText.includes(RU.save), 'Save button should have the ru save text: ' + saveText);
      assert.ok(resetText.includes(RU['settings.unitSettings.reset']), 'Reset button should have the ru reset text: ' + resetText);
    }
    
    // Assert no undefined, {, [object in rendered dialog text
    const dialogText = allText(find(rendered, 'unit-settings-dialog')).join(' ');
    assertClean(dialogText);
  });

  test('group dialog has cancel/save/reset buttons with i18n text (' + lang + ')', async () => {
    const content = mkContent([{ id: 'a', title: 'Unit A' }]);
    content.course.groups = [{ id: 'g', title: 'Group', units: ['a'], newPerDay: 2 }];
    const t = await setup(content);
    const sb = loadApp();
    const i18n = mkI18n();
    const tr = sb.DojoApp._makeT(i18n, lang);
    
    const screen = renderSettings({ sb, engine: t.engine, content, doc: t.doc, t: tr });
    
    // Open the group dialog
    screen.openGroupDialog('g');
    const rendered = screen.render(screen.props, screen.state);
    
    // Check all buttons exist
    const cancelBtn = find(rendered, 'btn-group-reset-cancel');
    assert.ok(cancelBtn, 'Cancel button not found in group dialog');
    
    const saveBtn = find(rendered, 'btn-group-save');
    assert.ok(saveBtn, 'Save button not found in group dialog');
    
    const resetBtn = find(rendered, 'btn-group-reset');
    assert.ok(resetBtn, 'Reset button not found in group dialog');
    
    // Check button text for the language
    const cancelText = allText(cancelBtn).join('');
    const saveText = allText(saveBtn).join('');
    const resetText = allText(resetBtn).join('');
    
    assertClean(cancelText);
    assertClean(saveText);
    assertClean(resetText);
    
    if (lang === 'en') {
      assert.ok(cancelText.includes('Cancel'), 'Cancel button should have "Cancel" text in en: ' + cancelText);
      assert.ok(saveText.includes('Save'), 'Save button should have "Save" text in en: ' + saveText);
      assert.ok(resetText.includes('Reset'), 'Reset button should have "Reset" text in en: ' + resetText);
    } else if (lang === 'ru') {
      assert.ok(cancelText.includes(RU.cancel), 'Cancel button should have the ru cancel text: ' + cancelText);
      assert.ok(saveText.includes(RU.save), 'Save button should have the ru save text: ' + saveText);
      assert.ok(resetText.includes(RU['settings.unitSettings.reset']), 'Reset button should have the ru reset text: ' + resetText);
    }
    
    // Assert no undefined, {, [object in rendered dialog text
    const dialogText = allText(find(rendered, 'group-settings-dialog')).join(' ');
    assertClean(dialogText);
  });

  test('reset confirm dialog has cancel/confirm buttons with i18n text (' + lang + ')', async () => {
    const content = mkContent([{ id: 'a', title: 'Unit A' }]);
    const t = await setup(content);
    const sb = loadApp();
    const i18n = mkI18n();
    const tr = sb.DojoApp._makeT(i18n, lang);
    
    const screen = renderSettings({ sb, engine: t.engine, content, doc: t.doc, t: tr });
    
    // Trigger reset step 1 (confirmation dialog)
    screen.setState({ resetStep: 1, resetDone: false });
    const rendered = screen.render(screen.props, screen.state);
    
    // Check buttons exist in the reset confirm section
    const cancelBtn = find(rendered, 'btn-reset-cancel');
    assert.ok(cancelBtn, 'Cancel button not found in reset confirm dialog');
    
    const confirmBtn = find(rendered, 'btn-reset-confirm');
    assert.ok(confirmBtn, 'Confirm button not found in reset confirm dialog');
    
    // Check button text for the language
    const cancelText = allText(cancelBtn).join('');
    const confirmText = allText(confirmBtn).join('');
    
    assertClean(cancelText);
    assertClean(confirmText);
    
    if (lang === 'en') {
      assert.ok(cancelText.includes('Cancel'), 'Cancel button should have "Cancel" text in en: ' + cancelText);
      // In English, the confirm button text comes from settings.reset.confirm
      assert.ok(confirmText.length > 0, 'Confirm button should have text in en');
    } else if (lang === 'ru') {
      assert.ok(cancelText.includes(RU.cancel), 'Cancel button should have the ru cancel text: ' + cancelText);
      assert.ok(confirmText.includes(RU['settings.reset.confirm']), 'Confirm button should have the ru confirm text: ' + confirmText);
    }
    
    // Assert no undefined, {, [object in rendered text
    // Note: JSON export text contains valid curly braces, so we only check for undefined and [object
    const dialogText = allText(rendered).join(' ');
    assert.ok(!/undefined/.test(dialogText), 'contains undefined: ' + dialogText);
    assert.ok(!/\[object/.test(dialogText), 'contains [object: ' + dialogText);
  });
}

// ============================================================================
// (c) Shared .dialog rule: capped height, scrolling body, reachable button row
// ============================================================================

const { ruleFor } = require('./css-helpers.js');

// Declarations of a rule body as [{ name, value }] in source order.
function decls(body) {
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const colon = d.indexOf(':');
    return { name: d.slice(0, colon).trim(), value: d.slice(colon + 1).trim() };
  });
}

// Reasons the shared .dialog rule breaks the contract; empty when it holds.
function dialogProblems(css) {
  const dialog = ruleFor(css, '.dialog');
  if (!dialog) return ['no .dialog rule'];
  const d = decls(dialog.declarations);
  const problems = [];
  const maxHeights = d.filter((x) => x.name === 'max-height').map((x) => x.value);
  if (!maxHeights.some((v) => v.includes('dvh'))) problems.push('.dialog max-height lacks dvh');
  if (!maxHeights.some((v) => v.includes('100vh'))) problems.push('.dialog max-height lacks vh fallback');
  const overflow = d.filter((x) => x.name === 'overflow-y' || x.name === 'overflow').map((x) => x.value);
  if (!overflow.some((v) => v === 'auto' || v === 'scroll')) problems.push('.dialog body does not scroll');
  const row = ruleFor(css, '.dialog > .row.end');
  if (!row) {
    problems.push('no .dialog > .row.end rule');
  } else {
    const r = decls(row.declarations);
    if (!r.some((x) => x.name === 'position' && x.value === 'sticky')) problems.push('button row not sticky');
    if (!r.some((x) => x.name === 'bottom' && x.value === '0')) problems.push('button row not pinned to bottom');
  }
  return problems;
}

test('CSS: shared .dialog rule caps height (dvh with vh fallback), scrolls, keeps button row reachable', () => {
  assert.deepStrictEqual(dialogProblems(read('styles/app.css')), []);
});

test('CSS: dialog contract check fails when max-height is removed from a test-local copy', () => {
  const css = read('styles/app.css');
  const body = ruleFor(css, '.dialog').declarations;
  const withoutMax = decls(body).filter((x) => x.name !== 'max-height').map((x) => x.name + ': ' + x.value).join('; ');
  const pieces = css.split(body);
  assert.strictEqual(pieces.length, 2, '.dialog declarations must occur exactly once in app.css');
  const mutated = pieces.join(withoutMax);
  assert.ok(dialogProblems(mutated).some((p) => p.includes('max-height')), 'mutated CSS should fail the max-height check');
});

test('unit settings dialogs for vocab and u-0 open with cancel/save/reset buttons', async () => {
  const content = mkContent([{ id: 'vocab', title: 'Vocab' }, { id: 'u-0', title: 'U0' }]);
  const t = await setup(content);
  const sb = loadApp();
  const screen = renderSettings({ sb, engine: t.engine, content, doc: t.doc, t: sb.DojoApp._makeT(mkI18n(), 'en') });
  const before = screen.render(screen.props, screen.state);
  assert.ok(find(before, 'btn-unit-settings-vocab'), 'vocab unit trigger missing');
  assert.ok(find(before, 'btn-unit-settings-u-0'), 'u-0 unit trigger missing');
  for (const id of ['vocab', 'u-0']) {
    screen.openUnitDialog(id);
    const rendered = screen.render(screen.props, screen.state);
    assert.ok(find(rendered, 'btn-unit-reset-cancel'), 'cancel missing for ' + id);
    assert.ok(find(rendered, 'btn-unit-save'), 'save missing for ' + id);
    assert.ok(find(rendered, 'btn-unit-reset'), 'reset missing for ' + id);
  }
});

test('group settings dialog opens with cancel/save/reset buttons', async () => {
  const content = mkContent([{ id: 'vocab', title: 'Vocab' }]);
  content.course.groups = [{ id: 'g', title: 'Group', units: ['vocab'], newPerDay: 2 }];
  const t = await setup(content);
  const sb = loadApp();
  const screen = renderSettings({ sb, engine: t.engine, content, doc: t.doc, t: sb.DojoApp._makeT(mkI18n(), 'en') });
  screen.openGroupDialog('g');
  const rendered = screen.render(screen.props, screen.state);
  assert.ok(find(rendered, 'btn-group-reset-cancel'), 'cancel missing');
  assert.ok(find(rendered, 'btn-group-save'), 'save missing');
  assert.ok(find(rendered, 'btn-group-reset'), 'reset missing');
});
