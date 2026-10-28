'use strict';
const test = require('node:test');
const assert = require('node:assert');
const i18n = require('../ui/i18n.js');
const { warn } = require('../storage/warn.js');

test('pluralForm ru: one/few/many and en other', () => {
  assert.strictEqual(i18n.pluralForm('ru', 21), 'one');
  assert.strictEqual(i18n.pluralForm('ru', 11), 'many');
  assert.strictEqual(i18n.pluralForm('ru', 3), 'few');
  assert.strictEqual(i18n.pluralForm('ru', 13), 'many');
  assert.strictEqual(i18n.pluralForm('ru', 5), 'many');
  assert.strictEqual(i18n.pluralForm('en', 2), 'other');
  assert.strictEqual(i18n.pluralForm('en', 1), 'one');
});

test('makeT: plural lookup, fallback chain, vars, missing key', () => {
  const d = { ru: { 'k.few': 'few {n}', k: 'base' }, en: { 'k.other': 'oth', only: 'en only' } };
  const t = i18n.makeT(d, 'ru-RU');
  assert.strictEqual(t('k', { n: 3 }), 'few 3');
  assert.strictEqual(t('k', { n: 7 }), 'base');
  assert.strictEqual(t('only'), 'en only');
  assert.strictEqual(t('missing'), 'missing');
  assert.strictEqual(t('only {x}'.length ? 'missing {x}' : '', { y: 1 }), 'missing {x}');
  assert.strictEqual(i18n.makeT(null, 'en')('z'), 'z');
  assert.strictEqual(i18n.makeT({ en: { 'k.other': 'o' } }, 'en')('k', { n: 5 }), 'o');
});

test('pickLang: exact, primary tag, other non-en, en default', () => {
  assert.strictEqual(i18n.pickLang({ ru: {} }, 'ru'), 'ru');
  assert.strictEqual(i18n.pickLang({ ru: {} }, 'ru-RU'), 'ru');
  assert.strictEqual(i18n.pickLang({ de: {}, en: {} }, 'fr'), 'de');
  assert.strictEqual(i18n.pickLang({ en: {} }, 'fr'), 'en');
  assert.strictEqual(i18n.pickLang(null, 'fr'), 'en');
});

test('storage warn: hook, debug console, throwing hook, no options', () => {
  const calls = [];
  warn({ onWarn: (w, e) => calls.push([w, e]) }, 'a', 1);
  assert.deepStrictEqual(calls, [['a', 1]]);
  warn({ onWarn() { throw new Error('x'); } }, 'a', 1);
  warn(null, 'a', 1);
  warn({}, 'a', 1);
  const orig = console.warn;
  let got;
  console.warn = (...a) => { got = a; };
  try { warn({ debug: true }, 'w', 2); } finally { console.warn = orig; }
  assert.deepStrictEqual(got, ['w', 2]);
});
