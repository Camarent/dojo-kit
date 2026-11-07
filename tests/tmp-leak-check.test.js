#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

const script = path.join(__dirname, '..', 'scripts', 'tmp-leak-check.sh');

// run: the guard with TMPDIR pointed at `tmp`, so leaks land in a dir this test owns.
function run(tmp, args) {
  const env = { ...process.env, TMPDIR: tmp };
  return spawnSync('bash', [script, ...args], { encoding: 'utf8', env });
}

// mkTmp: a fresh TMPDIR for one test, removed when the test ends.
function mkTmp(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-leak-check-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}

// A command that leaves a dojo-* entry in $TMPDIR and exits 0.
const LEAK = ['sh', '-c', 'mkdir "$TMPDIR/dojo-leak"'];
// A command that leaves nothing behind and exits 0.
const CLEAN = ['sh', '-c', 'true'];

test('command that leaves a dojo-* entry exits 1 and prints its name', (t) => {
  const tmp = mkTmp(t);
  const res = run(tmp, ['--', ...LEAK]);
  assert.strictEqual(res.status, 1);
  assert.match(res.stderr, /dojo-leak/);
});

test('clean command exits 0', (t) => {
  const tmp = mkTmp(t);
  const res = run(tmp, ['--', ...CLEAN]);
  assert.strictEqual(res.status, 0);
  assert.strictEqual(res.stderr, '');
});

test('clean command passes its own failing status through', (t) => {
  const tmp = mkTmp(t);
  const res = run(tmp, ['--', 'sh', '-c', 'exit 3']);
  assert.strictEqual(res.status, 3);
});

test('--pattern replaces the default glob', (t) => {
  const tmp = mkTmp(t);
  // dojo-leak is outside the custom pattern, so no leak is reported.
  const res = run(tmp, ['--pattern', 'other-*', '--', ...LEAK]);
  assert.strictEqual(res.status, 0);
  const hit = run(tmp, ['--pattern', 'dojo-*', '--', 'sh', '-c', 'mkdir "$TMPDIR/dojo-two"']);
  assert.strictEqual(hit.status, 1);
  assert.match(hit.stderr, /dojo-two/);
});

test('a leak under a non-matching name is ignored', (t) => {
  const tmp = mkTmp(t);
  const res = run(tmp, ['--', 'sh', '-c', 'mkdir "$TMPDIR/other-x"']);
  assert.strictEqual(res.status, 0);
});

test('missing command is a usage error', (t) => {
  const tmp = mkTmp(t);
  assert.strictEqual(run(tmp, ['--']).status, 2);
  assert.strictEqual(run(tmp, []).status, 2);
});
