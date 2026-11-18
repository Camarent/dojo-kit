// Mode flags of scripts/check-all.sh (--unit, --premerge, --smoke). Each test runs the script in a
// stub repo whose steps log their name to ran.log, so the test sees which steps a mode runs.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(REPO, 'scripts', 'check-all.sh'));
const GUARD = fs.readFileSync(path.join(REPO, 'scripts', 'tmp-leak-check.sh'));
const PROOF = fs.readFileSync(path.join(REPO, 'tests', 'isolation-proof.sh'));

// makeFixture(root, opts): stub repo in root. opts.nodeExit / opts.hooksExit make those stubs fail.
function makeFixture(root, opts = {}) {
  const write = (rel, body, mode) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, { mode: mode || 0o644 });
  };
  const logLine = (name) => `echo "${name}" >> ran.log\n`;
  write('scripts/check-all.sh', SCRIPT, 0o755);
  write('scripts/tmp-leak-check.sh', GUARD, 0o755);
  write('tests/isolation-proof.sh', PROOF, 0o755);
  write('scripts/build-wasm.sh', '#!/usr/bin/env bash\n' + logLine('build-wasm') + 'exit 0\n', 0o755);
  write('scripts/course-test.sh', '#!/usr/bin/env bash\n' + logLine('course-test $*') + 'exit 0\n', 0o755);
  write('tests/wasm-smoke.js', '');
  write('tests/gen-vectors.js', '');
  write('tests/hooks-test.sh', '#!/usr/bin/env bash\n' + logLine('hooks-test') + `exit ${opts.hooksExit || 0}\n`, 0o755);
  write('bin/cargo', '#!/usr/bin/env bash\n' + logLine('cargo $*') + 'exit 0\n', 0o755);
  write('bin/node', '#!/usr/bin/env bash\n' + logLine('node $*') + `exit ${opts.nodeExit || 0}\n`, 0o755);
  write(path.join('workspace', 'alpha', 'course.json'), '{}\n');
  fs.mkdirSync(path.join(root, 'tmp'));
  fs.mkdirSync(path.join(root, 'proof'));
  spawnSync('git', ['init', '-q'], { cwd: root });
}

// runCheckAll(args, opts): runs check-all.sh in a fresh stub repo; returns exit status, output and the step log.
function runCheckAll(args, opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-all-modes-'));
  try {
    makeFixture(root, opts);
    const res = spawnSync('bash', [path.join(root, 'scripts', 'check-all.sh'), ...args], {
      cwd: root,
      env: {
        PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH,
        HOME: root,
        TMPDIR: path.join(root, 'tmp'),
        ISOLATION_PROOF_DIR: path.join(root, 'proof'),
      },
      encoding: 'utf8',
    });
    const logFile = path.join(root, 'ran.log');
    const ran = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    return { status: res.status, out: res.stdout + res.stderr, ran };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('no mode flag runs the full chain: build, cargo, node, wasm-smoke, vectors, hooks; no courses', () => {
  const r = runCheckAll([]);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /CHECK-ALL OK/);
  assert.match(r.ran, /^build-wasm$/m);
  assert.match(r.ran, /^cargo test --workspace$/m);
  assert.match(r.ran, /^node --test /m);
  assert.match(r.ran, /^node tests\/wasm-smoke\.js$/m);
  assert.match(r.ran, /^hooks-test$/m);
  assert.doesNotMatch(r.ran, /course-test/);
});

test('--unit runs build-wasm, cargo and node tests only', () => {
  const r = runCheckAll(['--unit']);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /CHECK-ALL OK/);
  assert.match(r.ran, /^build-wasm$/m);
  assert.match(r.ran, /^cargo test --workspace$/m);
  assert.match(r.ran, /^node --test /m);
  assert.doesNotMatch(r.ran, /wasm-smoke|hooks-test|course-test/);
});

test('--smoke runs wasm-smoke, vectors, hooks, then the course tests; no build or cargo', () => {
  const r = runCheckAll(['--smoke']);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /CHECK-ALL OK/);
  assert.match(r.ran, /^node tests\/wasm-smoke\.js$/m);
  assert.match(r.ran, /^hooks-test$/m);
  assert.match(r.ran, /^course-test \S+alpha$/m);
  assert.doesNotMatch(r.ran, /build-wasm|cargo|node --test/);
});

test('--smoke stops at the first red step and names it', () => {
  const r = runCheckAll(['--smoke'], { hooksExit: 1 });
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.out, /CHECK-ALL FAILED at bash tests\/hooks-test\.sh/);
  assert.doesNotMatch(r.ran, /course-test/);
});

test('--premerge runs only the isolation proof of --unit: two concurrent and two sequential runs', () => {
  const r = runCheckAll(['--premerge']);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /copy 1 exit=0/);
  assert.match(r.out, /copy 2 exit=0/);
  assert.match(r.out, /seq 1 exit=0/);
  assert.match(r.out, /seq 2 exit=0/);
  assert.match(r.out, /CHECK-ALL OK/);
  // Four nested --unit runs: each runs build-wasm once; no wasm-smoke, hooks or course steps.
  assert.strictEqual(r.ran.split('\n').filter((l) => l === 'build-wasm').length, 4);
  assert.doesNotMatch(r.ran, /wasm-smoke|hooks-test|course-test/);
});

test('--premerge fails when a unit run fails', () => {
  const r = runCheckAll(['--premerge'], { nodeExit: 1 });
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.out, /CHECK-ALL FAILED at isolation-proof \(--premerge\)/);
});

test('mode flags cannot be combined: exit 2', () => {
  const r = runCheckAll(['--unit', '--smoke']);
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.out, /mode flags cannot be combined: --unit --smoke/);
  assert.strictEqual(r.ran, '');
});

test('the same mode flag twice is a combination too: exit 2', () => {
  const r = runCheckAll(['--premerge', '--premerge']);
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.out, /mode flags cannot be combined/);
});
