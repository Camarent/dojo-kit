'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { find, findAll, text, walk, mount, NOW, TODAY } = require('./app-harness.js');

const DAY = 86400000;

// Helper to create items
function choice(id, unit, entity) {
  const it = { id, unit, type: 'choice', prompt: 'Q ' + id, answer: 0, options: ['A', 'B', 'C'], explanation: 'e' };
  if (entity) it.entity = entity;
  return it;
}

function gap(id, unit, entity) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a' + id], explanation: 'e' };
  if (entity) it.entity = entity;
  return it;
}

// A record with bad > 0 means it's a weak item
const weakRec = { s: 1, bad: 1, ok: 0, due: NOW - DAY, last: NOW - DAY };
const normalRec = { s: 2, bad: 0, ok: 5, due: NOW + 9 * DAY, last: NOW - DAY };
const newRec = { s: 0, bad: 0, due: NOW + 9 * DAY };

// Check that the whole screen text contains none of: "undefined", "{", "[object"
function assertNoBadStrings(tree) {
  const fullText = text(tree);
  assert.ok(!fullText.includes('undefined'), 'Screen contains "undefined": ' + fullText);
  assert.ok(!fullText.includes('{'), 'Screen contains "{": ' + fullText);
  assert.ok(!fullText.includes('[object'), 'Screen contains "[object": ' + fullText);
}

// Helper to check if weak chips are shown
function assertWeakChipsShown(m, expectedCount) {
  m.app.refresh();
  const tree = m.tree();
  
  // Check that weak-chips element exists
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips element should exist when there are weak items');
  
  // Check that btn-weak exists
  const btnWeak = find(tree, 'btn-weak');
  assert.ok(btnWeak, 'btn-weak button should exist when there are weak items');
  
  // Check the aria-label has the count
  if (expectedCount !== undefined) {
    assert.ok(btnWeak.props['aria-label'].includes(String(expectedCount)), 
      'btn-weak should have aria-label with count ' + expectedCount);
  }
  
  // Count the li elements inside weak-chips
  let liCount = 0;
  walk(weakChips, (n) => { if (n.type === 'li') liCount++; });
  if (expectedCount !== undefined) {
    assert.strictEqual(liCount, expectedCount, 'Should have ' + expectedCount + ' li elements');
  } else {
    assert.ok(liCount > 0, 'Should have at least one li element');
  }
  
  // Check no bad strings in the whole screen
  assertNoBadStrings(tree);
}

function assertWeakChipsNotShown(m) {
  m.app.refresh();
  const tree = m.tree();
  
  // Check that weak-chips element does NOT exist
  const weakChips = find(tree, 'weak-chips');
  assert.strictEqual(weakChips, null, 'weak-chips element should not exist when no weak items');
  
  // Check that btn-weak does NOT exist
  const btnWeak = find(tree, 'btn-weak');
  assert.strictEqual(btnWeak, null, 'btn-weak button should not exist when no weak items');
  
  // Check no bad strings in the whole screen
  assertNoBadStrings(tree);
}

// Test 1: Plain unit item - answer wrong in daily mode, then check home shows weak chips
test('weak-chips: plain item wrong answer in daily -> chips shown', async () => {
  const items = [choice('i1', 'u1'), choice('i2', 'u1'), choice('i3', 'u1')];
  const course = { id: 'test', title: 'Test', units: [{ id: 'u1', title: 'U1' }] };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Initially no weak items
  assertWeakChipsNotShown(m);
  
  // Answer i1 wrong in daily mode
  const s1 = m.engine.start('daily');
  assert.strictEqual(s1.current().item.id, 'i1');
  s1.answer({ index: 1 }); // wrong answer (correct is index 0)
  s1.next();
  s1.finish();
  
  // Now weakList should include i1
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 1, 'weakList should have 1 item');
  assert.strictEqual(weakList[0].id, 'i1', 'weakList should include i1');
  
  // Home should show weak chips
  assertWeakChipsShown(m, 1);
});

// Test 2: Plain unit item - answer wrong in practice mode, then check home shows weak chips
test('weak-chips: plain item wrong answer in practice -> chips shown', async () => {
  const items = [choice('i1', 'u1'), choice('i2', 'u1')];
  const course = { id: 'test', title: 'Test', units: [{ id: 'u1', title: 'U1' }] };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Answer i1 wrong in practice mode
  const s1 = m.engine.start('practice');
  assert.strictEqual(s1.current().item.id, 'i1');
  s1.answer({ index: 1 }); // wrong answer
  s1.next();
  s1.finish();
  
  // Now weakList should include i1
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 1, 'weakList should have 1 item');
  assert.strictEqual(weakList[0].id, 'i1', 'weakList should include i1');
  
  // Home should show weak chips
  assertWeakChipsShown(m, 1);
});

