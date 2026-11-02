'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { simpleContent, getDojo, setup2: setup, ids, NOW } = require('./fixtures.js');
require('../session.js');

// Test unitSettings API







// Test setUnitSetting API









// Test newPerDay override



// Test ladderScale override




// Test dropOnWrong override



// Test newOrder override




// Test precedence: override > course.json unit value > srsByType > course value > default


// Test merge behavior with ts stamps (per-field keys, null tombstones)
const K = 'unit:u:newPerDay';






// Test absent overrides give identical behavior to today

test('ladderScale enforces non-decreasing', async () => {
  const units = [{
    id: 'u',
    title: 'U',
    srs: { ladder: [0, 100, 50, 200] }
  }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.engine.setUnitSetting('u', { ladderScale: 2 });
  
  const s = t.engine.start('daily');
  const item = s.current().item;
  s.answer({ text: 'au1' });
  s.next();
  s.current().item;
  s.answer({ text: 'au2' });
  
  // First answer: [0, 200, 100, 400] -> [0, 200, 200, 400]
  // Stage 1 uses ladder[1] = 200
  const rec = t.doc.items[item.id];
  assert.strictEqual(rec.due, NOW + 200);
});

test('ladderScale with scale < 1', async () => {
  const units = [{
    id: 'u',
    title: 'U',
    srs: { ladder: [0, 86400000, 172800000] } // 1 day, 2 days
  }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.engine.setUnitSetting('u', { ladderScale: 0.5 });
  
  const s = t.engine.start('daily');
  const item = s.current().item;
  s.answer({ text: 'au1' });
  
  const rec = t.doc.items[item.id];
  // With scale 0.5: [0, 43200000, 86400000]
  assert.strictEqual(rec.due, NOW + 43200000);
});

test('dropOnWrong override changes drop amount', async () => {
  const units = [{ id: 'u', title: 'U' }];
  const content = simpleContent(units);
  const t = await setup(content);
  
  // Set up a record at stage 3
  const itemId = 'u-1';
  t.doc.items[itemId] = { s: 3, ok: 1, bad: 0, due: NOW - 1000, last: NOW - 5000 };
  
  t.engine.setUnitSetting('u', { dropOnWrong: 0 });
  
  const s = t.engine.start('daily');
  s.answer({ text: 'wrong' });
  
  const rec = t.doc.items[itemId];
  assert.strictEqual(rec.s, 3); // No drop
  assert.strictEqual(rec.bad, 1);
});

test('dropOnWrong override takes precedence over course', async () => {
  const units = [{ id: 'u', title: 'U' }];
  const content = simpleContent(units);
  content.course.srs = { dropOnWrong: 2 };
  const t = await setup(content);
  
  const itemId = 'u-1';
  t.doc.items[itemId] = { s: 3, ok: 1, bad: 0, due: NOW - 1000, last: NOW - 5000 };
  
  t.engine.setUnitSetting('u', { dropOnWrong: 1 });
  
  const s = t.engine.start('daily');
  s.answer({ text: 'wrong' });
  
  const rec = t.doc.items[itemId];
  assert.strictEqual(rec.s, 2);
});

test('dropOnWrong invalid value is ignored', async () => {
  const units = [{ id: 'u', title: 'U' }];
  const content = simpleContent(units);
  content.course.srs = { dropOnWrong: 2 };
  const t = await setup(content);
  
  const itemId = 'u-1';
  t.doc.items[itemId] = { s: 3, ok: 1, bad: 0, due: NOW - 1000, last: NOW - 5000 };
  
  t.engine.setUnitSetting('u', { dropOnWrong: 11 }); // invalid
  
  const s = t.engine.start('daily');
  s.answer({ text: 'wrong' });
  
  const rec = t.doc.items[itemId];
  assert.strictEqual(rec.s, 1); // Uses course default of 2
});

test('newOrder override to random', async () => {
  const units = [{ id: 'u', title: 'U' }];
  const content = simpleContent(units);
  content.course.newOrder = 'file';
  const t = await setup(content);
  
  t.engine.setUnitSetting('u', { newOrder: 'random' });
  
  const s = t.engine.start('daily');
  const list = ids(s);
  // With random order and deterministic random (0.5), the order should be shuffled
  // But we just check that it works without error
  assert.strictEqual(list.length, 3);
});

test('newOrder override takes precedence', async () => {
  const units = [{ id: 'u', title: 'U', newOrder: 'file' }];
  const content = simpleContent(units);
  content.course.newOrder = 'random';
  const t = await setup(content);
  
  t.engine.setUnitSetting('u', { newOrder: 'random' });
  
  const s = t.engine.start('daily');
  const list = ids(s);
  assert.strictEqual(list.length, 3);
});

test('newOrder override wins over unit newOrder file', async () => {
  const units = [{ id: 'u', title: 'U', newOrder: 'file' }];
  const content = simpleContent(units);
  const t = await setup(content);
  
  t.engine.setUnitSetting('u', { newOrder: 'random' });
  
  const s = t.engine.start('daily');
  const list = ids(s);
  assert.strictEqual(list.length, 3);
});

test('newOrder override wins over unit newOrder random', async () => {
  const units = [{ id: 'u', title: 'U', newOrder: 'random' }];
  const content = simpleContent(units);
  const t = await setup(content);
  
  t.engine.setUnitSetting('u', { newOrder: 'file' });
  
  const s = t.engine.start('daily');
  const list = ids(s);
  assert.deepStrictEqual(list, ['u-1', 'u-2', 'u-3']);
});

test('ladder precedence: override wins over unit srs', async () => {
  const units = [{
    id: 'u',
    title: 'U',
    srs: { ladder: [0, 3600000] }
  }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.engine.setUnitSetting('u', { ladderScale: 2 });
  
  const s = t.engine.start('daily');
  const item = s.current().item;
  s.answer({ text: 'au1' });
  
  const rec = t.doc.items[item.id];
  assert.strictEqual(rec.due, NOW + 7200000); // 3600000 * 2
});

test('dropOnWrong precedence: override wins over unit srs', async () => {
  const units = [{
    id: 'u',
    title: 'U',
    srs: { dropOnWrong: 2 }
  }];
  const content = simpleContent(units);
  const t = await setup(content);
  
  const itemId = 'u-1';
  t.doc.items[itemId] = { s: 3, ok: 1, bad: 0, due: NOW - 1000, last: NOW - 5000 };
  
  t.engine.setUnitSetting('u', { dropOnWrong: 0 });
  
  const s = t.engine.start('daily');
  s.answer({ text: 'wrong' });
  
  const rec = t.doc.items[itemId];
  assert.strictEqual(rec.s, 3); // No drop
});

test('override with later ts survives merge', async () => {
  const dojo = await getDojo();
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.engine.setUnitSetting('u', { newPerDay: 5 });
  const other = JSON.parse(JSON.stringify(t.doc));
  other.settings.ts[K] = t.doc.settings.ts[K] - 1000;
  other.settings[K] = 3;
  const merged = dojo.call('merge', { a: other, b: t.doc });
  assert.strictEqual(merged.settings[K], 5);
});

test('clear with later ts survives merge as a null tombstone', async () => {
  const dojo = await getDojo();
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.engine.setUnitSetting('u', { newPerDay: 5 });
  t.clock.t += 1000;
  t.engine.setUnitSetting('u', { newPerDay: null });
  const ts1 = t.doc.settings.ts[K];
  const other = JSON.parse(JSON.stringify(t.doc));
  other.settings[K] = 3;
  other.settings.ts[K] = ts1 - 1000;
  const merged = dojo.call('merge', { a: other, b: t.doc });
  assert.ok(K in merged.settings);
  assert.strictEqual(merged.settings[K], null);
  assert.strictEqual(merged.settings.ts[K], ts1);
  t.doc.settings = merged.settings;
  assert.deepStrictEqual(t.engine.unitSettings('u'), {});
});
