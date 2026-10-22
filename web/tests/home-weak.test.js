'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { find, findAll, text, walk, mount, NOW } = require('./app-harness.js');

const DAY = 86400000;

// Helper to create a gap item with optional entity
function gap(id, unit, entity) {
  const it = { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e' };
  if (entity) it.entity = entity;
  return it;
}

// Helper to create items with markup in prompt
function gapWithMarkup(id, unit, prompt) {
  return { id, unit, type: 'gap', prompt: prompt, answers: ['a'], explanation: 'e' };
}

const ITEMS = [
  gap('k1', 'kanji', 'E1'),
  gap('v1', 'vocab', 'E1'),
  gap('k2', 'kanji', 'E2'),
  gap('v2', 'vocab', 'E2'),
  gap('k3', 'kanji', 'E3'),
  gap('k4', 'kanji', 'E4'),
  gap('g1', 'grammar'),
  gap('g2', 'grammar'),
  gap('g3', 'grammar'),
  gap('o1', 'other'),
  gap('o2', 'other'),
  gap('o3', 'other')
];

const COURSE = {
  learnedStage: 1,
  units: [
    { id: 'kanji', title: 'Kanji' },
    { id: 'vocab', title: 'Vocab' },
    { id: 'grammar', title: 'Grammar' },
    { id: 'other', title: 'Other unit' }
  ]
};

// A record with bad > 0 means it's a weak item
const weakRec = { s: 0, bad: 1, due: NOW - DAY };
const normalRec = { s: 1, due: NOW + 9 * DAY };
const newRec = { s: 0, due: NOW + 9 * DAY };

// Check that the whole screen text contains none of: "undefined", "{", "[object"
function assertNoBadStrings(tree) {
  const fullText = text(tree);
  assert.ok(!fullText.includes('undefined'), 'Screen contains "undefined": ' + fullText);
  assert.ok(!fullText.includes('{'), 'Screen contains "{": ' + fullText);
  assert.ok(!fullText.includes('[object'), 'Screen contains "[object": ' + fullText);
}

async function homeWithWeak(lang, weakItems) {
  // Create a minimal setup with specific weak items
  const items = ITEMS.slice(0, 3).map(it => ({ ...it }));
  const course = { ...COURSE, units: COURSE.units.slice(0, 2) };
  
  const m = await mount({ items, course, lang });
  
  // Set records to create weak items
  weakItems.forEach(id => {
    m.doc.items[id] = { ...weakRec };
  });
  
  // Ensure other items are not weak
  items.forEach(it => {
    if (!weakItems.includes(it.id)) {
      m.doc.items[it.id] = normalRec;
    }
  });
  
  m.app.refresh();
  return m;
}

async function homeWithNoWeak(lang) {
  // Create a setup with no weak items
  const items = ITEMS.slice(0, 3).map(it => ({ ...it }));
  const course = { ...COURSE, units: COURSE.units.slice(0, 2) };
  
  const m = await mount({ items, course, lang });
  
  // Set all records to non-weak (bad: 0)
  items.forEach(it => {
    m.doc.items[it.id] = normalRec;
  });
  
  m.app.refresh();
  return m;
}

test('weak-chips: bad records present -> chips shown with prompts', async () => {
  const m = await homeWithWeak('en', ['k1', 'v1', 'k2']);
  const tree = m.tree();
  
  // Check that weak-chips element exists
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips element should exist');
  
  // Check that btn-weak exists
  const btnWeak = find(tree, 'btn-weak');
  assert.ok(btnWeak, 'btn-weak button should exist');
  
  // Check that btn-weak has aria-label with count
  assert.ok(btnWeak.props['aria-label'].includes('3'), 'btn-weak should have aria-label with count 3');
  
  // Check that we have up to 8 chips (we have 3 weak items)
  const chips = findAll(tree, /^weak-chips/);
  assert.ok(chips.length === 1, 'Should have one weak-chips element');
  
  // Count the li elements inside weak-chips
  let liCount = 0;
  walk(weakChips, (n) => { if (n.type === 'li') liCount++; });
  assert.strictEqual(liCount, 3, 'Should have 3 li elements for 3 weak items');
  
  // Check that the chips contain the prompts
  const fullText = text(weakChips);
  assert.ok(fullText.includes('Q k1'), 'Should contain prompt for k1');
  assert.ok(fullText.includes('Q v1'), 'Should contain prompt for v1');
  assert.ok(fullText.includes('Q k2'), 'Should contain prompt for k2');
  
  // Check no bad strings in the whole screen
  assertNoBadStrings(tree);
});

test('weak-chips: no weak items -> no weak-chips and no btn-weak', async () => {
  const m = await homeWithNoWeak('en');
  const tree = m.tree();
  
  // Check that weak-chips element does NOT exist
  const weakChips = find(tree, 'weak-chips');
  assert.strictEqual(weakChips, null, 'weak-chips element should not exist when no weak items');
  
  // Check that btn-weak does NOT exist
  const btnWeak = find(tree, 'btn-weak');
  assert.strictEqual(btnWeak, null, 'btn-weak button should not exist when no weak items');
  
  // Check no bad strings in the whole screen
  assertNoBadStrings(tree);
});

test('weak-chips: prompts with markup are rendered as plain text', async () => {
  // Create items with markup in prompts
  const items = [
    { id: 'm1', unit: 'markup', type: 'gap', prompt: 'Question with {ruby|reading} markup', answers: ['a'], explanation: 'e' },
    { id: 'm2', unit: 'markup', type: 'gap', prompt: 'Another {test|value} here', answers: ['a'], explanation: 'e' }
  ];
  const course = { units: [{ id: 'markup', title: 'Markup' }], markup: 'ruby' };
  
  const m = await mount({ 
    items, 
    course, 
    lang: 'en',
    setup: function(sb) {
      // Activate ruby markup so DojoExt.plain() strips the syntax
      if (sb.DojoExt && sb.DojoExt.use) {
        sb.DojoExt.use('ruby');
      }
    }
  });
  
  // Set both as weak
  m.doc.items.m1 = weakRec;
  m.doc.items.m2 = weakRec;
  
  m.app.refresh();
  const tree = m.tree();
  
  // Check that weak-chips element exists
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips element should exist');
  
  const fullText = text(weakChips);
  
  // The markup should be stripped - {ruby|reading} becomes "ruby" via rubyPlain
  // So "Question with {ruby|reading} markup" becomes "Question with ruby markup"
  // which is then truncated to 24 chars
  assert.ok(!fullText.includes('{ruby'), 'Should not contain raw {ruby syntax');
  assert.ok(!fullText.includes('|'), 'Should not contain | separator from markup syntax');
  
  // Check no bad strings in the whole screen
  assertNoBadStrings(tree);
});

test('weak-chips: at most 8 chips are shown', async () => {
  // Create more than 8 weak items
  const items = Array.from({ length: 10 }, (_, i) => (
    { id: 'w' + i, unit: 'weak', type: 'gap', prompt: 'Weak ' + i, answers: ['a'], explanation: 'e' }
  ));
  const course = { units: [{ id: 'weak', title: 'Weak' }] };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Set all as weak
  items.forEach(it => {
    m.doc.items[it.id] = weakRec;
  });
  
  m.app.refresh();
  const tree = m.tree();
  
  // Check that weak-chips element exists
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips element should exist');
  
  // Count the li elements inside weak-chips
  let liCount = 0;
  walk(weakChips, (n) => { if (n.type === 'li') liCount++; });
  assert.strictEqual(liCount, 8, 'Should have at most 8 li elements even with 10 weak items');
  
  // Check no bad strings in the whole screen
  assertNoBadStrings(tree);
});

test('weak-chips: prompts are truncated to 24 characters', async () => {
  const items = [
    { id: 'long1', unit: 'test', type: 'gap', 
      prompt: 'This is a very long question prompt that exceeds twenty four characters', 
      answers: ['a'], explanation: 'e' }
  ];
  const course = { units: [{ id: 'test', title: 'Test' }] };
  
  const m = await mount({ items, course, lang: 'en' });
  
  // Set as weak
  m.doc.items.long1 = weakRec;
  
  m.app.refresh();
  const tree = m.tree();
  
  // Check that weak-chips element exists
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips element should exist');
  
  const fullText = text(weakChips);
  
  // The prompt should be truncated to 24 characters with ellipsis
  // "This is a very long ques" is 24 chars, so it should be "This is a very long ques..." or similar
  const chipText = fullText;
  assert.ok(chipText.length <= 27, 'Truncated text should be at most 27 chars (24 + "...")');
  assert.ok(!chipText.includes('exceeds'), 'Should not contain the full text beyond 24 chars');
  
  // Check no bad strings in the whole screen
  assertNoBadStrings(tree);
});
