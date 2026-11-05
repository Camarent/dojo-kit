'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Ext = require('../ext.js');

test.beforeEach(() => { Ext.reset(); Ext.use('ruby'); });

test('dict word with kana: ruby only on kanji runs', () => {
  Ext.useRuby({}, [{ id: 'a', tags: [], meta: { examples: [{ w: '女の人', r: 'おんなのひと' }] } }]);
  assert.strictEqual(Ext.textAll('女の人'), '<ruby>女<rt>おんな</rt></ruby>の<ruby>人<rt>ひと</rt></ruby>');
});
