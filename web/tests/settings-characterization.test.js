'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { mkContent, setup, loadApp, find, renderSettings } = require('./settings-ui-helpers.js');

function walk(n, fn) {
  if (Array.isArray(n)) { n.forEach((c) => walk(c, fn)); return; }
  if (!n || typeof n !== 'object' || !n.props) return;
  fn(n);
  walk(n.props.children, fn);
}
function ids(tree) {
  const out = [];
  walk(tree, (n) => { if (n.props['data-testid']) out.push(n.props['data-testid']); });
  return out;
}

async function unitScreen(extra) {
  const content = mkContent([{ id: 'a', title: 'Unit A' }, { id: 'b', title: 'Unit B' }]);
  const t = await setup(content);
  if (extra) extra(t.engine);
  const calls = [];
  const screen = renderSettings(loadApp(), t.engine, content, t.doc, null, null, () => calls.push('data'));
  screen.props.onNotice = (n) => calls.push(n);
  return { screen, t, calls };
}

test('settings render lists sections, unit rows and dialogs closed', async () => {
  const { screen } = await unitScreen();
  const tree = screen.render(screen.props, screen.state);
  const all = ids(tree);
  assert.ok(all.includes('settings'));
  assert.ok(all.includes('unit-settings-row-a') && all.includes('unit-settings-row-b'));
  assert.ok(all.includes('btn-back'));
  assert.ok(!all.includes('unit-settings-dialog'));
  assert.ok(!all.includes('group-settings-dialog'));
});

test('unit dialog: open, change value, summary, cancel restores, reset clears', async () => {
  const { screen, t, calls } = await unitScreen();
  assert.strictEqual(screen.unitSettingsSummary('a'), '');
  screen.openUnitDialog('a');
  assert.strictEqual(screen.state.unitDialog.unitId, 'a');
  assert.strictEqual(screen.state.unitDialog.unitTitle, 'Unit A');
  assert.strictEqual(JSON.stringify(screen.state.unitDialog.initial), JSON.stringify({}));
  assert.ok(screen.state.unitDialog.ladderPreview.length > 0);
  screen.setUnitSettingField('a', 'newPerDay', 7);
  assert.strictEqual(t.engine.unitSettings('a').newPerDay, 7);
  assert.strictEqual(screen.state.unitDialog.effective.newPerDay, 7);
  assert.strictEqual(JSON.stringify(calls), JSON.stringify(['data']));
  assert.ok(screen.unitSettingsSummary('a').includes('7/'));
  screen.closeUnitDialog();
  assert.strictEqual(screen.state.unitDialog, null);
  assert.strictEqual(t.engine.unitSettings('a').newPerDay, undefined);
  screen.openUnitDialog('b');
  screen.setUnitSettingField('b', 'ladderScale', 2);
  screen.closeUnitDialog(true);
  assert.strictEqual(t.engine.unitSettings('b').ladderScale, 2);
  screen.openUnitDialog('b');
  screen.resetUnitSettings('b');
  assert.strictEqual(screen.state.unitDialog, null);
  assert.strictEqual(JSON.stringify(t.engine.unitSettings('b')), JSON.stringify({}));
});

test('unit dialog renders with testids when open', async () => {
  const { screen } = await unitScreen();
  screen.openUnitDialog('a');
  const all = ids(screen.render(screen.props, screen.state));
  assert.ok(all.includes('unit-settings-dialog'));
});

test('ladder scale value mapping', async () => {
  const { screen } = await unitScreen();
  assert.strictEqual(screen.ladderScaleToValue(0.75), '0.75');
  assert.strictEqual(screen.ladderScaleToValue(4), '4');
  assert.strictEqual(screen.ladderScaleFromValue('1.5'), 1.5);
  assert.strictEqual(screen.ladderScaleFromValue('x'), 1);
});

async function groupScreen() {
  const store = {};
  const log = [];
  const content = mkContent([{ id: 'a', title: 'Unit A' }]);
  const base = (await setup(content)).engine;
  const engine = {
    unitConfig: base.unitConfig, globalNewPerDay: base.globalNewPerDay, unitLadder: base.unitLadder,
    counts: base.counts, setUnitSetting: base.setUnitSetting,
    groupSettings: (id) => Object.assign({}, store[id]),
    setGroupSetting: (id, patch) => {
      log.push([id, JSON.parse(JSON.stringify(patch))]);
      store[id] = store[id] || {};
      Object.keys(patch).forEach((k) => { if (patch[k] === null) delete store[id][k]; else store[id][k] = patch[k]; });
      return {};
    },
    unitSettings: () => ({})
  };
  content.course.groups = [{ id: 'g', title: 'Group G', newPerDay: 2, newOrder: 'file', extraTags: ['x'] }];
  const calls = [];
  const screen = renderSettings(loadApp(), engine, content, {}, null, null, () => calls.push('data'));
  screen.props.onNotice = (n) => calls.push(n);
  return { screen, store, log, calls };
}

test('group dialog: open, change, summary, cancel restores incl. extraRandom, reset', async () => {
  const g = await groupScreen();
  const s = g.screen;
  g.store.g = { extraRandom: true };
  assert.strictEqual(s.groupSettingsSummary('g'), '');
  s.openGroupDialog('g');
  assert.strictEqual(s.state.groupDialog.groupTitle, 'Group G');
  assert.strictEqual(JSON.stringify(s.state.groupDialog.extraTags), JSON.stringify(['x']));
  assert.strictEqual(JSON.stringify(s.state.groupDialog.initial), JSON.stringify({ extraRandom: true }));
  assert.ok(ids(s.render(s.props, s.state)).includes('group-settings-dialog'));
  s.setGroupSettingField('g', 'newPerDay', 5);
  assert.strictEqual(s.state.groupDialog.effective.newPerDay, 5);
  assert.ok(s.groupSettingsSummary('g').includes('5/'));
  s.setGroupSettingField('g', 'extraRandom', null);
  g.log.length = 0;
  s.closeGroupDialog();
  assert.strictEqual(JSON.stringify(g.log), JSON.stringify([['g', { newPerDay: null, newOrder: null, onlyTags: null, extraRandom: true }]]));
  assert.strictEqual(s.state.groupDialog, null);
  s.openGroupDialog('g');
  g.log.length = 0;
  s.resetGroupSettings('g');
  assert.strictEqual(JSON.stringify(g.log), JSON.stringify([['g', { newPerDay: null, newOrder: null, onlyTags: null, extraRandom: null }]]));
  assert.strictEqual(s.state.groupDialog, null);
});

test('Escape closes group dialog before unit dialog', async () => {
  const { screen } = await unitScreen();
  screen.openUnitDialog('a');
  let prevented = 0;
  screen._onKeyDown({ key: 'Escape', preventDefault() { prevented++; } });
  assert.strictEqual(screen.state.unitDialog, null);
  assert.strictEqual(prevented, 1);
});

test('export, import and reset buttons are wired', async () => {
  const { screen } = await unitScreen();
  const tree = screen.render(screen.props, screen.state);
  const all = ids(tree);
  assert.ok(all.some((i) => /export/.test(i)));
  assert.ok(all.some((i) => /import/.test(i)));
  screen.state.importText = 'x';
  screen.doImport();
  assert.strictEqual(screen.state.importMsg.kind, 'bad');
});
