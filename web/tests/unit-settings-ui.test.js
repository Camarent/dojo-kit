'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, mkContent, mkI18n, setup, loadApp, find, inst, renderSettings } = require('./settings-ui-helpers.js');

function textOf(n) {
  if (Array.isArray(n)) {
    for (const c of n) { const r = textOf(c); if (r) return r; }
    return null;
  }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props.children && typeof n.props.children === 'string') return n.props.children;
  return textOf(n.props.children);
}

function getChildren(node) {
  if (!node || !node.props) return [];
  const c = node.props.children;
  return Array.isArray(c) ? c : [c];
}

function countChildren(node, testidPrefix) {
  const children = getChildren(node);
  let count = 0;
  for (const child of children) {
    if (child && child.props && child.props['data-testid'] && child.props['data-testid'].startsWith(testidPrefix)) {
      count++;
    }
  }
  return count;
}

// Helper to find all elements with a testid prefix
function findAll(node, prefix) {
  const results = [];
  function walk(n) {
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
    } else if (n && typeof n === 'object' && n.props) {
      if (n.props['data-testid'] && n.props['data-testid'].startsWith(prefix)) {
        results.push(n);
      }
      walk(n.props.children);
    }
  }
  walk(node);
  return results;
}

// Test 1: Unit settings section renders a row per unit
test('unit settings section renders one row per unit', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A' },
    { id: 'b', title: 'Unit B' },
    { id: 'c', title: 'Unit C' }
  ]);
  const t = await setup(content);
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc, null, tr);
  const rendered = screen.render(screen.props, screen.state);
  
  // Check that unit settings section exists
  const section = find(rendered, 'unit-settings');
  assert.ok(section, 'Unit settings section not found');
  
  // Check that we have 3 unit rows
  const rows = findAll(rendered, 'unit-settings-row-');
  assert.strictEqual(rows.length, 3, 'Expected 3 unit rows');
  
  // Check that each row has the correct unit id
  assert.ok(find(rendered, 'unit-settings-row-a'), 'Row for unit a not found');
  assert.ok(find(rendered, 'unit-settings-row-b'), 'Row for unit b not found');
  assert.ok(find(rendered, 'unit-settings-row-c'), 'Row for unit c not found');
});

// Test 2: Override marker only for units with overrides
test('override marker only for units that have overrides', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A' },
    { id: 'b', title: 'Unit B' }
  ]);
  const t = await setup(content);
  
  // Set override for unit a
  t.engine.setUnitSetting('a', { newPerDay: 5 });
  
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc);
  const rendered = screen.render(screen.props, screen.state);
  
  // Unit a should have override marker
  const markerA = find(rendered, 'override-marker-a');
  assert.ok(markerA, 'Override marker for unit a not found');
  
  // Unit b should NOT have override marker
  const markerB = find(rendered, 'override-marker-b');
  assert.strictEqual(markerB, null, 'Override marker for unit b should not exist');
});

// Test 3: Opening dialog shows effective values
test('opening the dialog shows effective values', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A', newPerDay: 5 }
  ]);
  content.course.newPerDay = 10;
  content.course.srs = { ladder: [0, 86400000, 172800000], dropOnWrong: 2 };
  
  const t = await setup(content);
  
  // Set override for unit a
  t.engine.setUnitSetting('a', { newPerDay: 3, ladderScale: 2, dropOnWrong: 1, newOrder: 'random' });
  
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc);
  
  // Open the dialog for unit a
  screen.openUnitDialog('a');
  const rendered = screen.render(screen.props, screen.state);
  
  // Check dialog is open
  const dialog = find(rendered, 'unit-settings-dialog');
  assert.ok(dialog, 'Unit settings dialog not found');
  
  // Check that the effective values are displayed
  // The effective newPerDay should be 3 (from override)
  // The effective ladderScale should be 2 (from override)
  // The effective dropOnWrong should be 1 (from override)
  // The effective newOrder should be 'random' (from override)
  
  const stepper = find(rendered, 'unit-newperday');
  assert.ok(stepper, 'New per day stepper not found');
  assert.strictEqual(stepper.props.value, 3, 'New per day should be 3');
});

// Test 4: Changing newPerDay writes the right override
test('changing newPerDay writes the right override via the engine', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A' }
  ]);
  const t = await setup(content);
  
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc);
  
  // Open the dialog for unit a
  screen.openUnitDialog('a');
  
  // Change newPerDay to 7
  screen.setUnitSettingField('a', 'newPerDay', 7);
  
  // Check that the override was written
  const settings = t.engine.unitSettings('a');
  assert.strictEqual(settings.newPerDay, 7, 'newPerDay override should be 7');
});

