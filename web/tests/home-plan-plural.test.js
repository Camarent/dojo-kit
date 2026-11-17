'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeT } = require('../ui/i18n.js');
const ru = require('../i18n/ru.json');
const en = require('../i18n/en.json');

const i18n = { ru, en };

test('home.plan.total picks the Russian plural form for each count', () => {
  const t = makeT(i18n, 'ru');
  assert.strictEqual(t('home.plan.total', { n: 1 }), 'В следующей сессии: 1 задание');
  assert.strictEqual(t('home.plan.total', { n: 2 }), 'В следующей сессии: 2 задания');
  assert.strictEqual(t('home.plan.total', { n: 5 }), 'В следующей сессии: 5 заданий');
  assert.strictEqual(t('home.plan.total', { n: 11 }), 'В следующей сессии: 11 заданий');
  assert.strictEqual(t('home.plan.total', { n: 21 }), 'В следующей сессии: 21 задание');
  assert.strictEqual(t('home.plan.total', { n: 22 }), 'В следующей сессии: 22 задания');
});

test('home.plan.total picks the English plural form for 1 and 2', () => {
  const t = makeT(i18n, 'en');
  assert.strictEqual(t('home.plan.total', { n: 1 }), 'In the next session: 1 question');
  assert.strictEqual(t('home.plan.total', { n: 2 }), 'In the next session: 2 questions');
});
