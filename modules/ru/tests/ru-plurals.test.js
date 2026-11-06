'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeT, ru } = require('./harness.js');
const t = makeT({ ru }, 'ru');

test('home.weak.count uses Russian one/few/many forms', () => {
  assert.strictEqual(t('home.weak.count', { n: 1 }), '1 элемент');
  assert.strictEqual(t('home.weak.count', { n: 2 }), '2 элемента');
  assert.strictEqual(t('home.weak.count', { n: 5 }), '5 элементов');
  assert.strictEqual(t('home.weak.count', { n: 11 }), '11 элементов');
  assert.strictEqual(t('home.weak.count', { n: 21 }), '21 элемент');
  assert.strictEqual(t('home.weak.count', { n: 22 }), '22 элемента');
});
