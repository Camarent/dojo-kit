'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadBundle } = require('./load-bundle.js');

function load() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js'] });
  return sb;
}
const J = (x) => JSON.parse(JSON.stringify(x));

test('use("ruby") selects the built-in markup without a plugin', () => {
  const E = load().DojoExt;
  assert.strictEqual(E.use('ruby'), true);
  assert.strictEqual(E.plain('{食|た}べ{物|もの}'), '食べ物');
});

test('plain keeps text without markup and ignores non-strings', () => {
  const E = load().DojoExt;
  E.use('ruby');
  assert.strictEqual(E.plain('no markup {x}'), 'no markup {x}');
  assert.strictEqual(E.plain(5), 5);
});

test('render gives span and ruby/rt vnodes; all children of the mixed array are keyed', () => {
  const sb = load();
  const E = sb.DojoExt;
  E.use('ruby');
  const out = Array.from(E.text('a{漢|かん}b{字|じ}'));
  assert.strictEqual(out.length, 4);
  assert.deepStrictEqual(J(out.map((v) => v.type)), ['span', 'ruby', 'span', 'ruby']);
  assert.deepStrictEqual(J(out.map((v) => v.key)), ['m0', 'm1', 'm2', 'm3']);
  const ruby = out[1];
  assert.deepStrictEqual(J(ruby.props.children.map((c) => [c.type, c.props.children])), [['span', '漢'], ['rt', 'かん']]);
});

test('render never emits raw HTML: markup characters stay text children', () => {
  const E = load().DojoExt;
  E.use('ruby');
  const out = Array.from(E.text('<b>x</b>{<i>|&}'));
  assert.strictEqual(out[0].props.children, '<b>x</b>');
  assert.deepStrictEqual(J(out[1].props.children.map((c) => c.props.children)), ['<i>', '&']);
});

test('a registered markup named ruby wins over the built-in', () => {
  const E = load().DojoExt;
  E.registerMarkup('ruby', { render: (s) => s, plain: () => 'custom' });
  E.use('ruby');
  assert.strictEqual(E.plain('{a|b}'), 'custom');
});

test('unknown markup still falls back to plain text', () => {
  const E = load().DojoExt;
  const w = console.warn; console.warn = () => {};
  try { assert.strictEqual(E.use('nope'), false); } finally { console.warn = w; }
  assert.strictEqual(E.text('{a|b}'), '{a|b}');
});
