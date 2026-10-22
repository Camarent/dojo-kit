'use strict';
// Mutation coverage: removing the `.dialog .row` flex-wrap rule turns test (a) red.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function mkContent(units) {
  const items = [];
  units.forEach((u) => {
    for (let i = 1; i <= 3; i++) {
      items.push({
        id: u.id + '-' + i,
        unit: u.id,
        type: 'gap',
        prompt: 'Q ' + u.id + ' ' + i,
        answers: ['a' + u.id + i],
        explanation: 'e'
      });
    }
  });
  return {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    course: { id: 'c', title: 'C', units: units }
  };
}

function mkI18n() {
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  return { en: en, ru: ru };
}

let dojoP;
async function getDojo() {
  if (!dojoP) {
    checkWasmFresh();
    dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoP;
}

async function setup(content, settings) {
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: settings || {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    exportText: function() { return JSON.stringify(doc); },
    update: function(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {},
    importText() { return { ok: false }; },
    reset() {},
    flush() {},
    attachLifecycle() {},
    onStatus() {},
    onRemoteChange() {}
  };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  return { engine, doc, clock, store, content, dojo };
}

function loadApp() {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/app.js']) });
  return sb;
}

function find(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = find(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id || n.props.testid === id) return n;
  return find(n.props.children, id);
}

function allText(n, out) {
  out = out || [];
  if (Array.isArray(n)) { n.forEach((c) => allText(c, out)); return out; }
  if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return out; }
  if (n && typeof n === 'object' && n.props) {
    ['aria-label', 'title', 'value'].forEach((k) => { if (typeof n.props[k] === 'string') out.push(n.props[k]); });
    allText(n.props.children, out);
  }
  return out;
}

function assertClean(str) {
  assert.ok(!/undefined/.test(str), 'contains undefined: ' + str);
  assert.ok(!/[{}]/.test(str), 'contains placeholder: ' + str);
  assert.ok(!/\[object/.test(str), 'contains [object: ' + str);
}

function inst(Cls, props) {
  const i = new Cls(props);
  i.props = props;
  i.setState = function (patch) { i.state = Object.assign({}, i.state, patch); };
  return i;
}

function renderSettings(sb, engine, content, doc, win, t, onDataChanged) {
  win = win || { addEventListener() {}, removeEventListener() {}, navigator: {}, document: { createElement: () => ({}) } };
  onDataChanged = onDataChanged || function() {};
  t = t || (function(k) { return k; }); // Default to identity function
  const store = {
    doc: doc,
    exportText: function() { return JSON.stringify(doc); },
    update: function(fn) { fn(doc); },
    noteAnswer() {},
    importText() { return { ok: false }; },
    reset() {},
    flush() {},
    attachLifecycle() {},
    onStatus() {},
    onRemoteChange() {}
  };
  return inst(sb.DojoApp._SettingsScreen, {
    t: t,
    course: content.course,
    content: content,
    status: 'local',
    store: store,
    engine: engine,
    win: win,
    now: () => NOW,
    onDataChanged: onDataChanged,
    onPlacement: function() {}
  });
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
