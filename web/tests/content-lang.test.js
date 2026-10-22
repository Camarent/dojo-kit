'use strict';
// Mutation coverage: drop the setAttribute('lang') line in start() -> 'root lang' fails; drop the CJK names from --font -> 'font stack' fails.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./app-harness.js');

test('root lang follows course.contentLanguage, else uiLanguage', () => {
  [[{ contentLanguage: 'ja', uiLanguage: 'ru' }, 'ja'], [{ uiLanguage: 'ru' }, 'ru']].forEach(([course, want]) => {
    const sb = H.loadApp();
    sb.preact.render = () => {};
    const attrs = {};
    const rootEl = { setAttribute: (k, v) => { attrs[k] = v; } };
    try { sb.DojoApp.start({ root: rootEl, content: { course: Object.assign({ id: 'c', units: [] }, course), items: [] }, dojo: {}, localStorage: null, win: {} }); } catch (e) { /* storage is not loaded in this sandbox; lang is set before it */ }
    assert.strictEqual(attrs.lang, want);
  });
});

test('font stack lists CJK fallbacks', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'tokens.css'), 'utf8');
  const line = css.split('\n').find((l) => l.includes('--font:'));
  ['Hiragino Sans', 'Yu Gothic', 'Noto Sans CJK JP', 'Noto Sans JP'].forEach((f) => assert.ok(line.includes(f), f));
});
