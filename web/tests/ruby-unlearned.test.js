'use strict';
// Mutation coverage: restricting annotation to opts.all or ignoring opts.annotate turns the first two tests red.
const test = require('node:test');
const assert = require('node:assert');
const Ext = require('../ext.js');

const items = [
  { id: 'k1', tags: ['n5'], meta: { kanji: '日本語' } },
  { id: 'vocab-1457', tags: ['vocab', 'n5'], prompt: '練習する', explanation: 'Слово «{練習|れんしゅう}する» означает «упражняться».' },
  { id: 'vocab-1', tags: ['vocab', 'n5'], prompt: '日本語', explanation: '{日本語|にほんご}' }
];

const A = { annotate: true };

test.beforeEach(() => { Ext.reset(); Ext.use('ruby'); Ext.useRuby({ skipTag: 'n5' }, items); });

test('plain prompt with a known word of unlearned kanji renders ruby in text()', () => {
  assert.strictEqual(Ext.text('練習する', A), '<ruby>練習<rt>れんしゅう</rt></ruby>する');
});

test('annotation keeps surrounding text escaped', () => {
  assert.strictEqual(Ext.text('<練習>', A), '&lt;<ruby>練習<rt>れんしゅう</rt></ruby>&gt;');
});

test('word whose kanji are all in the skip set stays bare', () => {
  assert.strictEqual(Ext.text('日本語', A), '日本語');
});

test('text without annotate leaves plain words bare (answer options)', () => {
  assert.strictEqual(Ext.text('練習する'), '練習する');
});

test('without ruby config text stays plain', () => {
  Ext.reset(); Ext.use('ruby');
  assert.strictEqual(Ext.text('練習する'), '練習する');
});
