#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { test, afterEach } = require('node:test');

const ROOT = path.join(__dirname, '..');

const tmpDirs = [];

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
});

// Returns the versions of package.json, Cargo.toml [workspace.package] and the top CHANGELOG release.
function readVersions(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const cargo = fs.readFileSync(path.join(root, 'Cargo.toml'), 'utf8');
  const section = cargo.match(/^\[workspace\.package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m);
  const cargoVersion = section && section[1].match(/^version\s*=\s*"([^"]+)"/m);
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const release = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  return {
    package: pkg.version,
    cargo: cargoVersion ? cargoVersion[1] : undefined,
    changelog: release ? release[1] : undefined,
  };
}

function mkFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-parity-test-'));
  tmpDirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

function fixtureFiles(overrides = {}) {
  return Object.assign(
    {
      'package.json': JSON.stringify({ name: 'fixture', version: '0.1.0' }),
      'Cargo.toml': '[workspace]\nmembers = []\n\n[workspace.package]\nedition = "2024"\nversion = "0.1.0"\n',
      'CHANGELOG.md': '# Changelog\n\n## [0.1.0] - 2026-11-02\n',
    },
    overrides,
  );
}

// Throws when the three versions disagree.
function checkParity(v) {
  assert.ok(v.package, 'package.json has a version');
  assert.strictEqual(v.cargo, v.package, 'Cargo.toml [workspace.package] version matches package.json');
  assert.strictEqual(v.changelog, v.package, 'CHANGELOG top ## [x.y.z] matches package.json');
}

test('package.json, Cargo.toml [workspace.package] and CHANGELOG top release agree', () => {
  checkParity(readVersions(ROOT));
});

test('CHANGELOG has a Keep a Changelog 0.1.0 release heading', () => {
  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /^## \[0\.1\.0\]/m);
});

test('fixture with matching versions passes', () => {
  checkParity(readVersions(mkFixture(fixtureFiles())));
});

test('mutation: Cargo.toml workspace version drift is detected', () => {
  const dir = mkFixture(
    fixtureFiles({
      'Cargo.toml': '[workspace]\nmembers = []\n\n[workspace.package]\nversion = "0.1.1"\n',
    }),
  );
  assert.throws(() => checkParity(readVersions(dir)), /Cargo\.toml/);
});

test('mutation: CHANGELOG top release drift is detected', () => {
  const dir = mkFixture(
    fixtureFiles({ 'CHANGELOG.md': '# Changelog\n\n## [0.2.0] - 2026-12-01\n\n## [0.1.0] - 2026-11-02\n' }),
  );
  assert.throws(() => checkParity(readVersions(dir)), /CHANGELOG/);
});

test('mutation: a version outside [workspace.package] is not read as the workspace version', () => {
  const dir = mkFixture(
    fixtureFiles({
      'Cargo.toml': '[workspace]\nmembers = []\n\n[workspace.package]\nedition = "2024"\n\n[dependencies]\nversion = "9.9.9"\n',
    }),
  );
  const v = readVersions(dir);
  assert.strictEqual(v.cargo, undefined);
});