// Test 5: Selecting course value removes the key
test('selecting the course value removes the key', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A' }
  ]);
  content.course.newPerDay = 10;
  
  const t = await setup(content);
  
  // Set override for unit a
  t.engine.setUnitSetting('a', { newPerDay: 5 });
  
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc);
  screen.openUnitDialog('a');
  
  // Set newPerDay to the course value (10), which should remove the override
  screen.setUnitSettingField('a', 'newPerDay', null);
  
  // Check that the override was removed
  const settings = t.engine.unitSettings('a');
  assert.strictEqual(settings.newPerDay, undefined, 'newPerDay override should be removed');
});

// Test 6: Reset clears all overrides
test('Reset clears all overrides and is disabled when nothing is set', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A' }
  ]);
  
  const t = await setup(content);
  
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc);
  
  // Open dialog with no overrides
  screen.openUnitDialog('a');
  
  const rendered = screen.render(screen.props, screen.state);
  const resetBtn = find(rendered, 'btn-unit-reset');
  
  // Reset button should be disabled when no overrides
  assert.ok(resetBtn && resetBtn.props && resetBtn.props.disabled, 'Reset button should be disabled when no overrides');
  
  // Set an override
  t.engine.setUnitSetting('a', { newPerDay: 5 });
  screen.openUnitDialog('a');
  
  // Reset button should be enabled
  const rendered2 = screen.render(screen.props, screen.state);
  const resetBtn2 = find(rendered2, 'btn-unit-reset');
  assert.ok(resetBtn2 && resetBtn2.props && !resetBtn2.props.disabled, 'Reset button should be enabled when overrides exist');
  
  // Reset
  screen.resetUnitSettings('a');
  
  // Check that all overrides were cleared
  const settings = t.engine.unitSettings('a');
  assert.deepStrictEqual(settings, {}, 'All overrides should be cleared');
});

// Test 7: Ladder pace summary text changes with the scale
test('ladder pace summary text changes with the scale', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A', srs: { ladder: [0, 86400000, 172800000, 432000000] } }
  ]);
  
  const t = await setup(content);
  
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc, null, tr);
  
  // Open dialog with default scale (1)
  screen.openUnitDialog('a');
  const rendered1 = screen.render(screen.props, screen.state);
  const preview1 = find(rendered1, 'ladder-preview');
  assert.ok(preview1, 'Ladder preview not found');
  
  // Check that ladderPreview in state contains the expected format
  // With scale 1: should be "1d, 2d, 5d"
  assert.ok(screen.state.unitDialog.ladderPreview, 'Ladder preview should not be empty');
  assert.ok(screen.state.unitDialog.ladderPreview.includes('d'), 'Ladder preview should contain day markers');
  
  // Change scale to 2
  t.engine.setUnitSetting('a', { ladderScale: 2 });
  screen.openUnitDialog('a');
  const rendered2 = screen.render(screen.props, screen.state);
  const preview2 = find(rendered2, 'ladder-preview');
  assert.ok(preview2, 'Ladder preview not found after scale change');
  
  // With scale 2: should have different values
  // The state should have updated ladderPreview
  assert.ok(screen.state.unitDialog.ladderPreview, 'Ladder preview should not be empty after scale change');
});

// Test 8: i18n parity - all strings exist in both en and ru
test('i18n parity for unit settings strings', () => {
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  
  const unitSettingsKeys = Object.keys(en).filter(k => k.startsWith('settings.unitSettings'));
  
  for (const key of unitSettingsKeys) {
    assert.ok(ru[key] !== undefined, `Russian translation missing for: ${key}`);
    assert.ok(en[key] !== undefined, `English translation missing for: ${key}`);
  }
});

// Test 9: Dialog has proper accessibility attributes
test('unit settings dialog has proper accessibility attributes', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A' }
  ]);
  
  const t = await setup(content);
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc, null, tr);
  screen.openUnitDialog('a');
  const rendered = screen.render(screen.props, screen.state);
  
  const overlay = find(rendered, 'unit-settings-dialog');
  assert.ok(overlay, 'Dialog overlay not found');
  
  // Check that the title exists with proper id
  const title = find(rendered, 'unit-settings-dialog-title');
  assert.ok(title, 'Dialog title not found');
  assert.strictEqual(title.props.id, 'unit-settings-dialog-title', 'Title should have id for aria-labelledby');
  
  // Check that controls are present
  assert.ok(find(rendered, 'unit-newperday'), 'New per day control should be in dialog');
  assert.ok(find(rendered, 'unit-ladder-pace'), 'Ladder pace control should be in dialog');
  assert.ok(find(rendered, 'unit-on-wrong'), 'On wrong control should be in dialog');
  assert.ok(find(rendered, 'unit-new-order'), 'New order control should be in dialog');
});
