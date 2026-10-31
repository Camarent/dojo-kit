'use strict';
// Mutation coverage: drop the gap branch in leaksAnswer -> 'gap' and 'weak-6' cases fail.
const test = require('node:test');
const assert = require('node:assert');
const { leaksAnswer } = require('../session/util.js');

test('gap', () => {
  const it = { type: 'gap', answers: ['cat', ''] };
  assert.ok(leaksAnswer(it, 'A Cat sits'));
  assert.ok(!leaksAnswer(it, 'A dog sits'));
});
test('choice', () => {
  const it = { type: 'choice', options: ['red', 'blue'], answer: 1 };
  assert.ok(leaksAnswer(it, 'it is blue'));
  assert.ok(!leaksAnswer(it, 'it is red'));
});
test('multi', () => {
  const it = { type: 'multi', options: ['aa', 'bb', 'cc'], correct: [0, 2] };
  assert.ok(leaksAnswer(it, 'has cc'));
  assert.ok(!leaksAnswer(it, 'has bb'));
});
test('cloze', () => {
  const it = { type: 'cloze', parts: ['x ', ['dog'], ' y'] };
  assert.ok(leaksAnswer(it, 'a dog'));
  assert.ok(!leaksAnswer(it, 'a cat'));
});
test('numeric', () => {
  const it = { type: 'numeric', answer: 42 };
  assert.ok(leaksAnswer(it, 'it is 42'));
  assert.ok(!leaksAnswer(it, 'it is 7'));
});
test('order: steps of 2+ chars only', () => {
  const it = { type: 'order', steps: ['a', 'boil'] };
  assert.ok(leaksAnswer(it, 'first boil'));
  assert.ok(!leaksAnswer(it, 'a plain text'));
});
test('match', () => {
  const it = { type: 'match', pairs: [{ left: 'l', right: 'paris' }] };
  assert.ok(leaksAnswer(it, 'Paris is'));
  assert.ok(!leaksAnswer(it, 'rome is'));
});
test('weak-6 case hidden', () => {
  const it = { type: 'gap', prompt: 'мыть; стирать', answers: ['あらう', '洗う'] };
  assert.ok(leaksAnswer(it, 'あらう (洗う). Мыть посуду, руки; стирать одежду.'));
});
test('non-leaking explanation still shown', () => {
  const it = { type: 'gap', answers: ['あらう', '洗う'] };
  assert.ok(!leaksAnswer(it, 'Мыть посуду, руки; стирать одежду.'));
});
test('ruby reading form caught', () => {
  const it = { type: 'gap', answers: ['あらう'] };
  assert.ok(leaksAnswer(it, '{洗う|あらう} посуду'));
  assert.ok(leaksAnswer({ type: 'gap', answers: ['洗う'] }, '{洗う|あらう} посуду'));
});

test('leaksAnswer: a one-letter Latin answer does not match inside a longer word', () => {
  const U = require('../session/util.js');
  const item = { id: 'p', type: 'choice', prompt: 'q', options: ['a', 'b'], answer: 0 };
  assert.strictEqual(U.leaksAnswer(item, 'Explanation text'), false);
  assert.strictEqual(U.leaksAnswer(item, 'Answer: a.'), true);
});
