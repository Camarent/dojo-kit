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

test('later set on the stale device wins again after a clear', async () => {
  const dojo = await getDojo();
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.engine.setUnitSetting('u', { newPerDay: 5 });
  const staleA = JSON.parse(JSON.stringify(t.doc));
  t.clock.t += 1000;
  t.engine.setUnitSetting('u', { newPerDay: null });
  const deviceB = JSON.parse(JSON.stringify(t.doc));
  assert.strictEqual(dojo.call('merge', { a: staleA, b: deviceB }).settings[K], null);
  staleA.settings[K] = 7;
  staleA.settings.ts[K] = deviceB.settings.ts[K] + 1000;
  const merged = dojo.call('merge', { a: deviceB, b: staleA });
  assert.strictEqual(merged.settings[K], 7);
});

test('two devices editing different fields of one unit both survive merge', async () => {
  const dojo = await getDojo();
  const t = await setup(simpleContent([{ id: 'u', title: 'U' }]));
  t.engine.setUnitSetting('u', { newPerDay: 5 });
  const other = JSON.parse(JSON.stringify(t.doc));
  other.settings['unit:u:dropOnWrong'] = 3;
  other.settings.ts['unit:u:dropOnWrong'] = t.clock.t + 100;
  const merged = dojo.call('merge', { a: t.doc, b: other });
  assert.strictEqual(merged.settings[K], 5);
  assert.strictEqual(merged.settings['unit:u:dropOnWrong'], 3);
});

test('two devices editing different units both survive merge', async () => {
  const dojo = await getDojo();
  const t = await setup(simpleContent([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]));
  t.engine.setUnitSetting('a', { newPerDay: 5 });
  const other = JSON.parse(JSON.stringify(t.doc));
  other.settings['unit:b:newPerDay'] = 3;
  other.settings.ts['unit:b:newPerDay'] = t.clock.t + 100;
  const merged = dojo.call('merge', { a: t.doc, b: other });
  assert.strictEqual(merged.settings['unit:a:newPerDay'], 5);
  assert.strictEqual(merged.settings['unit:b:newPerDay'], 3);
});

test('absent overrides give identical queue to today', async () => {
  const units = [{ id: 'u', title: 'U' }];
  const content = simpleContent(units);
  const t = await setup(content);
  t.doc.settings.newPerDay = 10;
  
  const s = t.engine.start('daily');
  const list = ids(s);
  
  assert.deepStrictEqual(list, ['u-1', 'u-2', 'u-3']);
});

test('absent overrides give identical ladder to today', async () => {
  const units = [{
    id: 'u',
    title: 'U',
    srs: { ladder: [0, 3600000, 7200000] }
  }];
  const content = simpleContent(units);
  const t = await setup(content);
  
  const s = t.engine.start('daily');
  const item = s.current().item;
  s.answer({ text: 'au1' });
  
  const rec = t.doc.items[item.id];
  assert.strictEqual(rec.due, NOW + 3600000);
});
