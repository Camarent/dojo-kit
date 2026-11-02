// Checks .github/workflows/ci.yml against scripts/ci.sh with line checks (no YAML parser).
// Every `step <cmd>` line of ci.sh must appear as a `- run: <cmd>` line of ci.yml, and the
// matrix must list Node 22 and 24. The mutation case drops one step from an in-memory copy.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const CI_YML = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
const CI_SH = fs.readFileSync(path.join(REPO, 'scripts', 'ci.sh'), 'utf8');

// Commands of the `step <cmd>` lines of ci.sh, in order.
function shSteps(sh) {
  return sh
    .split('\n')
    .map((line) => line.match(/^step (.+)$/))
    .filter(Boolean)
    .map((m) => m[1].trim());
}

// Lines (trimmed) of one job under `jobs:`, from its `  <name>:` line up to the next job.
function jobLines(yml, name) {
  const all = yml.split('\n');
  const start = all.indexOf(`  ${name}:`);
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < all.length && !/^ {2}\S/.test(all[i]); i++) out.push(all[i].trim());
  return out;
}

// Returns a list of problems; empty means ci.yml covers ci.sh and the matrix is 22 and 24.
function checkCi(yml, sh) {
  const problems = [];
  const lines = yml.split('\n').map((l) => l.trim());
  if (!lines.includes('node-version: [22, 24]') && !lines.includes('node-version: [22,24]')) {
    problems.push('matrix node-version must be [22, 24]');
  }
  for (const uses of ['actions/checkout@', 'actions/setup-node@', 'dtolnay/rust-toolchain@']) {
    if (!lines.some((l) => l.includes(`uses: ${uses}`))) problems.push(`missing step uses: ${uses}`);
  }
  if (!lines.some((l) => l.startsWith('components:') && l.includes('clippy'))) {
    problems.push('rust toolchain must install clippy');
  }
  if (!lines.includes('cache: npm')) problems.push('setup-node must cache: npm');
  if (!yml.split('\n').some((l) => l.startsWith('concurrency:'))) {
    problems.push('workflow must set concurrency');
  }
  if (!lines.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")) {
    problems.push('concurrency must cancel in progress only for pull_request');
  }
  if (!jobLines(yml, 'check').includes('timeout-minutes: 30')) {
    problems.push('check job must set timeout-minutes: 30');
  }
  if (!jobLines(yml, 'rust-audit').includes('timeout-minutes: 15')) {
    problems.push('rust-audit job must set timeout-minutes: 15');
  }
  const steps = shSteps(sh);
  if (steps.length === 0) problems.push('scripts/ci.sh has no step lines');
  for (const cmd of steps) {
    if (!lines.includes(`- run: ${cmd}`)) problems.push(`ci.yml missing step: ${cmd}`);
  }
  return problems;
}

test('ci.yml covers every ci.sh step on Node 22 and 24', () => {
  assert.deepStrictEqual(checkCi(CI_YML, CI_SH), []);
});

test('ci.sh runs the CI commands in the expected order', () => {
  assert.deepStrictEqual(shSteps(CI_SH), [
    'bash scripts/build-wasm.sh',
    'npm ci',
    'npm run lint',
    'npm run audit:js',
    'cargo clippy --workspace --all-targets -- -D warnings',
    'bash scripts/validate-examples.sh',
    'npm test',
    'cargo audit',
    'cargo deny check',
    'cargo machete',
  ]);
});

test('mutation: dropping a step from a copy of ci.yml is caught', () => {
  const dropped = CI_YML.split('\n')
    .filter((l) => !l.includes('- run: bash scripts/validate-examples.sh'))
    .join('\n');
  assert.notStrictEqual(dropped, CI_YML);
  const problems = checkCi(dropped, CI_SH);
  assert.deepStrictEqual(problems, ['ci.yml missing step: bash scripts/validate-examples.sh']);
});

test('mutation: removing the check job timeout is caught', () => {
  const dropped = CI_YML.split('\n')
    .filter((l) => l.trim() !== 'timeout-minutes: 30')
    .join('\n');
  assert.notStrictEqual(dropped, CI_YML);
  assert.deepStrictEqual(checkCi(dropped, CI_SH), ['check job must set timeout-minutes: 30']);
});

test('mutation: removing the rust-audit timeout is caught', () => {
  const dropped = CI_YML.split('\n')
    .filter((l) => l.trim() !== 'timeout-minutes: 15')
    .join('\n');
  assert.notStrictEqual(dropped, CI_YML);
  assert.deepStrictEqual(checkCi(dropped, CI_SH), ['rust-audit job must set timeout-minutes: 15']);
});

test('mutation: removing npm caching or the concurrency block is caught', () => {
  const noCache = CI_YML.replace('          cache: npm\n', '');
  assert.notStrictEqual(noCache, CI_YML);
  assert.deepStrictEqual(checkCi(noCache, CI_SH), ['setup-node must cache: npm']);
  const noConcurrency = CI_YML.replace(/^concurrency:[\s\S]*?\n\n/m, '');
  assert.notStrictEqual(noConcurrency, CI_YML);
  assert.ok(checkCi(noConcurrency, CI_SH).includes('workflow must set concurrency'));
});

test('scripts run directly (not via bash/npm/cargo) are executable', () => {
  const direct = ['scripts/ci.sh', 'scripts/ci-local.sh'];
  for (const cmd of shSteps(CI_SH)) {
    const first = cmd.split(' ')[0];
    if (first.startsWith('scripts/')) direct.push(first);
  }
  for (const rel of direct) {
    assert.ok(fs.statSync(path.join(REPO, rel)).mode & 0o111, `${rel} not executable`);
  }
});

test('mutation: a matrix without Node 24 is caught', () => {
  const wrong = CI_YML.replace('node-version: [22, 24]', 'node-version: [22]');
  assert.notStrictEqual(wrong, CI_YML);
  assert.ok(checkCi(wrong, CI_SH).some((p) => p.includes('node-version')));
});
