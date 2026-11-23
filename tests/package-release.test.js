#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { test } = require('node:test');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PACK = path.join(ROOT, 'scripts', 'package-release-pack.sh');
const TAG = 'v0.0.0-test';
const NAME = `dojo-${TAG}-linux-x86_64.tar.gz`;

// Runs the pack script on stub dojo and wasm files; returns the out dir and the run result.
function pack(tmpDir, outName) {
  const out = path.join(tmpDir, outName);
  const result = spawnSync('bash', [PACK, TAG, out, path.join(tmpDir, 'dojo-stub'), path.join(tmpDir, 'wasm-stub')], {
    cwd: ROOT,
    env: { ...process.env, SOURCE_DATE_EPOCH: '1700000000' },
    timeout: 60000
  });
  return { out, result };
}

function withStubs(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-release-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'dojo-stub'), '#!/bin/sh\necho stub\n', { mode: 0o755 });
    fs.writeFileSync(path.join(tmpDir, 'wasm-stub'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    fn(tmpDir);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

test('archive layout: exactly dojo, dojo.wasm, web/, THIRD_PARTY_NOTICES.md at the root', () => {
  withStubs((tmpDir) => {
    const { out, result } = pack(tmpDir, 'out');
    assert.strictEqual(result.status, 0, result.stderr.toString());
    const listing = spawnSync('tar', ['-tzf', path.join(out, NAME)]).stdout.toString().split('\n').filter(Boolean);
    const top = [...new Set(listing.map((entry) => entry.split('/')[0]))].sort();
    assert.deepStrictEqual(top, ['THIRD_PARTY_NOTICES.md', 'dojo', 'dojo.wasm', 'web']);
    assert.ok(listing.includes('web/bundle.json'));
    assert.ok(listing.includes('web/index.template.html'));
    assert.ok(listing.includes('web/i18n/en.json'));
  });
});

test('entries under web/ are in sorted name order (tar --sort=name)', () => {
  withStubs((tmpDir) => {
    const { out, result } = pack(tmpDir, 'out');
    assert.strictEqual(result.status, 0, result.stderr.toString());
    const listing = spawnSync('tar', ['-tzf', path.join(out, NAME)]).stdout.toString().split('\n').filter(Boolean);
    const children = [...new Set(listing
      .filter((entry) => entry.startsWith('web/'))
      .map((entry) => entry.slice('web/'.length).split('/')[0]))];
    assert.deepStrictEqual(children, [...children].sort());
  });
});

test('checksum file: one line "<sha>  <archive name>" matching the archive', () => {
  withStubs((tmpDir) => {
    const { out, result } = pack(tmpDir, 'out');
    assert.strictEqual(result.status, 0, result.stderr.toString());
    const archive = fs.readFileSync(path.join(out, NAME));
    const sha = crypto.createHash('sha256').update(archive).digest('hex');
    assert.strictEqual(fs.readFileSync(path.join(out, `${NAME}.sha256`), 'utf8'), `${sha}  ${NAME}\n`);
  });
});

test('two runs produce identical archive bytes', () => {
  withStubs((tmpDir) => {
    const first = pack(tmpDir, 'out1');
    const second = pack(tmpDir, 'out2');
    assert.strictEqual(first.result.status, 0, first.result.stderr.toString());
    assert.strictEqual(second.result.status, 0, second.result.stderr.toString());
    const a = fs.readFileSync(path.join(first.out, NAME));
    const b = fs.readFileSync(path.join(second.out, NAME));
    assert.strictEqual(a.equals(b), true);
  });
});

test('pack script refuses a wrong argument count', () => {
  const result = spawnSync('bash', [PACK, TAG], { cwd: ROOT, timeout: 60000 });
  assert.strictEqual(result.status, 2);
});
