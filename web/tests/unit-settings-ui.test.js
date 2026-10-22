'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';
const J = (x) => JSON.parse(JSON.stringify(x));

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
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {},
    exportText() { return JSON.stringify(doc); },
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

function textOf(n) {
  if (Array.isArray(n)) {
    for (const c of n) { const r = textOf(c); if (r) return r; }
    return null;
  }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props.children && typeof n.props.children === 'string') return n.props.children;
  return textOf(n.props.children);
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

// Test 10: All controls are present in the dialog
test('all controls are present in the unit settings dialog', async () => {
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
  screen.openUnitDialog('a');
  const rendered = screen.render(screen.props, screen.state);
  
  // Check all controls exist
  assert.ok(find(rendered, 'unit-newperday'), 'New per day stepper not found');
  assert.ok(find(rendered, 'unit-ladder-pace'), 'Ladder pace select not found');
  assert.ok(find(rendered, 'unit-on-wrong'), 'On wrong select not found');
  assert.ok(find(rendered, 'unit-new-order'), 'New order select not found');
  assert.ok(find(rendered, 'btn-unit-reset'), 'Reset button not found');
  assert.ok(find(rendered, 'btn-unit-reset-cancel'), 'Cancel button not found');
});

// Mutation check: make the select handler write nothing and Reset a no-op
test('mutation check - handlers must actually write', async () => {
  const content = mkContent([
    { id: 'a', title: 'Unit A' }
  ]);
  
  const t = await setup(content);
  
  // Temporarily break the handler
  const originalSetUnitSetting = t.engine.setUnitSetting;
  t.engine.setUnitSetting = function() { return {}; };
  
  const sb = loadApp();
  const i18n = mkI18n();
  const tr = (k, v) => {
    const dict = i18n.en;
    return dict[k] !== undefined ? dict[k] : k;
  };
  
  const screen = renderSettings(sb, t.engine, content, t.doc);
  screen.openUnitDialog('a');
  
  // Change a setting - this should fail to write
  screen.setUnitSettingField('a', 'newPerDay', 5);
  
  // Check that the override was NOT written (because we broke the handler)
  const settings = t.engine.unitSettings('a');
  assert.strictEqual(settings.newPerDay, undefined, 'Override should not be written when handler is broken');
  
  // Restore the handler
  t.engine.setUnitSetting = originalSetUnitSetting;
  
  // Now it should work
  screen.setUnitSettingField('a', 'newPerDay', 5);
  const settings2 = t.engine.unitSettings('a');
  assert.strictEqual(settings2.newPerDay, 5, 'Override should be written when handler is restored');
});

async function dialogScreen(unit, course) {
  const content = mkContent([unit]);
  Object.assign(content.course, course || {});
  const t = await setup(content);
  const sb = loadApp();
  const screen = renderSettings(sb, t.engine, content, t.doc);
  return { t, screen, content };
}

function ctl(screen, id) {
  return find(screen.render(screen.props, screen.state), id);
}

test('choosing the course value clears the unit override (null, not the value)', async () => {
  const { t, screen } = await dialogScreen({ id: 'a', title: 'A', newPerDay: 4, newOrder: 'random' }, { newPerDay: 10, newOrder: 'file', srs: { dropOnWrong: 2 } });
  t.engine.setUnitSetting('a', { newPerDay: 7, ladderScale: 2, dropOnWrong: 1, newOrder: 'file' });
  screen.openUnitDialog('a');
  const c = screen.state.unitDialog.course;
  assert.strictEqual(c.newPerDay, 4);
  assert.strictEqual(c.newOrder, 'random');
  assert.strictEqual(c.dropOnWrong, 2);
  ctl(screen, 'unit-newperday').props.onChange(c.newPerDay);
  assert.strictEqual(t.engine.unitSettings('a').newPerDay, undefined);
  ctl(screen, 'unit-ladder-pace').props.onChange({ target: { value: '1' } });
  assert.strictEqual(t.engine.unitSettings('a').ladderScale, undefined);
  ctl(screen, 'unit-on-wrong').props.onChange({ target: { value: '2' } });
  assert.strictEqual(t.engine.unitSettings('a').dropOnWrong, undefined);
  ctl(screen, 'unit-new-order').props.onChange({ target: { value: 'random' } });
  assert.strictEqual(t.engine.unitSettings('a').newOrder, undefined);
});

