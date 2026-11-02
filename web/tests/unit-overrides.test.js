'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { simpleContent, getDojo, setup2: setup, ids, NOW, TODAY } = require('./fixtures.js');
const DojoSession = require('../session.js');

// Test unitSettings API







// Test setUnitSetting API









// Test newPerDay override



// Test ladderScale override




// Test dropOnWrong override



// Test newOrder override




// Test precedence: override > course.json unit value > srsByType > course value > default


// Test merge behavior with ts stamps (per-field keys, null tombstones)






// Test absent overrides give identical behavior to today

test('unitSettings returns empty object for non-existent override', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  const settings = t.engine.unitSettings('u');
  assert.deepStrictEqual(settings, {});
});

test('unitSettings returns override object', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.doc.settings['unit:u:newPerDay'] = 5;
  t.doc.settings['unit:u:ladderScale'] = 2;
  const settings = t.engine.unitSettings('u');
  assert.strictEqual(settings.newPerDay, 5);
  assert.strictEqual(settings.ladderScale, 2);
});

test('unitSettings validates - integer newPerDay', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.doc.settings['unit:u:newPerDay'] = 5.5;
  const settings = t.engine.unitSettings('u');
  assert.deepStrictEqual(settings, {});
});

test('unitSettings validates - ladderScale range', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.doc.settings['unit:u:ladderScale'] = 5;
  const settings = t.engine.unitSettings('u');
  assert.deepStrictEqual(settings, {});
});

test('unitSettings validates - dropOnWrong range', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.doc.settings['unit:u:dropOnWrong'] = 11;
  const settings = t.engine.unitSettings('u');
  assert.deepStrictEqual(settings, {});
});

test('unitSettings validates - newOrder values', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.doc.settings['unit:u:newOrder'] = 'invalid';
  const settings = t.engine.unitSettings('u');
  assert.deepStrictEqual(settings, {});
});

test('unitSettings ignores the removed whole-object unit:<id> format and null tombstones', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.doc.settings['unit:u'] = { newPerDay: 5 };
  t.doc.settings['unit:u:dropOnWrong'] = null;
  const settings = t.engine.unitSettings('u');
  assert.deepStrictEqual(settings, {});
});

test('setUnitSetting returns error for unknown unit', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  const result = t.engine.setUnitSetting('unknown', { newPerDay: 5 });
  assert.deepStrictEqual(result, { error: 'unknown_unit' });
});

test('setUnitSetting writes valid override', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  const result = t.engine.setUnitSetting('u', { newPerDay: 5 });
  assert.deepStrictEqual(result, {});
  assert.strictEqual(t.doc.settings['unit:u:newPerDay'], 5);
  assert.strictEqual(typeof t.doc.settings.ts['unit:u:newPerDay'], 'number');
  assert.strictEqual(t.doc.settings['unit:u'], undefined);
});

test('setUnitSetting persists through store.update', async () => {
  const content = simpleContent([{ id: 'u', title: 'U' }]);
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {}
  };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  
  engine.setUnitSetting('u', { newPerDay: 5, ladderScale: 2 });
  
  const engine2 = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  
  const settings = engine2.unitSettings('u');
  assert.strictEqual(settings.newPerDay, 5);
  assert.strictEqual(settings.ladderScale, 2);
});

test('setUnitSetting merges patch', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.engine.setUnitSetting('u', { newPerDay: 5 });
  t.engine.setUnitSetting('u', { ladderScale: 2 });
  assert.strictEqual(t.doc.settings['unit:u:newPerDay'], 5);
  assert.strictEqual(t.doc.settings['unit:u:ladderScale'], 2);
});

test('setUnitSetting null tombstones only its own field key', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.engine.setUnitSetting('u', { newPerDay: 5, ladderScale: 2 });
  t.engine.setUnitSetting('u', { newPerDay: null });
  assert.strictEqual(t.doc.settings['unit:u:newPerDay'], null);
  assert.ok('unit:u:newPerDay' in t.doc.settings);
  assert.strictEqual(t.doc.settings['unit:u:ladderScale'], 2);
  assert.deepStrictEqual(t.engine.unitSettings('u'), { ladderScale: 2 });
});

test('setUnitSetting null on an absent field writes nothing', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.engine.setUnitSetting('u', { newPerDay: null });
  assert.strictEqual('unit:u:newPerDay' in t.doc.settings, false);
});

test('setUnitSetting returns bad_value for invalid field', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  const result = t.engine.setUnitSetting('u', { newPerDay: 100 });
  assert.deepStrictEqual(result, { error: 'bad_value' });
});

test('setUnitSetting all-or-nothing: mixed valid and invalid patch', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  const result = t.engine.setUnitSetting('u', { newPerDay: 5, ladderScale: 99 });
  assert.deepStrictEqual(result, { error: 'bad_value' });
  assert.strictEqual(t.doc.settings['unit:u:newPerDay'], undefined);
  assert.strictEqual(t.doc.settings['unit:u:ladderScale'], undefined);
});

test('setUnitSetting updates ts on deletion strictly', async () => {
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.engine.setUnitSetting('u', { newPerDay: 5 });
  const ts1 = t.doc.settings.ts['unit:u:newPerDay'];
  t.clock.t += 1000;
  t.engine.setUnitSetting('u', { newPerDay: null });
  const ts2 = t.doc.settings.ts['unit:u:newPerDay'];
  assert.ok(ts2 > ts1);
  assert.strictEqual(t.doc.settings['unit:u:newPerDay'], null);
});

test('newPerDay override changes cap', async () => {
  const units = [{ id: 'u', title: 'U', newPerDay: 10 }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.doc.settings.newPerDay = 100;
  t.engine.setUnitSetting('u', { newPerDay: 2 });
  const counts = t.engine.counts();
  assert.strictEqual(counts.newToday, 2);
});

test('newPerDay override of 0 blocks unit', async () => {
  const units = [{ id: 'u', title: 'U' }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.doc.settings.newPerDay = 100;
  t.engine.setUnitSetting('u', { newPerDay: 0 });
  const s = t.engine.start('daily');
  assert.strictEqual(s.error, 'empty');
});

test('newPerDay override takes precedence over course', async () => {
  const units = [{ id: 'u', title: 'U', newPerDay: 10 }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.doc.settings.newPerDay = 100;
  t.engine.setUnitSetting('u', { newPerDay: 3 });
  const s = t.engine.start('daily');
  const list = ids(s);
  assert.strictEqual(list.length, 3);
});

test('ladderScale scales ladder intervals', async () => {
  const units = [{
    id: 'u',
    title: 'U',
    srs: { ladder: [0, 3600000, 7200000] } // 1 hour, 2 hours
  }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.engine.setUnitSetting('u', { ladderScale: 2 });
  
  const s = t.engine.start('daily');
  const item = s.current().item;
  s.answer({ text: 'au1' });
  
  const rec = t.doc.items[item.id];
  // With scale 2: [0, 7200000, 14400000]
  assert.strictEqual(rec.due, NOW + 7200000);
});

test('ladderScale 1 is identity', async () => {
  const units = [{
    id: 'u',
    title: 'U',
    srs: { ladder: [0, 3600000, 7200000] }
  }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.engine.setUnitSetting('u', { ladderScale: 1 });
  
  const s = t.engine.start('daily');
  const item = s.current().item;
  s.answer({ text: 'au1' });
  
  const rec = t.doc.items[item.id];
  assert.strictEqual(rec.due, NOW + 3600000);
});