// Test 3: Entity-scoped item - answer wrong, then check home shows weak chips
test('weak-chips: entity-scoped item wrong answer -> chips shown', async () => {
  const items = [gap('e1a', 'u1', 'E1'), gap('e1b', 'u1', 'E1'), gap('e1c', 'u1', 'E1')];
  const course = { 
    id: 'test', 
    title: 'Test', 
    units: [{ id: 'u1', srs: { scope: 'entity', dropOnWrong: 1 } }] 
  };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Initially no weak items
  assertWeakChipsNotShown(m);
  
  // Answer e1a wrong in practice mode
  const s1 = m.engine.start('practice', { units: ['u1'] });
  // Find e1a in the session
  while (s1.current() && s1.current().item.id !== 'e1a') {
    s1.next();
  }
  assert.strictEqual(s1.current().item.id, 'e1a');
  s1.answer({ text: 'wrong' }); // wrong answer
  s1.next();
  s1.finish();
  
  // Now weakList should include one item from the entity (only first one with bad>0)
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 1, 'weakList should have 1 item for the entity');
  
  // Home should show weak chips
  assertWeakChipsShown(m, 1);
});

// Test 4: Item in retired unit - should not show in weak chips
test('weak-chips: retired item with bad>0 -> not shown', async () => {
  const items = [
    { id: 'r1', unit: 'u1', type: 'choice', prompt: 'Q r1', answer: 0, options: ['A', 'B'], explanation: 'e', status: 'retired' },
    choice('a1', 'u2')
  ];
  const course = { 
    id: 'test', 
    title: 'Test', 
    units: [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }] 
  };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Manually set a record with bad>0 for the retired item
  m.doc.items.r1 = weakRec;
  
  // weakList should NOT include retired items (filtered by activeItems)
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 0, 'weakList should not include retired items');
  
  // Home should not show weak chips
  assertWeakChipsNotShown(m);
});

// Test 5: Item in unit with newPerDay:0 - should still show in weak chips (activeItems doesn't filter by newPerDay)
test('weak-chips: item in unit with newPerDay:0 but has bad>0 -> chips shown', async () => {
  const items = [choice('n1', 'u1'), choice('n2', 'u1')];
  const course = { 
    id: 'test', 
    title: 'Test', 
    units: [{ id: 'u1', newPerDay: 0 }] 
  };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Answer n1 wrong in practice mode (daily might be empty due to newPerDay:0)
  const s1 = m.engine.start('practice');
  s1.answer({ index: 1 }); // wrong
  s1.next();
  s1.finish();
  
  // weakList should include n1 even though unit has newPerDay:0
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 1, 'weakList should include item even with newPerDay:0');
  assert.strictEqual(weakList[0].id, 'n1', 'weakList should include n1');
  
  // Home should show weak chips
  assertWeakChipsShown(m, 1);
});

// Test 6: Home re-rendered after returning from Results - check it's recomputed
test('weak-chips: home re-rendered after Results -> chips shown', async () => {
  const items = [choice('i1', 'u1'), choice('i2', 'u1')];
  const course = { id: 'test', title: 'Test', units: [{ id: 'u1', title: 'U1' }] };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Initially no weak items
  assertWeakChipsNotShown(m);
  
  // Answer i1 wrong in daily mode
  const s1 = m.engine.start('daily');
  s1.answer({ index: 1 }); // wrong
  s1.next();
  const summary = s1.finish();
  
  // Go to results screen
  m.app.endSession(summary);
  assert.strictEqual(m.app.state.screen, 'results');
  
  // Go back to home
  m.app.go('home');
  
  // Now weakList should include i1
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 1, 'weakList should have 1 item after returning from results');
  
  // Home should show weak chips
  assertWeakChipsShown(m, 1);
});

