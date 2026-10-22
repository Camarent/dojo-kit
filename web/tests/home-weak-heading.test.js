'use strict';
// Mutation coverage: remove the weak-title heading from HomeScreen -> 'heading present with i18n text' fails;
// remove list-style: none from weak-chips CSS -> 'CSS contains list-style: none' fails.
const test = require('node:test');
const assert = require('node:assert');
const { read, find, findAll, text, walk, mount, NOW } = require('./app-harness.js');

const DAY = 86400000;

function gap(id, unit) {
  return { id, unit, type: 'gap', prompt: 'Q ' + id, answers: ['a'], explanation: 'e' };
}

const weakRec = { s: 0, bad: 1, due: NOW - DAY };
const normalRec = { s: 1, due: NOW + 9 * DAY };

async function homeWithWeak(lang, weakItems) {
  const items = [gap('k1', 'kanji'), gap('v1', 'vocab'), gap('k2', 'kanji')];
  const course = { units: [{ id: 'kanji', title: 'Kanji' }, { id: 'vocab', title: 'Vocab' }] };
  const m = await mount({ items, course, lang });
  weakItems.forEach(id => { m.doc.items[id] = weakRec; });
  items.forEach(it => { if (!weakItems.includes(it.id)) m.doc.items[it.id] = normalRec; });
  m.app.refresh();
  return m;
}

async function homeWithNoWeak(lang) {
  const items = [gap('k1', 'kanji'), gap('v1', 'vocab')];
  const course = { units: [{ id: 'kanji', title: 'Kanji' }, { id: 'vocab', title: 'Vocab' }] };
  const m = await mount({ items, course, lang });
  items.forEach(it => { m.doc.items[it.id] = normalRec; });
  m.app.refresh();
  return m;
}

// Check that the whole screen text contains none of: "undefined", "{", "[object"
function assertNoBadStrings(tree) {
  const fullText = text(tree);
  assert.ok(!fullText.includes('undefined'), 'Screen contains "undefined": ' + fullText);
  assert.ok(!fullText.includes('{'), 'Screen contains "{": ' + fullText);
  assert.ok(!fullText.includes('[object'), 'Screen contains "[object": ' + fullText);
}

test('weak-chips: heading present with i18n text when weak list is non-empty', async () => {
  const m = await homeWithWeak('en', ['k1', 'v1']);
  const tree = m.tree();
  
  const weakTitle = find(tree, 'weak-title');
  assert.ok(weakTitle, 'weak-title heading should exist');
  assert.strictEqual(weakTitle.type, 'h3', 'weak-title should be an h3 element');
  
  const headingText = text(weakTitle);
  assert.strictEqual(headingText, 'Weak spots', 'en: heading should show "Weak spots"');
  
  const ru = await homeWithWeak('ru', ['k1', 'v1']);
  const ruTree = ru.tree();
  const ruWeakTitle = find(ruTree, 'weak-title');
  assert.ok(ruWeakTitle, 'weak-title heading should exist in ru');
  assert.strictEqual(text(ruWeakTitle), 'Слабые места', 'ru: heading should show "Слабые места"');
  
  assertNoBadStrings(tree);
  assertNoBadStrings(ruTree);
});

test('weak-chips: heading absent when weak list is empty', async () => {
  const m = await homeWithNoWeak('en');
  const tree = m.tree();
  
  const weakTitle = find(tree, 'weak-title');
  assert.strictEqual(weakTitle, null, 'weak-title heading should not exist when no weak items');
  
  const weakChips = find(tree, 'weak-chips');
  assert.strictEqual(weakChips, null, 'weak-chips should not exist when no weak items');
  
  assertNoBadStrings(tree);
});

test('weak-chips: chip texts are rendered', async () => {
  const m = await homeWithWeak('en', ['k1', 'v1', 'k2']);
  const tree = m.tree();
  
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips element should exist');
  
  const fullText = text(weakChips);
  assert.ok(fullText.includes('Q k1'), 'Should contain prompt for k1');
  assert.ok(fullText.includes('Q v1'), 'Should contain prompt for v1');
  assert.ok(fullText.includes('Q k2'), 'Should contain prompt for k2');
  
  assertNoBadStrings(tree);
});

test('weak-chips: CSS contains list-style: none for weak-chips', async () => {
  const css = read('styles/app.css');
  assert.ok(css.includes('.weak-chips'), 'CSS should contain .weak-chips rule');
  assert.ok(css.includes('list-style: none'), 'CSS should contain list-style: none for weak-chips');
  
  // Verify it's in a weak-chips context
  const weakChipsRule = css.match(/\.weak-chips\s*\{[^}]*list-style:\s*none[^}]*\}/s);
  assert.ok(weakChipsRule, 'weak-chips rule should contain list-style: none');
});

test('weak-chips: CSS contains max-width and min-width for clean wrap', async () => {
  const css = read('styles/app.css');
  assert.ok(css.includes('.weak-chips .chip'), 'CSS should contain .weak-chips .chip rule');
  assert.ok(css.includes('max-width: 100%'), 'CSS should contain max-width: 100% for weak chips');
  assert.ok(css.includes('min-width: 0'), 'CSS should contain min-width: 0 for weak chips');
});

test('weak-chips: aria-labelledby points to heading id', async () => {
  const m = await homeWithWeak('en', ['k1', 'v1']);
  const tree = m.tree();
  
  const weakChips = find(tree, 'weak-chips');
  assert.ok(weakChips, 'weak-chips element should exist');
  assert.strictEqual(weakChips.props['aria-labelledby'], 'weak-title', 'aria-labelledby should point to weak-title');
  
  assertNoBadStrings(tree);
});
