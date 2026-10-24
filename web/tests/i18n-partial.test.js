'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

function loadApp() {
  const sandbox = { console };
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/group-card.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sandbox;
}

test('partial dictionary falls back to en for missing keys', () => {
  const sb = loadApp();
  const i18n = { fr: { a: 'Salut' }, en: { a: 'Hello', b: 'World' } };
  const t = sb.DojoApp._makeT(i18n, 'fr');
  assert.strictEqual(t('a'), 'Salut');
  assert.strictEqual(t('b'), 'World');
  assert.strictEqual(t('unknown'), 'unknown');
});

test('placeholders survive fallback path', () => {
  const sb = loadApp();
  const i18n = { en: { x: 'Hello {lang}' }, fr: {} };
  const t = sb.DojoApp._makeT(i18n, 'fr');
  assert.strictEqual(t('x', { lang: 'ja' }), 'Hello ja');
});

test('placeholder is kept when its variable is not supplied', () => {
  const sb = loadApp();
  const i18n = { en: { x: 'Hello {lang}' }, fr: {} };
  const t = sb.DojoApp._makeT(i18n, 'fr');
  assert.strictEqual(t('x'), 'Hello {lang}');
});

test('placeholders in translated string are substituted', () => {
  const sb = loadApp();
  const i18n = { fr: { n: '{n} mots' }, en: {} };
  const t = sb.DojoApp._makeT(i18n, 'fr');
  assert.strictEqual(t('n', { n: 3 }), '3 mots');
});

test('plural ru uses one/few/many categories', () => {
  const sb = loadApp();
  const f = (n) => sb.DojoApp._pluralForm('ru', n);
  assert.strictEqual(f(1), 'one');
  assert.strictEqual(f(2), 'few');
  assert.strictEqual(f(5), 'many');
  assert.strictEqual(f(11), 'many');
  assert.strictEqual(f(21), 'one');
  assert.strictEqual(f(22), 'few');
  assert.strictEqual(f(25), 'many');
  [12, 13, 14, 111].forEach((n) => assert.strictEqual(f(n), 'many', 'n=' + n));
  assert.strictEqual(f(112), 'many');
  assert.strictEqual(f(102), 'few');
});

test('plural non-ru uses one/other categories', () => {
  const sb = loadApp();
  const f = (lang, n) => sb.DojoApp._pluralForm(lang, n);
  ['fr', 'xx', 'de'].forEach((lang) => {
    assert.strictEqual(f(lang, 1), 'one', lang + ' n=1');
    assert.strictEqual(f(lang, 0), 'other', lang + ' n=0');
    assert.strictEqual(f(lang, 2), 'other', lang + ' n=2');
  });
});

test('plural family missing in partial falls back to en forms', () => {
  const sb = loadApp();
  const i18n = { fr: {}, en: { 'count.one': '1 item', 'count.other': '{n} items' } };
  const t = sb.DojoApp._makeT(i18n, 'fr');
  assert.strictEqual(t('count', { n: 1 }), '1 item');
  assert.strictEqual(t('count', { n: 3 }), '3 items');
});

test('partial language with only .other plural form works for n=1', () => {
  const sb = loadApp();
  const i18n = { xx: { 'items.other': '{n} items' }, en: { 'items.one': '1 item', 'items.other': '{n} items' } };
  const t = sb.DojoApp._makeT(i18n, 'xx');
  assert.strictEqual(t('items', { n: 1 }), '1 items');
});

test('pickLang returns de when de is present', () => {
  const sb = loadApp();
  const i18n = { en: {}, de: {} };
  assert.strictEqual(sb.DojoApp._pickLang(i18n, 'de'), 'de');
});

test('pickLang returns primary tag de for de-AT', () => {
  const sb = loadApp();
  const i18n = { en: {}, fr: {}, de: {} };
  assert.strictEqual(sb.DojoApp._pickLang(i18n, 'de-AT'), 'de');
});

test('pickLang prefers the exact regional tag when present', () => {
  const sb = loadApp();
  const i18n = { en: {}, fr: {}, 'de-AT': {}, de: {} };
  assert.strictEqual(sb.DojoApp._pickLang(i18n, 'de-AT'), 'de-AT');
});

test('pickLang returns first non-en language when lang not present', () => {
  const sb = loadApp();
  const i18n = { en: {}, fr: {}, de: {} };
  assert.strictEqual(sb.DojoApp._pickLang(i18n, 'xx'), 'fr');
});

test('pickLang returns en when only en is present', () => {
  const sb = loadApp();
  const i18n = { en: {} };
  assert.strictEqual(sb.DojoApp._pickLang(i18n, 'xx'), 'en');
});
