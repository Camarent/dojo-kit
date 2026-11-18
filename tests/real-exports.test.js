#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { test, beforeEach, afterEach } = require('node:test');

const { execFileSync } = require('child_process');
const { findRealExports, summarizeGate, realExportsDir, realGateStrict } = require('../tools/real-exports.js');

let saved;
beforeEach(() => { saved = { ...process.env }; delete process.env.FIXTURE_REAL_EXPORT; delete process.env.REAL_GATE_STRICT; delete process.env.DOJO_REAL_EXPORTS_ROOT; });
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

test('default root: lookup from a linked worktree resolves to the main checkout', (t) => {
  // Synthetic layout: private main repo (one commit) plus a linked worktree; all removed on end.
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'real-exports-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const main = path.join(base, 'main');
  const wt = path.join(base, 'wt');
  fs.mkdirSync(main);
  const git = (cwd, args) => execFileSync('git', ['-c', 'safe.directory=*', '-c', 'user.name=t', '-c', 'user.email=t@localhost', '-C', cwd, ...args], { stdio: 'ignore' });
  git(main, ['init', '-q']);
  git(main, ['commit', '-q', '--allow-empty', '-m', 'init']);
  git(main, ['worktree', 'add', '-q', '--detach', wt]);
  // Framework root = the worktree (marker file only), so the default lookup runs git from it.
  fs.mkdirSync(path.join(wt, 'web'));
  fs.writeFileSync(path.join(wt, 'web', 'dojo-wasm.js'), '');
  process.env.DOJO_KIT_ROOT = wt;
  const cwd = process.cwd();
  process.chdir(wt);
  try {
    // Default lookup, no override: must resolve to the main checkout; read-only (no mkdir/write).
    const dir = realExportsDir('zz-none');
    assert.strictEqual(dir, path.join(main, 'workspace', 'progress', 'zz-none'));
    assert.ok(!dir.startsWith(wt + path.sep));
    assert.strictEqual(fs.existsSync(dir), false);
  } finally {
    process.chdir(cwd);
  }
});
