#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { test } = require('node:test');
const { spawnSync } = require('child_process');

test('space path guard', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build wasm '));
  try {
    fs.cpSync(path.join(__dirname, '..', 'scripts'), path.join(tmpDir, 'scripts'), { recursive: true });
    const result = spawnSync('bash', ['scripts/build-wasm.sh'], {
      cwd: tmpDir,
      timeout: 60000
    });
    assert.strictEqual(result.status, 1);
    assert.strictEqual(result.stderr.toString().includes('build-wasm: path contains a space: REPO_ROOT'), true);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
});

test('guard text present', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'build-wasm.sh'), 'utf8');
  assert.strictEqual(script.includes('path contains a space'), true);
});
