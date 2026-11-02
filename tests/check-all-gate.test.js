// Gate flag and env names of scripts/check-all.sh. The script runs in a stub repo whose
// steps are no-ops, so only the gate selection is observed.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(REPO, 'scripts', 'check-all.sh'));

function makeFixture(root) {
  const write = (rel, body, mode) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, { mode: mode || 0o644 });
  };
  write('scripts/check-all.sh', SCRIPT, 0o755);
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

function runCheckAll(args, env) {
  const root = path.join(REPO, '.check-all-fixture-' + process.pid + '-' + Math.random().toString(36).slice(2));
  makeFixture(root);
  try {
    const base = { PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH, HOME: root };
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
