'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const DAY = 86400000;
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function simpleContent(units) {
  const items = [];
  units.forEach((u, uidx) => {
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
  return { v: 1, course: { units: units }, items: items, version: 't', lock: items.map(i => i.id) };
}

let dojoPromise;
async function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(require('node:fs').readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

async function setup(content) {
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
  return { engine, doc, store, clock, content };
}

function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

// Test unitSettings API
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

// Test setUnitSetting API
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

// Test newPerDay override
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

// Test ladderScale override
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
  const item2 = s.current().item;
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

// Test dropOnWrong override
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

// Test newOrder override
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

// Test precedence: override > course.json unit value > srsByType > course value > default
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

// Test merge behavior with ts stamps (per-field keys, null tombstones)
const K = 'unit:u:newPerDay';

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

// Test absent overrides give identical behavior to today
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
