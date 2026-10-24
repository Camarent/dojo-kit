'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { mtVisible } = require('../ui/feedback-mt.js');

test('digits equal to answer hidden', () => {
  assert.strictEqual(mtVisible('05 61 94 56 83', '05 61 94 56 83'), false);
  assert.strictEqual(mtVisible('1346', '1346'), false);
  assert.strictEqual(mtVisible('75 000', '75000'), false);
});
test('empty hidden, text shown', () => {
  assert.strictEqual(mtVisible('', 'x'), false);
  assert.strictEqual(mtVisible('Здравствуйте', '1346'), true);
});
test('translation equal to a letter answer hidden', () => {
  assert.strictEqual(mtVisible('Paris, ', 'paris'.replace('p', 'P')), false);
});
