'use strict';
// Mutation coverage: ignoring `opts.all` turns the textAll test red.
const test = require('node:test');
const assert = require('node:assert');
const Ext = require('../ext.js');

const items = [
  { id: 'a', tags: ['core'], meta: { kanji: '甲' } },
  { id: 'b', tags: ['core'], meta: { kanji: '乙' } },
  { id: 'c', tags: ['other'], meta: { kanji: '丙' } }
];

test.beforeEach(() => { Ext.reset(); Ext.use('ruby'); });

test('textAll with skip set: keeps the reading for all kanji', () => {
  Ext.useRuby({ skipTag: 'core' }, items);
  const out = JSON.stringify(Ext.textAll('{甲|こう}'));
  assert.ok(out.includes('こう'));
  assert.ok(out.includes('rt'));
});

test('textAll without markup: returns plain string', () => {
  Ext.use('');
  const result = Ext.textAll('{甲|こう}');
  assert.strictEqual(result, '{甲|こう}');
});

test('text with skip set: hides reading; textAll keeps reading', () => {
  Ext.useRuby({ skipTag: 'core' }, items);
  const textOut = JSON.stringify(Ext.text('{甲|こう}'));
  const textAllOut = JSON.stringify(Ext.textAll('{甲|こう}'));
  assert.ok(!textOut.includes('こう'));
  assert.ok(textAllOut.includes('こう'));
});

test('plugin markup without 3rd argument still works', () => {
  Ext.reset();
  Ext.registerMarkup('simple', {
    render: function (str, h) {
      return h ? h('span', null, str) : str;
    },
    plain: function (str) { return str; }
  });
  Ext.use('simple');
  const result = Ext.textAll('test');
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.ok(!JSON.stringify(result).includes('undefined'));
  assert.ok(!JSON.stringify(result).includes('{'));
  assert.ok(!JSON.stringify(result).includes('[object'));
});

test('textAll output contains no undefined, {, or [object', () => {
  Ext.useRuby({ skipTag: 'core' }, items);
  const out = JSON.stringify(Ext.textAll('{甲|こう}{丙|へい}'));
  assert.ok(!out.includes('undefined'));
  assert.ok(!out.includes('{'));
  assert.ok(!out.includes('[object'));
});
