'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeT } = require('../ui/i18n.js');
const ru = require('../i18n/ru.json');
const en = require('../i18n/en.json');

const i18n = { ru, en };

// Expected Russian text comes from the plural key table, so this file stays free of Cyrillic.
const ruForm = (form, n) => ru[`home.plan.total.${form}`].replace('{n}', String(n));

test('home.plan.total picks the Russian plural form for each count', () => {
  const t = makeT(i18n, 'ru');
  assert.strictEqual(t('home.plan.total', { n: 1 }), ruForm('one', 1));
  assert.strictEqual(t('home.plan.total', { n: 2 }), ruForm('few', 2));
  assert.strictEqual(t('home.plan.total', { n: 5 }), ruForm('many', 5));
  assert.strictEqual(t('home.plan.total', { n: 11 }), ruForm('many', 11));
  assert.strictEqual(t('home.plan.total', { n: 21 }), ruForm('one', 21));
  assert.strictEqual(t('home.plan.total', { n: 22 }), ruForm('few', 22));
});

test('home.plan.total picks the English plural form for 1 and 2', () => {
  const t = makeT(i18n, 'en');
  assert.strictEqual(t('home.plan.total', { n: 1 }), 'In the next session: 1 question');
  assert.strictEqual(t('home.plan.total', { n: 2 }), 'In the next session: 2 questions');
});