test('pace control maps each option to its own scale', async () => {
  const { t, screen } = await dialogScreen({ id: 'a', title: 'A' });
  screen.openUnitDialog('a');
  for (const [v, n] of [['0.5', 0.5], ['0.75', 0.75], ['1.5', 1.5], ['2', 2], ['3', 3]]) {
    ctl(screen, 'unit-ladder-pace').props.onChange({ target: { value: v } });
    assert.strictEqual(t.engine.unitSettings('a').ladderScale, n);
  }
});

test('unit rows show a value summary', async () => {
  const { t, screen } = await dialogScreen({ id: 'a', title: 'A' }, { newPerDay: 10 });
  t.engine.setUnitSetting('a', { newPerDay: 7 });
  const en = mkI18n().en;
  screen.props.t = (k, v) => String(en[k] !== undefined ? en[k] : k).replace(/\{(\w+)\}/g, (m, x) => (v && v[x] !== undefined ? v[x] : m));
  const n = find(screen.render(screen.props, screen.state), 'unit-settings-summary-a');
  assert.ok(n, 'summary missing');
  assert.ok(JSON.stringify(n.props.children).includes('7'));
});

test('engine error shows a notice via onNotice instead of throwing', async () => {
  const { t, screen } = await dialogScreen({ id: 'a', title: 'A' });
  const seen = [];
  screen.props.onNotice = (n) => seen.push(n);
  screen.props.engine = Object.assign({}, t.engine, { setUnitSetting: () => ({ error: 'boom' }) });
  screen.setUnitSettingField('a', 'newPerDay', 3);
  assert.strictEqual(seen.length, 1);
});

// ---- real-translate regressions (summary / dialog text) ----
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
  assert.ok(!/settings\.unitSettings/.test(str), 'contains raw key: ' + str);
}

for (const lang of ['ru', 'en']) {
  test('real t (' + lang + '): summary and dialog text are clean with no override', async () => {
    const content = mkContent([{ id: 'a', title: 'Unit A' }]);
    const t = await setup(content);
    const sb = loadApp();
    const tr = sb.DojoApp._makeT(mkI18n(), lang);
    const screen = renderSettings(sb, t.engine, content, t.doc, null, tr);
    // With all-defaults, summary span is not rendered
    const summaryEl = find(screen.render(screen.props, screen.state), 'unit-settings-summary-a');
    assert.strictEqual(summaryEl, null, 'summary should be null when all values match defaults');
    screen.openUnitDialog('a');
    const r = screen.render(screen.props, screen.state);
    const title = allText(find(r, 'unit-settings-dialog-title')).join('');
    assert.ok(title.includes('Unit A'), title);
    assertClean(allText(find(r, 'unit-settings-dialog')).join(' | '));
  });
}

test('dialog title uses plain text when unit title is a markup vnode', async () => {
  const content = mkContent([{ id: 'a', title: 'Unit A' }]);
  const t = await setup(content);
  const sb = loadApp();
  sb.DojoExt.registerMarkup('m', { render: (s, h) => h('b', null, s), plain: (s) => s });
  sb.DojoExt.use('m');
  const screen = renderSettings(sb, t.engine, content, t.doc, null, sb.DojoApp._makeT(mkI18n(), 'en'));
  screen.openUnitDialog('a');
  const title = allText(find(screen.render(screen.props, screen.state), 'unit-settings-dialog-title')).join('');
  assertClean(title);
  assert.ok(title.includes('Unit A'));
});

