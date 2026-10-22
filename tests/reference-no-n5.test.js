'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const srs = require(path.join(__dirname, '..', 'tools', 'reference', 'srs.js'));

const N5_ONLY = ['kanjiChars', 'isN5Readable', 'relatedWords'];
const GENERIC = [
  'applyAnswer', 'applyPractice', 'applyRelearn', 'applyPlacement',
  'buildQueue', 'isDue', 'isNew', 'dayKey', 'streak', 'weakest', 'countsTowardDailyNew',
];

test('reference srs api has no N5-only functions', () => {
  const keys = Object.keys(srs);
  for (const name of N5_ONLY) assert.ok(!keys.includes(name), `${name} must not be exported`);
});

test('reference srs api keeps the generic functions', () => {
  for (const name of GENERIC) {
    assert.strictEqual(typeof srs[name], 'function', `${name} must stay exported`);
  }
});
