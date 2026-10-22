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

// Test 1: unit ladder is used for due computation
test('unit ladder is used for answer and due computation', async () => {
  const units = [
    {
      id: 'fast',
      title: 'Fast',
      srs: { ladder: [0, 3600000, 86400000] } // 1 hour, 1 day intervals
    }
  ];
  const content = simpleContent(units);
  const t = await setup(content);
  
  // Start a daily session and answer correctly
  const s = t.engine.start('daily');
  assert.strictEqual(s.total, 3);
  
  const item = s.current().item;
  s.answer({ text: 'afast1' });
  
  // Check that the record uses the unit ladder
  const rec = t.doc.items[item.id];
  assert.strictEqual(rec.s, 1);
  // With fast ladder [0, 3600000, 86400000], stage 1 should have due = NOW + 3600000
  assert.strictEqual(rec.due, NOW + 3600000);
});

// Test 2: unit with cap 0 gives no new items
test('unit with newPerDay cap 0 gives no new items in daily queue', async () => {
  const units = [
    { id: 'blocked', title: 'Blocked', newPerDay: 0 },
    { id: 'open', title: 'Open' }
  ];
  const content = simpleContent(units);
  const t = await setup(content);
  
  // Set up settings to allow new items
  t.doc.settings.newPerDay = 100;
  
  const s = t.engine.start('daily');
  const list = ids(s);
  
  // blocked unit items should not appear
  assert.ok(!list.includes('blocked-1'));
  assert.ok(!list.includes('blocked-2'));
  assert.ok(!list.includes('blocked-3'));
  // open unit items should appear
  assert.ok(list.includes('open-1'));
  assert.ok(list.includes('open-2'));
  assert.ok(list.includes('open-3'));
});

// Test 3: absent unit settings give identical queue to pre-change behaviour
test('absent unit settings give identical queue to pre-change behaviour', async () => {
  const units = [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' }
  ];
  const content = simpleContent(units);
  const t = await setup(content);
  
  // Set up settings to allow new items
  t.doc.settings.newPerDay = 10;
  
  const s = t.engine.start('daily');
  const list = ids(s);
  
  // All items should appear in order (no unit caps applied)
  assert.deepStrictEqual(list, ['a-1', 'a-2', 'a-3', 'b-1', 'b-2', 'b-3']);
});

// Test 4: placement uses the unit ladder
test('placement uses the unit ladder', async () => {
  const units = [
    {
      id: 'custom',
      title: 'Custom',
      srs: { ladder: [0, 7200000, 172800000] } // 2 hours, 2 days
    }
  ];
  const content = simpleContent(units);
  content.course.placement = { mode: 'self', perUnit: 3 };
  
  const t = await setup(content);
  
  const s = t.engine.start('placement');
  assert.strictEqual(s.total, 3);
  
  // Answer all as known
  for (let c = s.current(); c; c = s.next()) {
    s.answer({ rating: 'known' });
  }
  
  s.finish();
  
  // Check that all items have records with the custom ladder
  // With placement, known items go to stage 4 (or highest stage <= 4)
  // With ladder [0, 7200000, 172800000], max stage is 2, so placement stage is 2
  for (let i = 1; i <= 3; i++) {
    const rec = t.doc.items['custom-' + i];
    assert.strictEqual(rec.s, 2);
    // Due should be spread over the ladder[2] interval: ladder[2] * (0.6 + 0.8 * rand)
    // So between NOW + 0.6 * 172800000 and NOW + 1.4 * 172800000
    const minDue = NOW + Math.floor(0.6 * 172800000);
    const maxDue = NOW + Math.floor(1.4 * 172800000);
    assert.ok(rec.due >= minDue && rec.due <= maxDue, `Due ${rec.due} not in range [${minDue}, ${maxDue}]`);
  }
});

// Test 5: practice uses unit ladder
test('practice uses the unit ladder', async () => {
  const units = [
    {
      id: 'slow',
      title: 'Slow',
      srs: { ladder: [0, 86400000, 172800000, 432000000] } // 1 day, 2 days, 5 days
    }
  ];
  const content = simpleContent(units);
  const t = await setup(content);
  
  // Add a record at stage 1 for slow-1 with due in the past so it's due
  t.doc.items['slow-1'] = { s: 1, due: NOW - 1000, ok: 1, bad: 0, last: NOW - DAY };
  
  const s = t.engine.start('practice', { units: ['slow'] });
  const item = s.current().item;
  assert.strictEqual(item.id, 'slow-1');
  
  // Answer correctly
  s.answer({ text: 'aslow1' });
  
  // Check that the record uses the slow ladder
  const rec = t.doc.items['slow-1'];
  assert.strictEqual(rec.s, 2);
  // With slow ladder, stage 2 interval is 172800000 (2 days)
  assert.strictEqual(rec.due, NOW + 172800000);
});

// Test 6: relearn uses unit ladder
test('relearn uses the unit ladder', async () => {
  const units = [
    {
      id: 'relearn',
      title: 'Relearn',
      srs: { ladder: [0, 3600000, 7200000] } // 1 hour, 2 hours
    }
  ];
  const content = simpleContent(units);
  const t = await setup(content);
  
  const s = t.engine.start('daily');
  const first = s.current().item;
  
  // Answer incorrectly first
  s.answer({ text: 'wrong' });
  assert.strictEqual(t.doc.items[first.id].s, 0);
  
  // Go through all items
  while (s.index < s.total - 1) s.next();
  s.next();
  
  // Now we have a relearn copy
  const copy = s.current();
  assert.strictEqual(copy.item.id, first.id);
  
  // Answer correctly on relearn
  s.answer({ text: 'arelearn1' });
  
  // Check that the record uses the relearn ladder
  const rec = t.doc.items[first.id];
  assert.strictEqual(rec.s, 1);
  // With relearn ladder [0, 3600000, 7200000], stage 1 interval is 3600000 (1 hour)
  assert.strictEqual(rec.due, NOW + 3600000);
});

