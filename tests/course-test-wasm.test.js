#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { test, beforeEach, afterEach } = require('node:test');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'course-test.sh');
const MESSAGE = 'WASM stale: run scripts/build-wasm.sh';
const PAST = new Date('2000-01-01T00:00:00Z');
const NOW = new Date();

let tmp;
let fw;
let course;
let wasm;
let stubLog;
let stub;

// Synthetic framework root: a copy of course-test.sh, a wasm, one Rust source and a stub build script.
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'course-test-wasm-'));
  fw = path.join(tmp, 'fw');
  course = path.join(tmp, 'course');
  wasm = path.join(fw, 'target', 'wasm32-unknown-unknown', 'release', 'dojo_wasm.wasm');
  stubLog = path.join(tmp, 'stub.log');
  stub = path.join(tmp, 'stub-build.sh');
  write(path.join(fw, 'scripts', 'course-test.sh'), fs.readFileSync(SCRIPT, 'utf8'), 0o755);
  write(path.join(fw, 'crates', 'dojo-core', 'src', 'lib.rs'), '// src\n');
  write(path.join(fw, 'crates', 'dojo-wasm', 'src', 'lib.rs'), '// src\n');
  write(wasm, 'old\n');
  write(path.join(course, 'tests', 'a.test.js'),
    "const { test } = require('node:test');\ntest('ok', () => {});\n");
  // Stub build: records one line per run and writes the wasm (so it becomes fresh).
  write(stub, `#!/usr/bin/env bash\necho run >> '${stubLog}'\n: > '${wasm}'\n`, 0o755);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function write(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, mode ? { mode } : undefined);
}

// stale: Rust source newer than the wasm. fresh: wasm newer than the Rust source.
function makeStale() {
  fs.utimesSync(wasm, PAST, PAST);
  fs.utimesSync(path.join(fw, 'crates', 'dojo-core', 'src', 'lib.rs'), NOW, NOW);
}

function makeFresh() {
  for (const crate of ['dojo-core', 'dojo-wasm']) {
    fs.utimesSync(path.join(fw, 'crates', crate, 'src', 'lib.rs'), PAST, PAST);
  }
  fs.utimesSync(wasm, new Date(), new Date());
}

function run(env = {}) {
  const childEnv = { ...process.env, DOJO_QRUN: '', DOJO_KIT_ROOT: '', DOJO_KIT_ROOT_PY: '',
    DOJO_BUILD_WASM: stub, DOJO_WASM_NO_BUILD: '', ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  return spawnSync('bash', [path.join(fw, 'scripts', 'course-test.sh'), course, 'node'],
    { encoding: 'utf8', env: childEnv });
}

function stubRuns() {
  return fs.existsSync(stubLog) ? fs.readFileSync(stubLog, 'utf8').split('\n').filter(Boolean).length : 0;
}

test('stale wasm + stub build: stub runs once, exit 0', () => {
  makeStale();
  const r = run();
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual(stubRuns(), 1);
});

test('stale wasm + DOJO_WASM_NO_BUILD=1: exit 1 with the exact message, stub not run', () => {
  makeStale();
  const r = run({ DOJO_WASM_NO_BUILD: '1' });
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes(MESSAGE), r.stdout + r.stderr);
  assert.strictEqual(stubRuns(), 0);
});

test('fresh wasm: stub not run, exit 0', () => {
  makeFresh();
  const r = run();
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual(stubRuns(), 0);
});

test('stale wasm + failing build: exit 1 with the exact message', () => {
  makeStale();
  write(stub, '#!/usr/bin/env bash\nexit 3\n', 0o755);
  const r = run();
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.ok((r.stdout + r.stderr).includes(MESSAGE), r.stdout + r.stderr);
});

test('missing wasm + stub build: stub runs, exit 0', () => {
  fs.rmSync(wasm);
  const r = run();
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual(stubRuns(), 1);
});
