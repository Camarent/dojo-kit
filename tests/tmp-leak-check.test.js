#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawn, spawnSync, execFileSync } = require('child_process');
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

// runAsync: start the guard without waiting, so two guards can run at once. Resolves to { status, stderr }.
function runAsync(env, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [script, ...args], { env });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

test('two concurrent guards: only the one whose child leaks exits 1', async (t) => {
  // Unique names per run (no clock): the leak goes to the guard's private dir, the decoy to the test's private dir.
  const name = `dojo-concurrent-${crypto.randomUUID()}`;
  const decoy = `dojo-decoy-${crypto.randomUUID()}`;
  // Private dir for the FIFO handshake and the decoy; removed when the test ends.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-leak-concurrent-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const fifo = path.join(work, 'go');
  execFileSync('mkfifo', [fifo]);
  const env = { ...process.env };
  delete env.TMPDIR;
  // Clean child: writes its decoy into the test's private dir, then blocks until the leaker signals.
  const clean = runAsync(env, ['--', 'sh', '-c', 'mkdir "$1"; read go < "$2"', 'sh', path.join(work, decoy), fifo]);
  // Leaker: writes its leak into its own TMPDIR, then signals the clean child (always, so it never hangs).
  const leaker = runAsync(env, ['--', 'sh', '-c', 'mkdir "$TMPDIR/$1"; st=$?; echo go > "$2"; exit $st', 'sh', name, fifo]);
  const [leak, ok] = await Promise.all([leaker, clean]);
  assert.strictEqual(leak.status, 1, leak.stderr);
  assert.match(leak.stderr, new RegExp(name));
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.strictEqual(ok.stderr, '');
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
