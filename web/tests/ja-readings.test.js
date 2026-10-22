'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadBundle } = require('./load-bundle.js');


// Setup preact mock
global.preact = {
  h: (tag, props, ...kids) => ({ tag, props, kids }),
  Component: class Component {
    constructor(props) {
      this.props = props;
      this.state = {};
    }
    setState(newState) {
      Object.assign(this.state, newState);
    }
  }
};

function loadExtAndPlugin() {
  const sb = { console, self: {}, preact: global.preact };
  loadBundle(sb, { only: ['ext/registry.js', 'ext.js', '../examples/plugins/ja-readings/ja-readings.js'] });
  return sb;
}

function loadExtAndPluginNoPreact() {
  const sb = { console, self: {} };
  loadBundle(sb, { only: ['ext/registry.js', 'ext.js', '../examples/plugins/ja-readings/ja-readings.js'] });
  return sb;
}

test('Setting is registered with default kana', () => {
  const sb = loadExtAndPlugin();
  const settings = sb.DojoExt.getRegisteredSettings();
  const readings = settings.find(s => s.key === 'readings');
  assert.ok(readings);
  assert.strictEqual(readings.default, 'kana');
  assert.strictEqual(readings.options.length, 3);
  assert.strictEqual(readings.options[0].value, 'kana');
  assert.strictEqual(readings.options[1].value, 'romaji');
  assert.strictEqual(readings.options[2].value, 'none');
});

test('getSetting returns default kana when unbound', () => {
  const sb = loadExtAndPlugin();
  assert.strictEqual(sb.DojoExt.getSetting('readings'), 'kana');
});

test('getSetting returns stored value when bound', () => {
  const sb = loadExtAndPlugin();
  sb.DojoExt.bindSettings((k) => 'romaji');
  assert.strictEqual(sb.DojoExt.getSetting('readings'), 'romaji');
});

test('Markup ja-readings is registered', () => {
  const sb = loadExtAndPlugin();
  assert.doesNotThrow(() => sb.DojoExt.use('ja-readings'));
});

// String mode tests (no preact, so render returns HTML strings)

test('kana mode renders ruby with the reading', () => {
  const sb = loadExtAndPluginNoPreact();
  sb.DojoExt.use('ja-readings');
  const result = sb.DojoExt.text('{学校|がっこう}');
  assert.ok(result.includes('<ruby>'));
  assert.ok(result.includes('<rt>がっこう</rt>'));
  assert.ok(result.includes('学校'));
});

test('romaji mode renders ruby with Hepburn romaji', () => {
  const sb = loadExtAndPluginNoPreact();
  sb.DojoExt.bindSettings((k) => 'romaji');
  sb.DojoExt.use('ja-readings');
  
  let result = sb.DojoExt.text('{学校|がっこう}');
  assert.ok(result.includes('<rt>gakkou</rt>'), `Expected gakkou, got: ${result}`);
  
  result = sb.DojoExt.text('{今日|きょう}');
  assert.ok(result.includes('<rt>kyou</rt>'), `Expected kyou, got: ${result}`);
  
  result = sb.DojoExt.text('{写真|しゃしん}');
  assert.ok(result.includes('<rt>shashin</rt>'), `Expected shashin, got: ${result}`);
  
  result = sb.DojoExt.text('{コーヒー|コーヒー}');
  assert.ok(result.includes('<rt>koohii</rt>'), `Expected koohii, got: ${result}`);
  
  result = sb.DojoExt.text('{本屋|ほんや}');
  assert.ok(result.includes('<rt>hon&#39;ya</rt>'), `Expected hon\'ya (escaped), got: ${result}`);
  
  result = sb.DojoExt.text('{ちょっと|ちょっと}');
  assert.ok(result.includes('<rt>chotto</rt>'), `Expected chotto, got: ${result}`);
});

test('none mode has no ruby/rt', () => {
  const sb = loadExtAndPluginNoPreact();
  sb.DojoExt.bindSettings((k) => 'none');
  sb.DojoExt.use('ja-readings');
  const result = sb.DojoExt.text('{学校|がっこう}');
  assert.strictEqual(result.indexOf('<ruby>'), -1);
  assert.strictEqual(result.indexOf('<rt>'), -1);
  assert.ok(result.includes('学校'));
});

test('switching setting between renders changes output', () => {
  const sb = loadExtAndPluginNoPreact();
  let value = 'kana';
  sb.DojoExt.bindSettings((k) => value);
  sb.DojoExt.use('ja-readings');
  
  let result = sb.DojoExt.text('{学校|がっこう}');
  assert.ok(result.includes('<rt>がっこう</rt>'));
  
  value = 'romaji';
  result = sb.DojoExt.text('{学校|がっこう}');
  assert.ok(result.includes('<rt>gakkou</rt>'));
  
  value = 'none';
  result = sb.DojoExt.text('{学校|がっこう}');
  assert.strictEqual(result.indexOf('<ruby>'), -1);
});

