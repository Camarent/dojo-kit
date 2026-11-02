'use strict';
// Mutation coverage: ignore dictKeys -> custom dictKeys test fails.
const test = require('node:test');
const assert = require('node:assert');
const Ext = require('../ext.js');

const itemsWithWords = [
  { id: 'a', meta: { examples: [{ w: '日本', r: 'にほん' }], irregular: [{ w: '日本語', r: 'にほんご' }], words: [{ w: '学生', r: 'がくせい' }] } },
  { id: 'b', meta: { examples: [{ w: '新聞', r: 'しんぶん' }] } }
];

test.beforeEach(() => { Ext.reset(); Ext.use('ruby'); });

test('custom dictKeys picks from meta.words', () => {
  Ext.useRuby({ dictKeys: ['meta.words'] }, itemsWithWords);
  // Should have '学生' from meta.words (annotation)
  const out = JSON.stringify(Ext.textAll('学生'));
  assert.ok(out.includes('がくせい'));
  assert.ok(out.includes('rt'));
  // Should NOT have '日本' or '日本語' from meta.examples/meta.irregular
  const out2 = JSON.stringify(Ext.textAll('日本'));
  assert.ok(!out2.includes('にほん'));
  assert.ok(!out2.includes('rt'));
});

test('default (no dictKeys) picks from meta.examples and meta.irregular', () => {
  Ext.useRuby({}, itemsWithWords);
  // Should have '日本' from meta.examples
  const out1 = JSON.stringify(Ext.textAll('日本'));
  assert.ok(out1.includes('にほん'));
  assert.ok(out1.includes('rt'));
  // Should have '日本語' from meta.irregular
  const out2 = JSON.stringify(Ext.textAll('日本語'));
  assert.ok(out2.includes('にほんご'));
  assert.ok(out2.includes('rt'));
  // Should have '新聞' from meta.examples
  const out3 = JSON.stringify(Ext.textAll('新聞'));
  assert.ok(out3.includes('しんぶん'));
  assert.ok(out3.includes('rt'));
  // Should NOT have '学生' from meta.words (not in default)
  const out4 = JSON.stringify(Ext.textAll('学生'));
  assert.ok(!out4.includes('がくせい'));
  assert.ok(!out4.includes('rt'));
});

test('dictKeys set to different keys does NOT pick from meta.examples', () => {
  Ext.useRuby({ dictKeys: ['meta.words'] }, itemsWithWords);
  // Should NOT have '日本' from meta.examples (we only look at meta.words)
  const out = JSON.stringify(Ext.textAll('日本'));
  assert.ok(!out.includes('にほん'));
  assert.ok(!out.includes('rt'));
  // Should have '学生' from meta.words
  const out2 = JSON.stringify(Ext.textAll('学生'));
  assert.ok(out2.includes('がくせい'));
  assert.ok(out2.includes('rt'));
});
