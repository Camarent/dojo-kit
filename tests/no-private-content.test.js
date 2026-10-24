'use strict';
// Guard: tracked files carry no private-course markers.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SELF = path.relative(ROOT, __filename).split(path.sep).join('/');
// Markers are lowercase; file text is lowercased before matching.
const MARKERS = ['fr-numbers', 'soixante', 'quatre-vingt', 'sept', 'cents', 'lingua libre', 'youtube.com/watch', 'youtu.be', 'wikimedia', 'frnum', 'whisper', 'yt-dlp'];
// Exempt (path -> markers) until the contract example is reworded.
const EXEMPT = {};
const GIT_ENV = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' };

function findMarkers(text) {
  const lower = String(text).toLowerCase();
  return MARKERS.filter((m) => lower.includes(m));
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, env: GIT_ENV, maxBuffer: 1 << 26 }).toString('utf8');
  return out.split('\0').filter(Boolean);
}

test('no tracked file other than this one contains a private-course marker', () => {
  const hits = [];
  for (const rel of trackedFiles()) {
    if (rel === SELF) continue;
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file).toString('latin1');
    for (const m of findMarkers(text)) if (!(EXEMPT[rel] || []).includes(m)) hits.push(rel + ': ' + m);
  }
  assert.deepStrictEqual(hits, []);
});

test('the marker scan sees tracked files and skips itself', () => {
  const files = trackedFiles();
  assert.ok(files.length > 50);
  assert.ok(files.includes('CONTRACT.md'));
});

test('a capitalised "Soixante" marker is detected', () => {
  assert.deepStrictEqual(findMarkers('Soixante-dix'), ['soixante']);
});