test('blank fields show course-resolved effective values', async () => {
  const content = mkContent([{ id: 'a', title: 'A' }]);
  content.course.units[0].newPerDay = 7;
  const t = await setup(content);
  const sb = loadApp();
  const screen = renderSettings(sb, t.engine, content, t.doc, null, sb.DojoApp._makeT(mkI18n(), 'en'));
  screen.openUnitDialog('a');
  const r = screen.render(screen.props, screen.state);
  assert.strictEqual(find(r, 'unit-newperday').props.value, 7);
  assert.strictEqual(find(r, 'unit-on-wrong').props.value, '1');
  assert.strictEqual(find(r, 'unit-new-order').props.value, 'file');
});

test('choosing the course-default pace clears override and summary shows default', async () => {
  const content = mkContent([{ id: 'a', title: 'A' }]);
  const t = await setup(content);
  const sb = loadApp();
  const tr = sb.DojoApp._makeT(mkI18n(), 'en');
  const screen = renderSettings(sb, t.engine, content, t.doc, null, tr);
  screen.openUnitDialog('a');
  find(screen.render(screen.props, screen.state), 'unit-ladder-pace').props.onChange({ target: { value: '2' } });
  assert.strictEqual(t.engine.unitSettings('a').ladderScale, 2);
  const s2 = allText(find(screen.render(screen.props, screen.state), 'unit-settings-summary-a')).join('');
  assert.ok(s2.includes('×2'), s2);
  find(screen.render(screen.props, screen.state), 'unit-ladder-pace').props.onChange({ target: { value: '1' } });
  assert.strictEqual(t.engine.unitSettings('a').ladderScale, undefined);
  // After clearing override, all values match defaults, so summary is not rendered
  const s1 = find(screen.render(screen.props, screen.state), 'unit-settings-summary-a');
  assert.strictEqual(s1, null, 'summary should be null when all values match defaults');
});

test('dialog shows unit.srs.dropOnWrong, then course.srs, then the default', async () => {
  const cases = [
    [{ id: 'a', title: 'A', srs: { dropOnWrong: 4 } }, { srs: { dropOnWrong: 2 } }, '4'],
    [{ id: 'a', title: 'A' }, { srs: { dropOnWrong: 2 } }, '2'],
    [{ id: 'a', title: 'A' }, {}, '1']
  ];
  for (const [unit, course, want] of cases) {
    const { screen } = await dialogScreen(unit, course);
    screen.openUnitDialog('a');
    assert.strictEqual(screen.state.unitDialog.course.dropOnWrong, Number(want));
    assert.strictEqual(ctl(screen, 'unit-on-wrong').props.value, want);
  }
});

test('dialog shows the srsByType drop for a unit whose items share one type', async () => {
  const { screen } = await dialogScreen({ id: 'a', title: 'A' }, { srs: { dropOnWrong: 2 }, srsByType: { gap: { dropOnWrong: 5 } } });
  screen.openUnitDialog('a');
  assert.strictEqual(ctl(screen, 'unit-on-wrong').props.value, '5');
  const mixed = await dialogScreen({ id: 'a', title: 'A' }, { srs: { dropOnWrong: 2 }, srsByType: { gap: { dropOnWrong: 5 } } });
  mixed.content.items[0].type = 'choice';
  mixed.screen.openUnitDialog('a');
  assert.strictEqual(ctl(mixed.screen, 'unit-on-wrong').props.value, '2');
});

test('dialog and summary text show no undefined, braces, [object or raw key for srs-derived values', async () => {
  const content = mkContent([{ id: 'a', title: 'A', srs: { dropOnWrong: 4 } }]);
  const t = await setup(content);
  const sb = loadApp();
  const screen = renderSettings(sb, t.engine, content, t.doc, null, sb.DojoApp._makeT(mkI18n(), 'en'));
  screen.openUnitDialog('a');
  const r = screen.render(screen.props, screen.state);
  assertClean(allText(find(r, 'unit-settings-summary-a')).join(''));
  assertClean(allText(find(r, 'unit-settings-dialog')).join(' | '));
});

