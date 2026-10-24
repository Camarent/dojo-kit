#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { test, beforeEach, afterEach } = require('node:test');

const script = path.join(__dirname, '..', 'scripts', 'course-test.sh');

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'course-test-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(rel, text, base = tmp) {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function course(name = 'course') {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function run(args, env = {}) {
  const childEnv = { ...process.env, DOJO_QRUN: '', DOJO_KIT_ROOT: '', DOJO_KIT_ROOT_PY: '', ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  return spawnSync('bash', [script, ...args], { encoding: 'utf8', env: childEnv });
}

const PASS = "const { test } = require('node:test');\ntest('ok', () => {});\n";
const FAIL = "const { test } = require('node:test');\ntest('bad', () => { throw new Error('boom'); });\n";

test('course with a passing node test exits 0', () => {
  const dir = course();
  write('tests/a.test.js', PASS, dir);
  assert.strictEqual(run([dir, 'node']).status, 0);
});

test('course with a failing node test exits 1', () => {
  const dir = course();
  write('tests/a.test.js', FAIL, dir);
  assert.strictEqual(run([dir]).status, 1);
});

test('unknown course dir exits 2', () => {
  assert.strictEqual(run([path.join(tmp, 'missing')]).status, 2);
});

test('explicit python mode with no test_*.py exits 2', () => {
  const dir = course();
  assert.strictEqual(run([dir, 'python']).status, 2);
});

test('nested *.test.js is discovered and run', () => {
  const dir = course();
  write('tools/sub/x.test.js', FAIL, dir);
  assert.strictEqual(run([dir, 'node']).status, 1);
});

test('*.test.js under fixtures/, node_modules/ and dist/ is ignored', () => {
  const dir = course();
  write('fixtures/f.test.js', FAIL, dir);
  write('node_modules/pkg/n.test.js', FAIL, dir);
  write('dist/d.test.js', FAIL, dir);
  assert.strictEqual(run([dir, 'node']).status, 2);
  assert.strictEqual(run([dir]).status, 0);
});

test('a dir with test_*.py is run with unittest and a failure exits 1', () => {
  const dir = course();
  write('tools/py/__init__.py', '', dir);
  write('tools/py/test_x.py', 'import unittest\nclass T(unittest.TestCase):\n    def test_bad(self):\n        self.fail("boom")\n', dir);
  assert.strictEqual(run([dir, 'python']).status, 1);
});

test('a dir with a passing test_*.py exits 0 in all mode', () => {
  const dir = course();
  write('tools/py/__init__.py', '', dir);
  write('tools/py/test_x.py', 'import unittest\nclass T(unittest.TestCase):\n    def test_ok(self):\n        pass\n', dir);
  assert.strictEqual(run([dir]).status, 0);
});

test('all mode on an empty course exits 0', () => {
  const dir = course();
  assert.strictEqual(run([dir]).status, 0);
});

test('DOJO_QRUN stub is invoked with -- and the suite command', () => {
  const dir = course();
  write('tests/a.test.js', PASS, dir);
  const log = path.join(tmp, 'qrun.log');
  const stub = path.join(tmp, 'qrun-stub.py');
  fs.writeFileSync(stub, `import sys, os\nopen(${JSON.stringify(log)}, 'a').write(' '.join(sys.argv[1:]) + '\\n')\n`);
  const res = run([dir, 'node'], { DOJO_QRUN: stub });
  assert.strictEqual(res.status, 0);
  const text = fs.readFileSync(log, 'utf8');
  assert.match(text, /^-- node --test \S*tests\/a\.test\.js\n$/);
});

test('course path containing spaces runs node and python suites', () => {
  const dir = course('my course dir');
  write('tests/a.test.js', PASS, dir);
  write('tools/py/__init__.py', '', dir);
  write('tools/py/test_x.py', 'import unittest\nclass T(unittest.TestCase):\n    def test_ok(self):\n        pass\n', dir);
  assert.strictEqual(run([dir]).status, 0);
  assert.strictEqual(run([dir, 'python']).status, 0);
});

test('DOJO_KIT_ROOT_PY overrides DOJO_KIT_ROOT for the python run', () => {
  const dir = course();
  write('tools/py/__init__.py', '', dir);
  write('tools/py/test_root.py', "import os, unittest\nclass T(unittest.TestCase):\n    def test_root(self):\n        self.assertEqual(os.environ['DOJO_KIT_ROOT'], '/py/root')\n", dir);
  const res = run([dir, 'python'], { DOJO_KIT_ROOT: '/node/root', DOJO_KIT_ROOT_PY: '/py/root' });
  assert.strictEqual(res.status, 0, res.stdout + res.stderr);
});

test('DOJO_GIT_SAFE=1 exports the safe.directory env to the suite', () => {
  const dir = course();
  const out = path.join(tmp, 'env.json');
  write('tests/env.test.js', `const { test } = require('node:test');\nconst fs = require('fs');\ntest('env', () => {\n  fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify({\n    count: process.env.GIT_CONFIG_COUNT,\n    key: process.env.GIT_CONFIG_KEY_0,\n    value: process.env.GIT_CONFIG_VALUE_0,\n  }));\n});\n`, dir);
  assert.strictEqual(run([dir, 'node'], { DOJO_GIT_SAFE: '1' }).status, 0);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { count: '1', key: 'safe.directory', value: '*' });
});

test('a test file inside .venv is ignored', () => {
  const dir = course();
  write('.venv/lib/v.test.js', FAIL, dir);
  write('venv/lib/w.test.js', FAIL, dir);
  write('tools/py/__pycache__/x.py', '', dir);
  assert.strictEqual(run([dir, 'node']).status, 2);
  write('tests/a.test.js', PASS, dir);
  assert.strictEqual(run([dir]).status, 0);
});
