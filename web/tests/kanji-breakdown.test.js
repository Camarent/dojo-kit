'use strict';
// Mutation coverage: removing the `seen[c]` dedupe check turns 'duplicate kanji deduped' red.
const test = require('node:test');
const assert = require('node:assert');
const Ext = require('../ext.js');

test.beforeEach(() => { Ext.reset(); Ext.use('ruby'); });

const kanjiItems = [
  { id: 'k1', type: 'card', prompt: '日', back: 'Sun', meta: { kanji: '日', en: 'sun', meaning: 'day', on: ['ニチ', 'ジツ'], kun: ['ひ', 'び'] } },
  { id: 'k2', type: 'card', prompt: '本', back: 'Book', meta: { kanji: '本', en: 'book', meaning: 'origin', on: ['ホン'], kun: ['もと'] } },
  { id: 'k3', type: 'card', prompt: '校', back: 'School', meta: { kanji: '校', en: 'school', meaning: 'examine', on: ['コウ'], kun: ['かの'] } },
  { id: 'k4', type: 'card', prompt: '学', back: 'Study', meta: { kanji: '学', en: 'study', meaning: 'learn', on: ['ガク'], kun: ['まな'] } }
];

const lang = 'en';

test('two-kanji word returns 2 rows in order with meanings', () => {
  const item = {
    type: 'gap',
    prompt: '本校',
    answers: ['ほんこう'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].kanji, '本');
  assert.strictEqual(result[0].meaning, 'book');
  assert.strictEqual(result[1].kanji, '校');
  assert.strictEqual(result[1].meaning, 'school');
});

test('duplicate kanji deduped', () => {
  const item = {
    type: 'gap',
    prompt: '日日',
    answers: ['ひび'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kanji, '日');
  assert.strictEqual(result[0].meaning, 'sun');
});

test('missing kanji item skipped', () => {
  const item = {
    type: 'gap',
    prompt: '日月',
    answers: ['にちげつ'],
    meta: {}
  };
  // Only '日' has a kanji item; '月' does not
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kanji, '日');
});

test('ruby markup in prompt is parsed via plain', () => {
  const item = {
    type: 'gap',
    prompt: '{学校|がっこう}',
    answers: ['がっこう'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  // plain('{学校|がっこう}') gives '学校', which has 学 and 校 in that order
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].kanji, '学');
  assert.strictEqual(result[1].kanji, '校');
});

test('own-kanji item returns empty array', () => {
  const item = kanjiItems[0]; // 日 kanji item
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  assert.strictEqual(result.length, 0);
});

test('lang fallback to meta.meaning', () => {
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: ['にほん'],
    meta: {}
  };
  // Create a kanji item without 'en' but with 'meaning'
  const itemsWithFallback = [
    { id: 'k-fallback', type: 'card', prompt: '日', back: 'Day', meta: { kanji: '日', meaning: 'day' } },
    { id: 'k-fallback2', type: 'card', prompt: '本', back: 'Book', meta: { kanji: '本', meaning: 'book' } }
  ];
  const result = Ext.kanjiBreakdown(item, itemsWithFallback, lang);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].meaning, 'day');
  assert.strictEqual(result[1].meaning, 'book');
});

test('null input returns empty array', () => {
  const result = Ext.kanjiBreakdown(null, kanjiItems, lang);
  assert.strictEqual(result.length, 0);
});

test('null items returns empty array', () => {
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: ['にほん'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, null, lang);
  assert.strictEqual(result.length, 0);
});

test('kanji in answers are included when prompt has 2+ kanji', () => {
  const item = {
    type: 'gap',
    prompt: '学校',
    answers: ['がっこう'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  // Should find both 学 and 校 from prompt
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].kanji, '学');
  assert.strictEqual(result[1].kanji, '校');
});

test('cap at 12 rows', () => {
  // Create 15 kanji items
  const manyItems = [];
  for (let i = 0; i < 15; i++) {
    const c = String.fromCharCode(0x4e00 + i); // Generate CJK characters
    manyItems.push({
      id: 'k' + i,
      type: 'card',
      prompt: c,
      back: 'Char ' + i,
      meta: { kanji: c, en: 'char' + i, meaning: 'character ' + i }
    });
  }
  const item = {
    type: 'gap',
    prompt: manyItems.map((_, i) => String.fromCharCode(0x4e00 + i)).join(''),
    answers: [],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, manyItems, lang);
  assert.strictEqual(result.length, 12);
});

test('readings on and kun are included', () => {
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: [],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result[0].on, ['ニチ', 'ジツ']);
  assert.deepStrictEqual(result[0].kun, ['ひ', 'び']);
});

test('items without string meaning are skipped', () => {
  const itemsNoMeaning = [
    { id: 'k-no-meaning', type: 'card', prompt: '日', back: 'Sun', meta: { kanji: '日', on: ['ニチ'] } },
    { id: 'k-no-meaning2', type: 'card', prompt: '本', back: 'Book', meta: { kanji: '本', on: ['ホン'] } }
  ];
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: [],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, itemsNoMeaning, lang);
  assert.strictEqual(result.length, 0);
});

