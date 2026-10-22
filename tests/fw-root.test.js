#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { test, beforeEach, afterEach } = require('node:test');

const frameworkRoot = require('../tools/fw-root.js');

let savedEnv;
let tmpDirs = [];

function mkTmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-root-'));
  tmpDirs.push(d);
  return d;
}

function cleanup() {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
  }
  tmpDirs = [];
}

beforeEach(() => {
  savedEnv = process.env.DOJO_KIT_ROOT;
  delete process.env.DOJO_KIT_ROOT;
});

afterEach(() => {
  if (savedEnv !== undefined) {
    process.env.DOJO_KIT_ROOT = savedEnv;
  }
  cleanup();
});

test('uses DOJO_KIT_ROOT when set', () => {
  const root = mkTmp();
  fs.mkdirSync(path.join(root, 'web'), { recursive: true });
  fs.writeFileSync(path.join(root, 'web', 'dojo-wasm.js'), 'dummy');
  process.env.DOJO_KIT_ROOT = root;
  assert.strictEqual(frameworkRoot(), root);
});

test('throws when DOJO_KIT_ROOT lacks web/dojo-wasm.js', () => {
  const root = mkTmp();
  process.env.DOJO_KIT_ROOT = root;
  assert.throws(() => frameworkRoot(), /DOJO_KIT_ROOT \(.+\) does not contain web\/dojo-wasm\.js/);
});

test('walks up to the first ancestor with web/dojo-wasm.js', () => {
  const root = mkTmp();
  const deep = path.join(root, 'a', 'b', 'c');
  fs.mkdirSync(path.join(root, 'web'), { recursive: true });
  fs.writeFileSync(path.join(root, 'web', 'dojo-wasm.js'), 'dummy');
  fs.mkdirSync(deep, { recursive: true });
  assert.strictEqual(frameworkRoot(deep), root);
});

test('throws when no framework root is found', () => {
  const start = mkTmp();
  assert.throws(() => frameworkRoot(start), /dojo-kit framework root not found/);
});
