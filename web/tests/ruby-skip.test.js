'use strict';
// Mutation coverage: invert rubyHidden's `every` to `some` -> 'mixed base keeps its reading' fails; ignore skipTag -> 'skip set from tagged items' fails;
// drop rubySkip = null in reset -> 'reset clears the skip set' fails.
const test = require('node:test');
const assert = require('node:assert');
const Ext = require('../ext.js');

const items = [
  { id: 'a', tags: ['core'], meta: { kanji: '甲' } },
  { id: 'b', tags: ['core'], meta: { kanji: '乙' } },
  { id: 'c', tags: ['other'], meta: { kanji: '丙' } }
];

test.beforeEach(() => { Ext.reset(); Ext.use('ruby'); });

test('no ruby config: every ruby keeps its reading', () => {
  assert.ok(String(JSON.stringify(Ext.text('{甲|こう}'))).includes('rt'));
});

test('skip set from tagged items: bare base for known kanji, ruby for the rest', () => {
  Ext.useRuby({ skipTag: 'core' }, items);
  const out = JSON.stringify(Ext.text('{甲|こう}{丙|へい}'));
  assert.ok(!out.includes('こう'));
  assert.ok(out.includes('へい'));
});

test('skip chars and custom key', () => {
  Ext.useRuby({ skip: '丙', skipTag: 'core', skipKey: 'id' }, items);
  assert.ok(!JSON.stringify(Ext.text('{丙|へい}')).includes('へい'));
  assert.ok(JSON.stringify(Ext.text('{甲|こう}')).includes('こう'));
});

test('mixed base keeps its reading unless every kanji is skipped', () => {
  Ext.useRuby({ skipTag: 'core' }, items);
  assert.ok(JSON.stringify(Ext.text('{甲丙|x}')).includes('<rt>x</rt>'));
  assert.ok(!JSON.stringify(Ext.text('{甲乙|x}')).includes('<rt>x</rt>'));
});

test('reset clears the skip set', () => {
  Ext.useRuby({ skipTag: 'core' }, items);
  Ext.reset(); Ext.use('ruby');
  assert.ok(JSON.stringify(Ext.text('{甲|こう}')).includes('こう'));
});
