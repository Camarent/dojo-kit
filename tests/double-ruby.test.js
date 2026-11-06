'use strict';
// Owner feedback A1: an example word whose kanji textAll already ruby-wraps got a second outer ruby (two rt).
// Mutation coverage: dropping `!hasRuby(wText)` from the example-word branch turns the first test red (rt count 2).
// Non-Latin test data is built with String.fromCodePoint so this file stays clean for core-latin.test.js.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const plugin = require(path.join(__dirname, '..', 'workspace', 'n5', 'plugins', 'ja.js'));

// Builds a string from Unicode code points, e.g. cps(0x5357) is the kanji U+5357.
const cps = (...points) => String.fromCodePoint(...points);

// Preact-shaped vnode: type, props.children (what the web h() builds).
const h = (type, props, ...children) => ({ type, props: { ...(props || {}), children: children.length === 1 ? children[0] : children } });

// Registers the detail renderer with a stub DojoExt; textAll returns dict[word] (ruby vnode) or the bare word.
function detailRenderer(dict) {
  let detail = null;
  plugin({
    DojoExt: {
      registerDetail: (fn) => { detail = fn; },
      textAll: (s) => (Object.prototype.hasOwnProperty.call(dict, s) ? dict[s] : s),
      plain: (s) => s.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, '$1'),
    },
  });
  return detail;
}

function countRt(node) {
  if (Array.isArray(node)) return node.reduce((n, c) => n + countRt(c), 0);
  if (!node || typeof node !== 'object') return 0;
  return (node.type === 'rt' ? 1 : 0) + countRt(node.props && node.props.children);
}

// Kanji item with one example word; the example's translation is a Cyrillic word built from code points.
function exampleItem(w, r) {
  const ru = cps(0x043f, 0x0440, 0x0438, 0x043c, 0x0435, 0x0440);
  return { meta: { kanji: cps(0x65e5), examples: [{ w, r, ru }] } };
}

// Minami: kanji U+5357, reading U+307F U+306A U+307F.
const MINAMI_KANJI = cps(0x5357);
const MINAMI_READING = cps(0x307f, 0x306a, 0x307f);
// Gakusei: word U+5B66 U+751F, reading U+304C U+304F U+305B U+3044.
const GAKUSEI_WORD = cps(0x5b66, 0x751f);
const GAKUSEI_READING = cps(0x304c, 0x304f, 0x305b, 0x3044);

test('example word whose kanji textAll already ruby-wraps: one rt, not two', () => {
  const minami = h('ruby', null, h('span', null, MINAMI_KANJI), h('rt', null, MINAMI_READING));
  const detail = detailRenderer({ [MINAMI_KANJI]: minami });
  const out = detail(exampleItem(MINAMI_KANJI, MINAMI_READING), { h, feedback: false });
  assert.ok(out, 'renderer returns the kanji detail');
  assert.strictEqual(countRt(out), 1);
});

test('example word with no ruby from textAll: outer ruby still gives its reading once', () => {
  const detail = detailRenderer({});
  const out = detail(exampleItem(GAKUSEI_WORD, GAKUSEI_READING), { h, feedback: false });
  assert.ok(out, 'renderer returns the kanji detail');
  assert.strictEqual(countRt(out), 1);
});