test('plain mode is mode-independent', () => {
  const sb = loadExtAndPluginNoPreact();
  sb.DojoExt.use('ja-readings');
  
  sb.DojoExt.bindSettings((k) => 'kana');
  let result = sb.DojoExt.plain('{学校|がっこう}');
  assert.strictEqual(result, '学校');
  
  sb.DojoExt.bindSettings((k) => 'romaji');
  result = sb.DojoExt.plain('{学校|がっこう}');
  assert.strictEqual(result, '学校');
  
  sb.DojoExt.bindSettings((k) => 'none');
  result = sb.DojoExt.plain('{学校|がっこう}');
  assert.strictEqual(result, '学校');
});

test('escaping of < in base or reading', () => {
  const sb = loadExtAndPluginNoPreact();
  sb.DojoExt.use('ja-readings');
  
  let result = sb.DojoExt.text('{<test|よみ}');
  assert.ok(result.includes('&lt;test'));
  
  result = sb.DojoExt.text('{test|<よみ>}');
  assert.ok(result.includes('&lt;よみ&gt;'));
});

test('text without markup is unchanged', () => {
  const sb = loadExtAndPluginNoPreact();
  sb.DojoExt.use('ja-readings');
  const result = sb.DojoExt.text('普通のテキスト');
  assert.strictEqual(result, '普通のテキスト');
});

// Vnode mode tests (with preact, render returns vnodes)

test('vnode mode renders correctly', () => {
  const sb = loadExtAndPlugin();
  sb.DojoExt.bindSettings((k) => 'kana');
  sb.DojoExt.use('ja-readings');
  
  const result = sb.DojoExt.text('{学校|がっこう}');
  
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].tag, 'ruby');
  assert.strictEqual(result[0].kids.length, 2);
  assert.strictEqual(result[0].kids[0].tag, 'span');
  assert.strictEqual(result[0].kids[0].kids[0], '学校');
  assert.strictEqual(result[0].kids[1].tag, 'rt');
  assert.strictEqual(result[0].kids[1].kids[0], 'がっこう');
});

test('vnode mode with romaji', () => {
  const sb = loadExtAndPlugin();
  sb.DojoExt.bindSettings((k) => 'romaji');
  sb.DojoExt.use('ja-readings');
  
  const result = sb.DojoExt.text('{学校|がっこう}');
  
  assert.strictEqual(result[0].kids[1].kids[0], 'gakkou');
});

test('vnode mode with none setting', () => {
  const sb = loadExtAndPlugin();
  sb.DojoExt.bindSettings((k) => 'none');
  sb.DojoExt.use('ja-readings');
  
  const result = sb.DojoExt.text('{学校|がっこう}');
  
  assert.strictEqual(result[0].tag, 'span');
  assert.strictEqual(result[0].kids[0], '学校');
});

test('vnode mode without markup', () => {
  const sb = loadExtAndPlugin();
  sb.DojoExt.use('ja-readings');
  
  const result = sb.DojoExt.text('普通のテキスト');
  
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].tag, 'span');
  assert.strictEqual(result[0].kids[0], '普通のテキスト');
});

const ROMAJI_CASES = [
  // small vowels and ヴ
  ['ファ', 'fa'], ['フィ', 'fi'], ['フォ', 'fo'], ['ティ', 'ti'], ['ディ', 'di'],
  ['ウィ', 'wi'], ['ウェ', 'we'], ['ウォ', 'wo'], ['チェ', 'che'], ['シェ', 'she'],
  ['ジェ', 'je'], ['ヴァ', 'va'], ['ヴ', 'vu'], ['ふぁ', 'fa'], ['てぃ', 'ti'],
  ['パーティー', 'paatii'],
  // ぢゃ digraphs
  ['ぢゃ', 'ja'], ['ぢゅ', 'ju'], ['ぢょ', 'jo'], ['ヂャ', 'ja'],
  // っ before ch
  ['まっちゃ', 'matcha'], ['マッチャ', 'matcha'], ['こっち', 'kotchi'], ['ざっし', 'zasshi'],
  ['きっぷ', 'kippu'],
  // documented limitations
  ['あっ', 'a'], ['々', '々'],
];

for (const [input, expected] of ROMAJI_CASES) {
  test(`romaji ${input} -> ${expected}`, () => {
    const sb = loadExtAndPluginNoPreact();
    sb.DojoExt.bindSettings(() => 'romaji');
    sb.DojoExt.use('ja-readings');
    const result = sb.DojoExt.text(`{X|${input}}`);
    assert.ok(result.includes(`<rt>${expected}</rt>`), `Expected ${expected}, got: ${result}`);
  });
}
