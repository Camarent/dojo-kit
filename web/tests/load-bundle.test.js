'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadBundle, bundleScripts, readSource } = require('./load-bundle.js');

function fixture(files, scripts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-'));
  for (const [f, src] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), src);
  const bundlePath = path.join(dir, 'bundle.json');
  fs.writeFileSync(bundlePath, JSON.stringify({ scripts }));
  return { dir, bundlePath };
}
const log = (n) => `(globalThis.log = globalThis.log || []).push('${n}');`;
const FILES = { 'a.js': log('a'), 'b.js': log('b'), 'c.js': log('c') };
const run = (scripts, opts = {}) => {
  const fx = fixture(FILES, scripts);
  const sb = {};
  loadBundle(sb, { bundle: fx.bundlePath, root: fx.dir, ...opts });
  return Array.from(sb.log);
};

test('bundleScripts is bundle.json minus @course', () => {
  const expected = JSON.parse(readSource('bundle.json')).scripts.filter((s) => s !== '@course');
  assert.deepStrictEqual(bundleScripts(), expected);
  assert.ok(!bundleScripts().includes('@course'));
});

test('loadBundle executes scripts in bundle order and skips @course', () => {
  assert.deepStrictEqual(run(['a.js', '@course', 'b.js', 'c.js']), ['a', 'b', 'c']);
});

test('loadBundle order follows the bundle when entries are swapped', () => {
  assert.deepStrictEqual(run(['c.js', 'b.js', 'a.js']), ['c', 'b', 'a']);
});

test('loadBundle runs the last script', () => {
  assert.strictEqual(run(['a.js', 'b.js', 'c.js']).at(-1), 'c');
});

test('loadBundle accepts a bundle object', () => {
  const fx = fixture(FILES, []);
  const sb = {};
  loadBundle(sb, { bundle: { scripts: ['b.js', 'a.js'] }, root: fx.dir });
  assert.deepStrictEqual(Array.from(sb.log), ['b', 'a']);
});

test('loadBundle throws on a listed file that is missing', () => {
  const fx = fixture(FILES, ['a.js', 'missing.js']);
  assert.throws(() => loadBundle({}, { bundle: fx.bundlePath, root: fx.dir }), /ENOENT/);
});

test('loadBundle throws on an unknown script path', () => {
  assert.throws(() => run(['a.js', 'nope/unknown.js']), /ENOENT/);
});

test('override replaces exactly one executed file', () => {
  const log2 = run(['a.js', 'b.js', 'c.js'], { override: { 'b.js': log('B2') } });
  assert.deepStrictEqual(log2, ['a', 'B2', 'c']);
});

test('skip removes exactly the named file from execution', () => {
  assert.deepStrictEqual(run(['a.js', 'b.js', 'c.js'], { skip: ['b.js'] }), ['a', 'c']);
});
