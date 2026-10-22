'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const tr = (k) => k;

async function renderResults(items, byId, review, summary) {
  const m = await H.mount({ items, course: { id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u1', title: 'U1' }] } });
  return m.sb.DojoApp._Results({ t: tr, byId, go() {}, onAgain() {}, summary });
}

function fullText(tree) {
  return H.text(tree);
}

function noUndefined(tree) {
  const txt = fullText(tree);
  assert.ok(!txt.includes('undefined'), 'no undefined: ' + txt);
  assert.ok(!txt.includes('{'), 'no raw { : ' + txt);
  assert.ok(!txt.includes('['), 'no raw [ : ' + txt);
}

// Test 1: Practice session of 3 items, 2 correct and 1 wrong
// Expected: score "2 / 3", percent 67%, missed list with 1 entry showing wrong answer,
// btn-home and btn-again-session present, no exam-verdict, no exam-total-points
test('Results: practice session 2/3 correct shows score, percent, missed with given answer', async () => {
  const items = [
    { id: 'i1', unit: 'u1', type: 'choice', prompt: 'Q1', options: ['A', 'B'], answer: 0 },
    { id: 'i2', unit: 'u1', type: 'choice', prompt: 'Q2', options: ['X', 'Y'], answer: 1 },
    { id: 'i3', unit: 'u1', type: 'gap', prompt: 'Q3', answers: ['answer3'] }
  ];
  const byId = { i1: items[0], i2: items[1], i3: items[2] };
  const review = [
    { id: 'i1', correct: true, given: 0, expected: 'A' },
    { id: 'i2', correct: true, given: 1, expected: 'Y' },
    { id: 'i3', correct: false, given: 'wrong answer', expected: 'answer3' }
  ];
  const summary = { correct: 2, answered: 3, pct: 67, durationMs: 120000, mode: 'practice', review, skipped: [] };
  
  const v = await renderResults(items, byId, review, summary);
  
  // Check score
  const score = H.find(v, 'score');
  assert.ok(score, 'score element exists');
  assert.ok(fullText(score).includes('2 / 3'), 'score shows 2 / 3');
  
  // Check percent
  const percent = H.find(v, 'percent');
  assert.ok(percent, 'percent element exists');
  assert.ok(fullText(percent).includes('67%'), 'percent shows 67%');
  
  // Check time
  const time = H.find(v, 'time');
  assert.ok(time, 'time element exists');
  
  // Check missed list
  const missed = H.find(v, 'missed');
  assert.ok(missed, 'missed list exists');
  
  // Check missed-i3 exists
  const missedI3 = H.find(v, 'missed-i3');
  assert.ok(missedI3, 'missed-i3 exists');
  
  // Check that the missed entry shows the given wrong answer
  const missedText = fullText(missedI3);
  assert.ok(missedText.includes('wrong answer'), 'missed entry shows given answer');
  assert.ok(missedText.includes('answer3'), 'missed entry shows expected answer');
  
  // Check btn-home and btn-again-session
  assert.ok(H.find(v, 'btn-home'), 'btn-home exists');
  assert.ok(H.find(v, 'btn-again-session'), 'btn-again-session exists');
  
  // Check no exam-verdict or exam-total-points
  assert.strictEqual(H.find(v, 'exam-verdict'), null, 'no exam-verdict');
  assert.strictEqual(H.find(v, 'exam-total-points'), null, 'no exam-total-points');
  
  // Check no undefined
  noUndefined(v);
});

// Test 2: All correct - no-missed is shown
test('Results: all correct shows no-missed', async () => {
  const items = [
    { id: 'i1', unit: 'u1', type: 'choice', prompt: 'Q1', options: ['A', 'B'], answer: 0 },
    { id: 'i2', unit: 'u1', type: 'choice', prompt: 'Q2', options: ['X', 'Y'], answer: 1 }
  ];
  const byId = { i1: items[0], i2: items[1] };
  const review = [
    { id: 'i1', correct: true, given: 0, expected: 'A' },
    { id: 'i2', correct: true, given: 1, expected: 'Y' }
  ];
  const summary = { correct: 2, answered: 2, pct: 100, durationMs: 60000, mode: 'practice', review, skipped: [] };
  
  const v = await renderResults(items, byId, review, summary);
  
  // Check no-missed
  const noMissed = H.find(v, 'no-missed');
  assert.ok(noMissed, 'no-missed element exists');
  
  // Check no missed list
  assert.strictEqual(H.find(v, 'missed'), null, 'no missed list');
  
  // Check no undefined
  noUndefined(v);
});

// Test 3: Clicking btn-home navigates home; btn-again-session starts new session
test('Results: btn-home and btn-again-session have correct onClick handlers', async () => {
  const items = [
    { id: 'i1', unit: 'u1', type: 'choice', prompt: 'Q1', options: ['A', 'B'], answer: 0 }
  ];
  const byId = { i1: items[0] };
  const review = [{ id: 'i1', correct: false, given: 1, expected: 'A' }];
  const summary = { correct: 0, answered: 1, pct: 0, durationMs: 30000, mode: 'practice', review, skipped: [] };
  
  let homeCalled = false;
  let againCalled = false;
  
  const App = (await H.mount({ items, course: { id: 'c', title: 'C', uiLanguage: 'en', units: [{ id: 'u1', title: 'U1' }] } })).sb.DojoApp;
  const v = App._Results({
    t: tr,
    byId,
    go: (page) => { if (page === 'home') homeCalled = true; },
    onAgain: () => { againCalled = true; },
    summary
  });
  
  // Find and click btn-home
  const btnHome = H.find(v, 'btn-home');
  assert.ok(btnHome, 'btn-home exists');
  assert.ok(typeof btnHome.props.onClick === 'function', 'btn-home has onClick');
  btnHome.props.onClick();
  assert.ok(homeCalled, 'go("home") was called');
  
  // Find and click btn-again-session
  const btnAgain = H.find(v, 'btn-again-session');
  assert.ok(btnAgain, 'btn-again-session exists');
  assert.ok(typeof btnAgain.props.onClick === 'function', 'btn-again-session has onClick');
  btnAgain.props.onClick();
  assert.ok(againCalled, 'onAgain was called');
  
  // Check no undefined
  noUndefined(v);
});

// Test 4: A typed item whose given answer is empty/skipped does not render "undefined"
test('Results: empty/skipped given answer does not render undefined', async () => {
  const items = [
    { id: 'i1', unit: 'u1', type: 'gap', prompt: 'Q1', answers: ['correct'] }
  ];
  const byId = { i1: items[0] };
  
  // Test with empty string given
  const reviewEmpty = [{ id: 'i1', correct: false, given: '', expected: 'correct' }];
  const summaryEmpty = { correct: 0, answered: 1, pct: 0, durationMs: 10000, mode: 'practice', review: reviewEmpty, skipped: [] };
  const vEmpty = await renderResults(items, byId, reviewEmpty, summaryEmpty);
  noUndefined(vEmpty);
  
  // Test with undefined given
  const reviewUndefined = [{ id: 'i1', correct: false, given: undefined, expected: 'correct' }];
  const summaryUndefined = { correct: 0, answered: 1, pct: 0, durationMs: 10000, mode: 'practice', review: reviewUndefined, skipped: [] };
  const vUndefined = await renderResults(items, byId, reviewUndefined, summaryUndefined);
  noUndefined(vUndefined);
  
  // Test with skipped items
  const reviewSkipped = [];
  const summarySkipped = { correct: 0, answered: 0, pct: 0, durationMs: 10000, mode: 'practice', review: reviewSkipped, skipped: ['i1'] };
  const vSkipped = await renderResults(items, byId, reviewSkipped, summarySkipped);
  noUndefined(vSkipped);
});
