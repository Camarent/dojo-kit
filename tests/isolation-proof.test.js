#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { test, after } = require('node:test');

const script = path.join(__dirname, 'isolation-proof.sh');

// Private dir for this file's records; removed when the file's tests end.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-proof-test-'));
after(() => fs.rmSync(work, { recursive: true, force: true }));

// counted: the dir the script counts; a private dir per test, so other processes writing /tmp never change the count.
function run(args, counted) {
  return spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, ISOLATION_PROOF_DIR: counted } });
}

function privateDir(t) {
  const d = fs.mkdtempSync(path.join(work, 'counted-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

test('true exits 0', (t) => {
  const res = run(['--', 'true'], privateDir(t));
  assert.strictEqual(res.status, 0, res.stderr);
});

test('false exits non-zero', (t) => {
  const res = run(['--', 'false'], privateDir(t));
  assert.notStrictEqual(res.status, 0);
});

test('command leaving a file in the counted dir exits non-zero', (t) => {
  const counted = privateDir(t);
  // The counted dir is passed as $1, so the script's per-run TMPDIR does not hide the leak.
  const res = run(['--', 'sh', '-c', 'mktemp "$1/leak-XXXXXX"', 'sh', counted], counted);
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /count grew/);
});
