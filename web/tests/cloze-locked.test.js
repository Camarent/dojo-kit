'use strict';
const test = require('node:test');
const assert = require('node:assert');
const util = require('../session/util.js');
const { create } = require('../session/run-view.js');

// Plain strings are text (shown, not a field); {locked: text} objects are read-only fields; arrays are blanks with accepted answers.
const ITEM = { id: 'cl1', type: 'cloze', parts: ['Start ', ['x'], ' middle ', ['y', 'z'], ' end'] };
const LOCKED_ITEM = { id: 'cl3', type: 'cloze', parts: ['Start ', ['x'], ' ', { locked: 'rare' }, ' end'] };
const view = (item) => create({}, { session: { id: 's1' } }).viewFor(item);

test('answer text shows the text and locked text with each blank replaced by its first answer', () => {
  assert.strictEqual(util.expectedFor(ITEM), 'Start x middle y end');
  assert.strictEqual(util.expectedFor(LOCKED_ITEM), 'Start x rare end');
});

test('clozeBlanks returns only the blank parts, not the text or locked parts', () => {
  assert.deepStrictEqual(util.clozeBlanks(ITEM), [['x'], ['y', 'z']]);
  assert.deepStrictEqual(util.clozeBlanks(LOCKED_ITEM), [['x']]);
});

test('run view yields text and locked segments and numbers blanks from 0', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(view(ITEM))), {
    segments: [{ text: 'Start ' }, { blank: 0 }, { text: ' middle ' }, { blank: 1 }, { text: ' end' }],
    blanks: 2
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(view(LOCKED_ITEM))), {
    segments: [{ text: 'Start ' }, { blank: 0 }, { text: ' ' }, { locked: 'rare' }, { text: ' end' }],
    blanks: 1
  });
});

test('blank indices stay 0..n-1 when the cloze starts and ends with locked text', () => {
  const item = { id: 'cl2', type: 'cloze', parts: ['A', ['a'], 'B', ['b'], 'C'] };
  const v = view(item);
  assert.deepStrictEqual(v.segments.filter((s) => s.blank !== undefined).map((s) => s.blank), [0, 1]);
  assert.strictEqual(v.blanks, 2);
});
