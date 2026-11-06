'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Ext = require('./harness.js').jaExt;

test.beforeEach(() => { Ext.reset(); Ext.use('ruby'); });

test('dict word with kana: ruby only on kanji runs', () => {
  Ext.useRuby({}, [{ id: 'a', tags: [], meta: { examples: [{ w: '女の人', r: 'おんなのひと' }] } }]);
  assert.strictEqual(Ext.textAll('女の人'), '<ruby>女<rt>おんな</rt></ruby>の<ruby>人<rt>ひと</rt></ruby>');
});

test('astral kanji (surrogate pair) keeps its own ruby in okurigana split', () => {
  Ext.useRuby({}, [{ id: 'a', tags: [], meta: { examples: [{ w: '\u{20BB7}み物', r: 'きつみもの' }] } }]);
  assert.strictEqual(Ext.textAll('\u{20BB7}み物'), '<ruby>\u{20BB7}<rt>きつ</rt></ruby>み<ruby>物<rt>もの</rt></ruby>');
});
