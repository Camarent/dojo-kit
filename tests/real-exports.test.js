#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { test, beforeEach, afterEach } = require('node:test');

const { findRealExports, summarizeGate, realExportsDir, realGateStrict } = require('../tools/real-exports.js');

let saved;
beforeEach(() => { saved = { ...process.env }; delete process.env.ZZTEST_REAL_EXPORT; delete process.env.REAL_GATE_STRICT; });
afterEach(() => { process.env = saved; });

test('env var path wins', () => {
  process.env.ZZTEST_REAL_EXPORT = '/x/a.json';
  assert.deepStrictEqual(findRealExports('zztest'), ['/x/a.json']);
});

test('env name maps dashes to underscores', () => {
  process.env.ZZ_TEST_REAL_EXPORT = '/x/b.json';
  assert.deepStrictEqual(findRealExports('zz-test'), ['/x/b.json']);
  delete process.env.ZZ_TEST_REAL_EXPORT;
});

test('no exports gives []', () => {
  assert.deepStrictEqual(findRealExports('zztest-nonexistent'), []);
});

test('every dated json in main checkout dir, oldest first', () => {
  const dir = realExportsDir('zztest');
  assert.ok(!fs.existsSync(dir), 'test dir must not pre-exist');
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, 'zztest-progress-2026-02-01.json'), '{}');
    fs.writeFileSync(path.join(dir, 'zztest-progress-2026-01-01.json'), '{}');
    fs.writeFileSync(path.join(dir, 'note.txt'), '');
    assert.deepStrictEqual(findRealExports('zztest'), ['2026-01-01', '2026-02-01'].map((d) => path.join(dir, `zztest-progress-${d}.json`)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
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

test('dir resolves under a main checkout, not a nested worktree', () => {
  assert.ok(realExportsDir('zztest').endsWith(path.join('workspace', 'progress', 'zztest')));
  assert.ok(!realExportsDir('zztest').includes(`${path.sep}.worktrees${path.sep}`));
});