// Test 7: Wrong answer in EXAM session (non-training) - does it set bad?
test('weak-chips: wrong answer in timed exam -> bad is set, chips shown', async () => {
  const items = [choice('i1', 'u1'), choice('i2', 'u1')];
  const course = { 
    id: 'test', 
    title: 'Test', 
    units: [{ id: 'u1', title: 'U1' }],
    exams: [{ id: 'e1', sections: [{ title: 'S', count: 2 }], minutes: 30 }] 
  };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Initially no weak items
  assertWeakChipsNotShown(m);
  
  // Answer i1 wrong in exam mode
  const s1 = m.engine.start('exam', { examId: 'e1' });
  assert.strictEqual(s1.current().item.id, 'i1');
  s1.answer({ index: 1 }); // wrong
  s1.next();
  // Don't finish, just check the record
  
  // Check if bad was set in the record
  // Note: exam mode writes records via commit, so bad should be incremented
  const rec = m.doc.items.i1;
  assert.ok(rec, 'Record should exist for i1');
  // In exam mode, wrong answers DO increment bad
  assert.strictEqual(rec.bad, 1, 'bad should be 1 for wrong answer in exam');
  
  // Finish the exam
  s1.finish();
  
  // Now weakList should include i1
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 1, 'weakList should have 1 item');
  assert.strictEqual(weakList[0].id, 'i1', 'weakList should include i1');
  
  // Home should show weak chips
  assertWeakChipsShown(m, 1);
  
  s1.release && s1.release();
});

// Test 8: Wrong answer in EXAM session (training mode) - does it set bad?
test('weak-chips: wrong answer in training exam -> bad is set, chips shown', async () => {
  const items = [choice('i1', 'u1'), choice('i2', 'u1')];
  const course = { 
    id: 'test', 
    title: 'Test', 
    units: [{ id: 'u1', title: 'U1' }],
    exams: [{ id: 'e1', sections: [{ title: 'S', count: 2 }] }] 
  };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Initially no weak items
  assertWeakChipsNotShown(m);
  
  // Answer i1 wrong in training exam mode
  const s1 = m.engine.start('exam', { examId: 'e1', training: true });
  assert.strictEqual(s1.current().item.id, 'i1');
  s1.answer({ index: 1 }); // wrong
  s1.next();
  
  // Check if bad was set
  const rec = m.doc.items.i1;
  assert.ok(rec, 'Record should exist for i1');
  assert.strictEqual(rec.bad, 1, 'bad should be 1 for wrong answer in training exam');
  
  s1.finish();
  
  // Now weakList should include i1
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 1, 'weakList should have 1 item');
  
  // Home should show weak chips
  assertWeakChipsShown(m, 1);
  
  s1.release && s1.release();
});

// Test 9: Wrong answer in PLACEMENT session - does it set bad?
test('weak-chips: wrong answer in placement -> bad is NOT set, chips NOT shown', async () => {
  const items = [choice('i1', 'u1'), choice('i2', 'u1')];
  const course = { 
    id: 'test', 
    title: 'Test', 
    units: [{ id: 'u1', title: 'U1' }],
    placement: { mode: 'check', perUnit: 2 }
  };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Initially no weak items
  assertWeakChipsNotShown(m);
  
  // Answer i1 wrong in placement mode
  const s1 = m.engine.start('placement');
  assert.strictEqual(s1.current().item.id, 'i1');
  s1.answer({ index: 1 }); // wrong
  s1.next();
  s1.finish();
  
  // Check if bad was set
  // In placement mode, apply_placement returns record unchanged for wrong answers
  const rec = m.doc.items.i1;
  // If there was no record before, rec might still be undefined
  // If there was a record, it should be unchanged (bad not incremented)
  if (rec) {
    assert.strictEqual(rec.bad, 0, 'bad should NOT be incremented for wrong answer in placement');
  }
  
  // weakList should NOT include i1
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 0, 'weakList should be empty for placement wrong answers');
  
  // Home should not show weak chips
  assertWeakChipsNotShown(m);
});

// Test 10: Multiple wrong answers in one session - check chips show correct count
test('weak-chips: 2 wrong answers in one session -> chips show both', async () => {
  const items = [choice('i1', 'u1'), choice('i2', 'u1'), choice('i3', 'u1')];
  const course = { id: 'test', title: 'Test', units: [{ id: 'u1', title: 'U1' }] };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Answer i1 and i2 wrong in daily mode
  const s1 = m.engine.start('daily');
  s1.answer({ index: 1 }); // wrong for i1
  s1.next();
  s1.answer({ index: 1 }); // wrong for i2
  s1.next();
  s1.finish();
  
  // Now weakList should include both i1 and i2
  const weakList = m.engine.weakList(8);
  assert.strictEqual(weakList.length, 2, 'weakList should have 2 items');
  
  // Home should show weak chips with 2 items
  assertWeakChipsShown(m, 2);
});
