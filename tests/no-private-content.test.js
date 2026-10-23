'use strict';
// Guard: tracked files carry no private-course markers.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SELF = path.relative(ROOT, __filename).split(path.sep).join('/');
const MARKERS = ['fr-numbers', 'soixante', 'quatre-vingt', 'Lingua Libre', 'youtube.com/watch'];
// Exempt (path -> markers) until the contract example is reworded.
const EXEMPT = { 'CONTRACT.md': ['quatre-vingt'] };

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 1 << 26 }).toString('utf8');
  return out.split('\0').filter(Boolean);
}

test('no tracked file other than this one contains a private-course marker', () => {
  const hits = [];
  for (const rel of trackedFiles()) {
    if (rel === SELF) continue;
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file).toString('latin1');
    for (const m of MARKERS) if (text.includes(m) && !(EXEMPT[rel] || []).includes(m)) hits.push(rel + ': ' + m);
  }
  assert.deepStrictEqual(hits, []);
});

test('the marker scan sees tracked files and skips itself', () => {
  const files = trackedFiles();
  assert.ok(files.length > 50);
  assert.ok(files.includes('CONTRACT.md'));
});
