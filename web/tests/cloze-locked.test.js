'use strict';
const test = require('node:test');
const assert = require('node:assert');
const util = require('../session/util.js');
const { create } = require('../session/run-view.js');

// Plain strings are locked text (shown, never typed); arrays are blanks with accepted answers.
const ITEM = { id: 'cl1', type: 'cloze', parts: ['Start ', ['x'], ' middle ', ['y', 'z'], ' end'] };
const view = (item) => create({}, { session: { id: 's1' } }).viewFor(item);

test('answer text shows the locked text with each blank replaced by its first answer', () => {
  assert.strictEqual(util.expectedFor(ITEM), 'Start x middle y end');
});

test('clozeBlanks returns only the blank parts, not the locked text', () => {
  assert.deepStrictEqual(util.clozeBlanks(ITEM), [['x'], ['y', 'z']]);
});

test('run view yields locked segments and numbers blanks from 0', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(view(ITEM))), {
    segments: [{ locked: 'Start ' }, { blank: 0 }, { locked: ' middle ' }, { blank: 1 }, { locked: ' end' }],
    blanks: 2
  });
});

test('blank indices stay 0..n-1 when the cloze starts and ends with locked text', () => {
  const item = { id: 'cl2', type: 'cloze', parts: ['A', ['a'], 'B', ['b'], 'C'] };
  const v = view(item);
  assert.deepStrictEqual(v.segments.filter((s) => s.blank !== undefined).map((s) => s.blank), [0, 1]);
  assert.strictEqual(v.blanks, 2);
});
