'use strict';
// Mutation coverage: removing the `.dialog .row` flex-wrap rule turns test (a) red.
const test = require('node:test');
const assert = require('node:assert');
const { read, mkContent, mkI18n, setup, loadApp, find, allText, renderSettings } = require('./settings-ui-helpers.js');

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
    
    const screen = renderSettings(sb, t.engine, content, t.doc, null, tr);
    
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
      assert.ok(cancelText.includes('Отмена'), 'Cancel button should have "Отмена" text in ru: ' + cancelText);
      assert.ok(saveText.includes('Сохранить'), 'Save button should have "Сохранить" text in ru: ' + saveText);
      assert.ok(resetText.includes('Сбросить'), 'Reset button should have "Сбросить" text in ru: ' + resetText);
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
    
    const screen = renderSettings(sb, t.engine, content, t.doc, null, tr);
    
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
      assert.ok(cancelText.includes('Отмена'), 'Cancel button should have "Отмена" text in ru: ' + cancelText);
      assert.ok(saveText.includes('Сохранить'), 'Save button should have "Сохранить" text in ru: ' + saveText);
      assert.ok(resetText.includes('Сбросить'), 'Reset button should have "Сбросить" text in ru: ' + resetText);
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
    
    const screen = renderSettings(sb, t.engine, content, t.doc, null, tr);
    
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
      assert.ok(cancelText.includes('Отмена'), 'Cancel button should have "Отмена" text in ru: ' + cancelText);
      assert.ok(confirmText.includes('Да, стереть'), 'Confirm button should have "Да, стереть" text in ru: ' + confirmText);
    }
    
    // Assert no undefined, {, [object in rendered text
    // Note: JSON export text contains valid curly braces, so we only check for undefined and [object
    const dialogText = allText(rendered).join(' ');
    assert.ok(!/undefined/.test(dialogText), 'contains undefined: ' + dialogText);
    assert.ok(!/\[object/.test(dialogText), 'contains [object: ' + dialogText);
  });
}
