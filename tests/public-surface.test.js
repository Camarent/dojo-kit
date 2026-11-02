#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');

const PRIVATE_BASENAMES = ['AUDIT.md', 'TEAM.md', 'PLAN.md', 'PROGRESS.md'];
const PRIVATE_PREFIXES = ['.work/', '.notes/'];

function trackedFiles(root) {
  const r = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ls-files failed: ${r.stderr}`);
  return r.stdout.split('\n').filter(Boolean);
}

// Throws when the README does not state Node.js 22 or newer, or still states 18 or newer.
function assertReadmeNode(text) {
  assert.match(text, /Node\.js 22 or newer/, 'README states Node.js 22 or newer');
  assert.doesNotMatch(text, /18 or newer/, 'README does not state 18 or newer');
}

// Returns the Node major stated by the README, or undefined.
function readmeNodeMajor(text) {
  const m = text.match(/Node\.js (\d+) or newer/);
  return m ? Number(m[1]) : undefined;
}

// Returns the major of an engines.node range such as ">=22", or undefined.
function enginesNodeMajor(range) {
  const m = typeof range === 'string' && range.match(/\d+/);
  return m ? Number(m[0]) : undefined;
}

// Returns the lines of .gitignore, trailing whitespace removed.
function gitignoreLines(text) {
  return text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
}

test('no tracked file is a private doc or lives under .work/ or .notes/', () => {
  const files = trackedFiles(ROOT);
  const bad = files.filter(
    (f) =>
      PRIVATE_BASENAMES.includes(path.posix.basename(f)) ||
      PRIVATE_PREFIXES.some((p) => f.startsWith(p)),
  );
  assert.deepStrictEqual(bad, []);
});

test('package.json has repository, homepage, bugs, author, >=5 keywords and engines.node >=22', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const key of ['repository', 'homepage', 'bugs', 'author']) {
    assert.ok(pkg[key], `package.json has ${key}`);
  }
  assert.ok(Array.isArray(pkg.keywords) && pkg.keywords.length >= 5, 'keywords has at least 5 entries');
  assert.ok(
    typeof pkg.engines?.node === 'string' && pkg.engines.node.startsWith('>=22'),
    'engines.node starts with >=22',
  );
});

test('README states Node.js 22 or newer and not 18 or newer', () => {
  assertReadmeNode(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'));
});

test('README Node major equals the engines.node major', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.strictEqual(readmeNodeMajor(readme), enginesNodeMajor(pkg.engines?.node));
});

test('.gitignore has no line equal to .work/ or TEAM.md', () => {
  const lines = gitignoreLines(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'));
  assert.ok(!lines.includes('.work/'), '.gitignore has no .work/ line');
  assert.ok(!lines.includes('TEAM.md'), '.gitignore has no TEAM.md line');
});

test('mutation: README text with 18 or newer fails the Node check', () => {
  const fixture = '# Demo\n\nNeeds Node.js 22 or newer. Older: Node.js 18 or newer works too.\n';
  assert.throws(() => assertReadmeNode(fixture), /18 or newer/);
  assert.throws(() => assertReadmeNode('# Demo\n\nNo version stated.\n'), /22 or newer/);
});