// Test 7: unit with cap 0 and more new button
test('more new respects unit cap of 0', async () => {
  const units = [
    { id: 'blocked', title: 'Blocked', newPerDay: 0 },
    { id: 'open', title: 'Open' }
  ];
  const content = simpleContent(units);
  const t = await setup(content);
  
  // Use up the allowance
  t.doc.settings.newPerDay = 3;
  const s = t.engine.start('daily');
  const list = ids(s);
  
  // All open items should be in the queue, no blocked items
  assert.ok(list.includes('open-1'));
  assert.ok(list.includes('open-2'));
  assert.ok(list.includes('open-3'));
  assert.ok(!list.includes('blocked-1'));
  assert.ok(!list.includes('blocked-2'));
  assert.ok(!list.includes('blocked-3'));
  
  // Add more allowance
  t.engine.moreNew(10);
  
  // Start another daily session - blocked items still should not appear
  const s2 = t.engine.start('daily');
  const list2 = ids(s2);
  
  assert.ok(!list2.includes('blocked-1'));
  assert.ok(!list2.includes('blocked-2'));
  assert.ok(!list2.includes('blocked-3'));
});

// Test 8: placement uses course ladder when unit has no ladder
test('placement falls back to course ladder when unit has no ladder', async () => {
  const units = [
    { id: 'plain', title: 'Plain' }
  ];
  const content = simpleContent(units);
  content.course.srs = { ladder: [0, 7200000, 14400000] }; // Custom course ladder
  content.course.placement = { mode: 'self', perUnit: 3 };
  
  const t = await setup(content);
  
  const s = t.engine.start('placement');
  assert.strictEqual(s.total, 3);
  
  // Answer all as known
  for (let c = s.current(); c; c = s.next()) {
    s.answer({ rating: 'known' });
  }
  
  s.finish();
  
  // Check that records use the course ladder
  for (let i = 1; i <= 3; i++) {
    const rec = t.doc.items['plain-' + i];
    assert.strictEqual(rec.s, 2); // max stage in course ladder is 2
    // Due should be spread over ladder[2] = 14400000
    assert.ok(rec.due >= NOW && rec.due <= NOW + 14400000);
  }
});

test('srsByType ladder still applies when the unit has no ladder', async () => {
  const content = simpleContent([{ id: 'u', title: 'U' }]);
  content.course.srsByType = { gap: { ladder: [0, 7200000, 86400000] } };
  const t = await setup(content);
  const s = t.engine.start('daily');
  const item = s.current().item;
  s.answer({ text: 'au1' });
  assert.strictEqual(t.doc.items[item.id].due, NOW + 7200000);
});

test('unit ladder wins over srsByType', async () => {
  const content = simpleContent([{ id: 'u', title: 'U', srs: { ladder: [0, 3600000] } }]);
  content.course.srsByType = { gap: { ladder: [0, 7200000] } };
  const t = await setup(content);
  const s = t.engine.start('daily');
  s.answer({ text: 'au1' });
  assert.strictEqual(t.doc.items['u-1'].due, NOW + 3600000);
});

test('unit cap is per day across sessions', async () => {
  const t = await setup(simpleContent([{ id: 'c', title: 'C', newPerDay: 2 }]));
  t.doc.settings.newPerDay = 100;
  assert.strictEqual(t.engine.counts().newToday, 2);
  const s1 = t.engine.start('daily');
  assert.strictEqual(s1.total, 2);
  s1.answer({ text: 'ac1' });
  s1.next();
  s1.answer({ text: 'ac2' });
  assert.strictEqual(t.doc.stats['newBy:c'][TODAY], 2);
  assert.strictEqual(t.engine.counts().newToday, 0);
  const s2 = t.engine.start('daily');
  assert.strictEqual(s2.error, 'empty');
});

test('unit cap partly used leaves remainder; counts().newToday respects caps', async () => {
  const t = await setup(simpleContent([{ id: 'c', title: 'C', newPerDay: 2 }, { id: 'z', title: 'Z', newPerDay: 0 }, { id: 'f', title: 'F' }]));
  t.doc.settings.newPerDay = 100;
  assert.strictEqual(t.engine.counts().newToday, 5);
  const s1 = t.engine.start('daily');
  s1.answer({ text: 'ac1' });
  assert.strictEqual(t.engine.counts().newToday, 4);
  t.engine.moreNew(10);
  assert.strictEqual(t.engine.counts().newToday, 4);
});

test('per-unit used-today survives real wasm sanitize and merge', async () => {
  const t = await setup(simpleContent([{ id: 'c', title: 'C', newPerDay: 2 }]));
  t.doc.settings.newPerDay = 100;
  const s = t.engine.start('daily');
  s.answer({ text: 'ac1' });
  s.next();
  s.answer({ text: 'ac2' });
  const dojo = await getDojo();
  const clean = dojo.call('sanitize', t.doc);
  assert.strictEqual(clean.stats['newBy:c'][TODAY], 2);
  const other = JSON.parse(JSON.stringify(t.doc));
  other.stats['newBy:c'][TODAY] = 1;
  const merged = dojo.call('merge', { a: other, b: t.doc });
  assert.strictEqual(merged.stats['newBy:c'][TODAY], 2);
  t.doc.stats = merged.stats;
  assert.strictEqual(t.engine.counts().newToday, 0);
});
