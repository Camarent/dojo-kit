// Gate flag and env names of scripts/check-all.sh. The script runs in a stub repo whose
// steps are no-ops, so only the gate selection is observed.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(REPO, 'scripts', 'check-all.sh'));
const GUARD = fs.readFileSync(path.join(REPO, 'scripts', 'tmp-leak-check.sh'));

function makeFixture(root) {
  const write = (rel, body, mode) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, { mode: mode || 0o644 });
  };
  write('scripts/check-all.sh', SCRIPT, 0o755);
  write('scripts/tmp-leak-check.sh', GUARD, 0o755);
  write('scripts/build-wasm.sh', '#!/usr/bin/env bash\nexit 0\n', 0o755);
  write('tests/wasm-smoke.js', '');
  write('tests/gen-vectors.js', '');
  write('tests/hooks-test.sh', '#!/usr/bin/env bash\nexit 0\n', 0o755);
  write('bin/cargo', '#!/usr/bin/env bash\nexit 0\n', 0o755);
  write('bin/node', '#!/usr/bin/env bash\nexit 0\n', 0o755);
  write('gate.sh', '#!/usr/bin/env bash\necho GATE-RAN\n', 0o755);
  spawnSync('git', ['init', '-q'], { cwd: root });
}

function mapGate(env, real) {
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === GATE ? real : v]));
}

// cargoBody replaces the stub cargo; TMPDIR is a fixture dir, so leak checks never touch the real /tmp.
function runCheckAll(args, env, cargoBody) {
  const root = path.join(REPO, '.check-all-fixture-' + process.pid + '-' + Math.random().toString(36).slice(2));
  makeFixture(root);
  try {
    if (cargoBody !== undefined) {
      fs.writeFileSync(path.join(root, 'bin', 'cargo'), '#!/usr/bin/env bash\n' + cargoBody + '\n', { mode: 0o755 });
    }
    fs.mkdirSync(path.join(root, 'tmp'));
    const base = {
      PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH,
      HOME: root,
      TMPDIR: path.join(root, 'tmp'),
    };
    const res = spawnSync('bash', [path.join(root, 'scripts', 'check-all.sh'), ...args], {
      cwd: root,
      env: { ...base, ...mapGate(env, path.join(root, 'gate.sh')) },
      encoding: 'utf8',
    });
    return { status: res.status, out: res.stdout + res.stderr };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const GATE = '__GATE__';

test('--with-course-gate selects the gate, DOJO_COURSE_GATE names it', () => {
  const r = runCheckAll(['--with-course-gate'], { DOJO_COURSE_GATE: GATE });
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /GATE-RAN/);
});

test('--with-gate is no longer accepted', () => {
  const r = runCheckAll(['--with-gate'], { DOJO_COURSE_GATE: GATE });
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.out, /unknown argument: --with-gate/);
});

test('DOJO_N5_GATE no longer names the gate', () => {
  const r = runCheckAll(['--with-course-gate'], { DOJO_N5_GATE: GATE });
  assert.strictEqual(r.status, 1, r.out);
  assert.doesNotMatch(r.out, /GATE-RAN/);
});

test('no gate flag runs no gate', () => {
  const r = runCheckAll([], { DOJO_COURSE_GATE: GATE });
  assert.strictEqual(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /GATE-RAN/);
  assert.match(r.out, /CHECK-ALL OK/);
});

test('cargo test step runs through the tmp-leak guard, step label unchanged', () => {
  assert.match(SCRIPT.toString(), /step "cargo test --workspace" bash scripts\/tmp-leak-check\.sh -- cargo test --workspace/);
});

test('cargo test step fails when cargo leaves a dojo-* entry in TMPDIR', () => {
  const r = runCheckAll([], {}, 'mkdir "$TMPDIR/dojo-leaked-by-cargo"');
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.out, /tmp-leak-check: 0 -> 1 matching entries/);
  assert.match(r.out, /CHECK-ALL FAILED at cargo test --workspace/);
});

test('cargo test step passes when cargo leaves no dojo-* entry', () => {
  const r = runCheckAll([], {}, 'mkdir "$TMPDIR/other-tool"');
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /CHECK-ALL OK/);
});
