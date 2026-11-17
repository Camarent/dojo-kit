#!/usr/bin/env node
'use strict';

const fs = require('fs');
require('os');
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

// Unique per process and per run: parallel gates share one real-exports dir in the main checkout.
const uniqueCourse = () => `zztest-${process.pid}-${Date.now()}`;

test('every dated json in main checkout dir, oldest first', () => {
  const course = uniqueCourse();
  const dir = realExportsDir(course);
  assert.ok(!fs.existsSync(dir), 'test dir must not pre-exist');
  // The parent is gitignored and absent on a clean checkout: create it, and remove it again only if this run made it.
  const parent = path.dirname(dir);
  const madeParent = !fs.existsSync(parent);
  if (madeParent) fs.mkdirSync(parent, { recursive: true });
  // No recursive flag on the leaf: an overlapping run on the same dir must throw EEXIST, not pass silently.
  fs.mkdirSync(dir);
  try {
    // Children set a hold so two concurrent runs overlap while the dir exists.
    const hold = Number(process.env.REAL_EXPORTS_TEST_HOLD_MS) || 0;
    if (hold) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, hold);
    fs.writeFileSync(path.join(dir, `${course}-progress-2026-02-01.json`), '{}');
    fs.writeFileSync(path.join(dir, `${course}-progress-2026-01-01.json`), '{}');
    fs.writeFileSync(path.join(dir, 'note.txt'), '');
    assert.deepStrictEqual(findRealExports(course), ['2026-01-01', '2026-02-01'].map((d) => path.join(dir, `${course}-progress-${d}.json`)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    if (madeParent) { try { fs.rmdirSync(parent); } catch { /* a concurrent run still uses it */ } }
  }
});

test('two processes running the same dir case at once both pass', async () => {
  const { spawn } = require('child_process');
  const run = () => new Promise((resolve, reject) => {
    const env = { ...process.env, REAL_EXPORTS_TEST_HOLD_MS: '1500' };
    delete env.NODE_TEST_CONTEXT; // inherited from this runner; a child must report its own results
    const child = spawn(process.execPath, ['--test', '--test-name-pattern=every dated json', __filename], { env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
  const [a, b] = await Promise.all([run(), run()]);
  assert.strictEqual(a.code, 0, a.out);
  assert.strictEqual(b.code, 0, b.out);
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
