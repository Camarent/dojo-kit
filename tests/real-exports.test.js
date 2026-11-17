#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { test, beforeEach, afterEach } = require('node:test');

const { findRealExports, summarizeGate, realExportsDir, realGateStrict } = require('../tools/real-exports.js');

let saved;
beforeEach(() => { saved = { ...process.env }; delete process.env.FIXTURE_REAL_EXPORT; delete process.env.REAL_GATE_STRICT; });
afterEach(() => { process.env = saved; });

test('env var path wins', () => {
  process.env.FIXTURE_REAL_EXPORT = '/x/a.json';
  assert.deepStrictEqual(findRealExports('fixture'), ['/x/a.json']);
});

test('env name maps dashes to underscores', () => {
  process.env.ZZ_TEST_REAL_EXPORT = '/x/b.json';
  assert.deepStrictEqual(findRealExports('zz-test'), ['/x/b.json']);
  delete process.env.ZZ_TEST_REAL_EXPORT;
});

test('no exports gives []', () => {
  assert.deepStrictEqual(findRealExports('fixture-nonexistent'), []);
});

test('every dated json in the exports dir, oldest first', (t) => {
  // Private root per test: the exports dir lives under it, never in the main checkout.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-exports-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  process.env.DOJO_REAL_EXPORTS_ROOT = root;
  const course = 'fixture';
  const dir = realExportsDir(course);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${course}-progress-2026-02-01.json`), '{}');
  fs.writeFileSync(path.join(dir, `${course}-progress-2026-01-01.json`), '{}');
  fs.writeFileSync(path.join(dir, 'note.txt'), '');
  assert.deepStrictEqual(findRealExports(course), ['2026-01-01', '2026-02-01'].map((d) => path.join(dir, `${course}-progress-${d}.json`)));
});

test('env root override: exports are read from the injected root only', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-exports-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  process.env.DOJO_REAL_EXPORTS_ROOT = root;
  assert.ok(realExportsDir('fixture').startsWith(root + path.sep));
  assert.deepStrictEqual(findRealExports('fixture'), []);
});

test('summary: per-file lines, mixed set passes', () => {
  const r = summarizeGate([{ file: '/a/x.json', exercised: false }, { file: '/a/y.json', exercised: true }], true);
  assert.deepStrictEqual(r.lines, ['x.json: invariants-only', 'y.json: exercised']);
  assert.strictEqual(r.fail, false);
});

test('summary: none exercised is loud, fails only when strict', () => {
  const set = [{ file: '/a/x.json', exercised: false }];
  assert.ok(summarizeGate(set, false).lines.includes('NO EXPORT EXERCISED MIGRATION'));
  assert.strictEqual(summarizeGate(set, false).fail, false);
  assert.strictEqual(summarizeGate(set, true).fail, true);
});

test('summary: empty set is not "none exercised"', () => {
  const r = summarizeGate([], true);
  assert.strictEqual(r.none, false);
  assert.deepStrictEqual(r.lines, []);
});

test('strict mode flag', () => {
  assert.strictEqual(realGateStrict(), false);
  process.env.REAL_GATE_STRICT = '1';
  assert.strictEqual(realGateStrict(), true);
});

test('dir resolves under the injected root', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-exports-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  process.env.DOJO_REAL_EXPORTS_ROOT = root;
  assert.strictEqual(realExportsDir('fixture'), path.join(root, 'workspace', 'progress', 'fixture'));
});
