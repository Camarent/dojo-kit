// Checks rust-toolchain.toml, the single recorded Rust version. The file is parsed by Python's
// tomllib (stdlib, no dependency); the test reads the parsed [toolchain] table as JSON.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const TOML_FILE = path.join(REPO, 'rust-toolchain.toml');

const PARSE = [
  'import json, sys, tomllib',
  'with open(sys.argv[1], "rb") as f:',
  '    print(json.dumps(tomllib.load(f)))',
].join('\n');

function parseToolchain() {
  const run = spawnSync('python3', ['-I', '-c', PARSE, TOML_FILE], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, `rust-toolchain.toml does not parse as TOML: ${run.stderr}`);
  return JSON.parse(run.stdout).toolchain;
}

test('rust-toolchain.toml pins channel 1.100.0 with the minimal profile', () => {
  const tc = parseToolchain();
  assert.strictEqual(tc.channel, '1.100.0');
  assert.strictEqual(tc.profile, 'minimal');
});

test('rust-toolchain.toml lists clippy and llvm-tools-preview components', () => {
  const tc = parseToolchain();
  assert.deepStrictEqual([...tc.components].sort(), ['clippy', 'llvm-tools-preview']);
});

test('rust-toolchain.toml lists the wasm and musl targets', () => {
  const tc = parseToolchain();
  assert.deepStrictEqual([...tc.targets].sort(), ['wasm32-unknown-unknown', 'x86_64-unknown-linux-musl']);
});
