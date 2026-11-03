#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { test, afterEach } = require('node:test');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'bump-version.sh');
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@t'];

const tmpDirs = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

// A repo shaped like dojo-kit: npm manifest and lock, a Cargo workspace with path crates and
// one registry crate that happens to carry the same number, and a changelog.
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-'));
  tmpDirs.push(dir);
  const w = (name, text) => fs.writeFileSync(path.join(dir, name), text);
  w('package.json', '{\n  "name": "x",\n  "version": "0.1.5",\n  "dependencies": { "y": "0.1.5" }\n}\n');
  w('package-lock.json', '{\n  "version": "0.1.5",\n  "packages": {\n    "": { "version": "0.1.5" },\n    "node_modules/y": { "version": "0.1.5" }\n  }\n}\n');
  w('Cargo.toml', '[workspace]\nmembers = ["a"]\n\n[workspace.package]\nedition = "2024"\nversion = "0.1.5"\n\n[workspace.dependencies]\nz = { version = "0.1.5" }\n');
  w('Cargo.lock', '[[package]]\nname = "a"\nversion = "0.1.5"\ndependencies = [\n "z",\n]\n\n[[package]]\nname = "z"\nversion = "0.1.5"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n');
  w('CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n## [0.1.5] - 2026-11-03\n\n- old\n');
  return dir;
}

const run = (dir, ...args) => execFileSync('bash', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' }).trim();
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');

test('current reads package.json from the working tree and from a git ref', () => {
  const dir = fixture();
  assert.strictEqual(run(dir, 'current'), '0.1.5');
  execFileSync('git', [...GIT, 'init', '-q', '-b', 'master'], { cwd: dir });
  execFileSync('git', [...GIT, 'add', '-A'], { cwd: dir });
  execFileSync('git', [...GIT, 'commit', '-qm', 'base'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'package.json'), '{ "version": "9.9.9" }\n');
  assert.strictEqual(run(dir, 'current', 'HEAD'), '0.1.5');
  assert.strictEqual(run(dir, 'current'), '9.9.9');
});

test('set moves every version file and lists them', () => {
  const dir = fixture();
  const files = run(dir, 'set', '0.1.5', '0.1.6', 'docs: entry').split('\n');
  assert.deepStrictEqual(files, ['package.json', 'package-lock.json', 'Cargo.toml', 'Cargo.lock', 'CHANGELOG.md']);
  assert.match(read(dir, 'package.json'), /"version": "0\.1\.6"/);
  assert.match(read(dir, 'package.json'), /"y": "0\.1\.5"/);
  assert.strictEqual(read(dir, 'package-lock.json').split('0.1.6').length - 1, 2);
  assert.match(read(dir, 'Cargo.toml'), /\nversion = "0\.1\.6"/);
  assert.match(read(dir, 'Cargo.toml'), /z = \{ version = "0\.1\.5" \}/);
  assert.match(read(dir, 'Cargo.lock'), /name = "a"\nversion = "0\.1\.6"/);
  assert.match(read(dir, 'Cargo.lock'), /name = "z"\nversion = "0\.1\.5"\nsource/);
  const log = read(dir, 'CHANGELOG.md');
  assert.ok(log.indexOf('[Unreleased]') < log.indexOf('[0.1.6]') && log.indexOf('[0.1.6]') < log.indexOf('[0.1.5]'));
  assert.match(log, /## \[0\.1\.6\] - \d{4}-\d{2}-\d{2}\n\n- docs: entry\n/);
});

test('a second set with the same numbers changes nothing', () => {
  const dir = fixture();
  run(dir, 'set', '0.1.5', '0.1.6', 'docs: entry');
  assert.strictEqual(run(dir, 'set', '0.1.5', '0.1.6', 'docs: entry'), '');
});

test('set fails and names a required file that is missing or does not hold the new version', () => {
  const missing = fixture();
  fs.rmSync(path.join(missing, 'Cargo.lock'));
  assert.throws(() => execFileSync('bash', [SCRIPT, 'set', '0.1.5', '0.1.6', 'x'], { cwd: missing, stdio: 'pipe' }), (e) => /Cargo\.lock \(missing\)/.test(String(e.stderr)));

  const unmatched = fixture();
  fs.writeFileSync(path.join(unmatched, 'Cargo.toml'), '[package]\nname = "a"\nversion = "0.1.5"\n');
  assert.throws(() => execFileSync('bash', [SCRIPT, 'set', '0.1.5', '0.1.6', 'x'], { cwd: unmatched, stdio: 'pipe' }), (e) => /not at 0\.1\.6: Cargo\.toml/.test(String(e.stderr)));
});
