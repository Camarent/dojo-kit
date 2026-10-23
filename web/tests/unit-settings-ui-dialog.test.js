'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, mkContent, mkI18n, getDojo, setup, loadApp, find, allText, inst, renderSettings } = require('./settings-ui-helpers.js');

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