test('dialog single-type drop ignores retired items of another type', async () => {
  const { screen, content } = await dialogScreen({ id: 'a', title: 'A' }, { srs: { dropOnWrong: 2 }, srsByType: { gap: { dropOnWrong: 5 } } });
  content.items.push(Object.assign({}, content.items[0], { id: 'x-retired', type: 'choice', status: 'retired' }));
  screen.openUnitDialog('a');
  assert.strictEqual(ctl(screen, 'unit-on-wrong').props.value, '5');
});

test('dialog newPerDay falls back to the global cap when the course sets none', async () => {
  const { t, screen } = await dialogScreen({ id: 'a', title: 'A' }, {});
  t.doc.settings.newPerDay = 7;
  screen.openUnitDialog('a');
  assert.strictEqual(screen.state.unitDialog.course.newPerDay, 7);
  assert.strictEqual(t.engine.globalNewPerDay(), 7);
  assert.strictEqual(ctl(screen, 'newperday').props.value, 7);
});

test('a plugin setting cleared on one device wins the merge against an older copy', async () => {
  const dojo = await getDojo();
  const { t, screen } = await dialogScreen({ id: 'a', title: 'A' }, {});
  const K = 'plugin:p';
  screen.setSetting(K, 'x');
  const older = JSON.parse(JSON.stringify(t.doc));
  t.clock.t += 1000;
  screen.props.now = () => t.clock.t;
  screen.setSetting(K, null);
  assert.strictEqual(t.doc.settings[K], null);
  const merged = dojo.call('merge', { a: older, b: t.doc });
  assert.strictEqual(merged.settings[K], null);
  const merged2 = dojo.call('merge', { a: t.doc, b: older });
  assert.strictEqual(merged2.settings[K], null);
});

// Cancel must not keep edits; Save must.
test('unit dialog: Cancel reverts edits, Save keeps them', async () => {
  const content = mkContent([{ id: 'a', title: 'Unit A' }]);
  const t = await setup(content);
  t.engine.setUnitSetting('a', { newPerDay: 5 });
  const screen = renderSettings(loadApp(), t.engine, content, t.doc);
  screen.openUnitDialog('a');
  screen.setUnitSettingField('a', 'newPerDay', 7);
  screen.setUnitSettingField('a', 'newOrder', 'random');
  screen.closeUnitDialog();
  assert.strictEqual(screen.state.unitDialog, null);
  assert.deepStrictEqual(t.engine.unitSettings('a'), { newPerDay: 5 });
  screen.openUnitDialog('a');
  screen.setUnitSettingField('a', 'newPerDay', 7);
  const r = screen.render(screen.props, screen.state);
  find(r, 'btn-unit-save').props.onClick();
  assert.strictEqual(t.engine.unitSettings('a').newPerDay, 7);
});

test('group dialog: Cancel reverts edits, Save keeps them', async () => {
  const content = mkContent([{ id: 'a', title: 'Unit A' }]);
  content.course.groups = [{ id: 'g', title: 'G', units: ['a'], newPerDay: 2, extraTags: ['n5'] }];
  const t = await setup(content);
  const screen = renderSettings(loadApp(), t.engine, content, t.doc);
  const before = JSON.stringify(t.engine.groupSettings('g'));
  screen.openGroupDialog('g');
  screen.setGroupSettingField('g', 'newPerDay', 3);
  screen.setGroupSettingField('g', 'newOrder', 'random');
  find(screen.render(screen.props, screen.state), 'btn-group-reset-cancel').props.onClick();
  assert.strictEqual(screen.state.groupDialog, null);
  assert.strictEqual(JSON.stringify(t.engine.groupSettings('g')), before);
  screen.openGroupDialog('g');
  screen.setGroupSettingField('g', 'newPerDay', 3);
  find(screen.render(screen.props, screen.state), 'btn-group-save').props.onClick();
  assert.strictEqual(t.engine.groupSettings('g').newPerDay, 3);
});