test('multi-character meta.kanji is skipped', () => {
  const itemsBad = [
    { id: 'k-bad', type: 'card', prompt: '日', back: 'Sun', meta: { kanji: '日本', en: 'japan' } }
  ];
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: [],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, itemsBad, lang);
  assert.strictEqual(result.length, 0);
});

test('prompt with one kanji shows no rows', () => {
  const item = {
    type: 'gap',
    prompt: '日',
    answers: [],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  assert.strictEqual(result.length, 0);
});

test('prompt with two kanji shows rows', () => {
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: [],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].kanji, '日');
  assert.strictEqual(result[1].kanji, '本');
});

test('kanji only in answers with no kanji in prompt shows no rows', () => {
  const item = {
    type: 'gap',
    prompt: 'hello',
    answers: ['日本'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, lang);
  assert.strictEqual(result.length, 0);
});

test('own-kanji guard: repeated own kanji in prompt returns empty array', () => {
  const item = { type: 'gap', prompt: '日日', answers: ['ひび'], meta: { kanji: '日' } };
  assert.deepStrictEqual(Ext.kanjiBreakdown(item, kanjiItems, lang), []);
});

test('own kanji plus another kanji in prompt keeps both rows', () => {
  const item = { type: 'gap', prompt: '日本', answers: ['にほん'], meta: { kanji: '日' } };
  assert.strictEqual(Ext.kanjiBreakdown(item, kanjiItems, lang).length, 2);
});

test('config given: meanings come from configured path although contentLanguage is ja', () => {
  const cfg = { key: 'meta.kanji', meaning: 'meta.ru', readings: ['meta.on', 'meta.kun'] };
  const itemsWithRu = [
    { id: 'k-ru-1', type: 'card', prompt: '日', back: 'Sun', meta: { kanji: '日', ru: 'день', on: ['ニチ', 'ジツ'], kun: ['ひ', 'び'] } },
    { id: 'k-ru-2', type: 'card', prompt: '本', back: 'Book', meta: { kanji: '本', ru: 'книга', on: ['ホン'], kun: ['もと'] } }
  ];
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: ['にほん'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, itemsWithRu, cfg);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].meaning, 'день');
  assert.strictEqual(result[1].meaning, 'книга');
});

test('config given: custom readings list from config is used', () => {
  const cfg = { key: 'meta.kanji', meaning: 'meta.en', readings: ['meta.reading'] };
  const itemsWithCustom = [
    { id: 'k-cust-1', type: 'card', prompt: '日', back: 'Sun', meta: { kanji: '日', en: 'sun', reading: ['ニコ'] } },
    { id: 'k-cust-2', type: 'card', prompt: '本', back: 'Book', meta: { kanji: '本', en: 'book', reading: ['ハン'] } }
  ];
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: ['にほん'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, itemsWithCustom, cfg);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result[0].on, ['ニコ']);
  assert.strictEqual(result[0].kun, undefined);
  assert.deepStrictEqual(result[1].on, ['ハン']);
});

test('no config: output identical to before (fallback with lang string)', () => {
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: ['にほん'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, kanjiItems, 'en');
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].meaning, 'sun');
  assert.strictEqual(result[1].meaning, 'book');
});

test('config with custom key path', () => {
  const cfg = { key: 'meta.character', meaning: 'meta.translation', readings: ['meta.reading'] };
  const itemsCustomKey = [
    { id: 'k-key-1', type: 'card', prompt: '日', back: 'Sun', meta: { character: '日', translation: 'day', reading: ['ニコ'] } },
    { id: 'k-key-2', type: 'card', prompt: '本', back: 'Book', meta: { character: '本', translation: 'book', reading: ['ハン'] } }
  ];
  const item = {
    type: 'gap',
    prompt: '日本',
    answers: ['にほん'],
    meta: {}
  };
  const result = Ext.kanjiBreakdown(item, itemsCustomKey, cfg);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].kanji, '日');
  assert.strictEqual(result[0].meaning, 'day');
  assert.strictEqual(result[1].kanji, '本');
  assert.strictEqual(result[1].meaning, 'book');
});

test('config own-kanji guard uses custom key path', () => {
  const cfg = { key: 'meta.character', meaning: 'meta.translation', readings: ['meta.reading'] };
  const itemsCustomKey = [
    { id: 'k-key-1', type: 'card', prompt: '日', back: 'Sun', meta: { character: '日', translation: 'day', reading: ['ニコ'] } }
  ];
  const item = {
    type: 'gap',
    prompt: '日',
    answers: ['にち'],
    meta: { character: '日' }
  };
  const result = Ext.kanjiBreakdown(item, itemsCustomKey, cfg);
  assert.strictEqual(result.length, 0, 'Should return empty when item has own kanji in custom key path');
});
