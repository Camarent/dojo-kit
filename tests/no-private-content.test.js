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
// Public docs and prompts must stay host-neutral: no private level/course words, no host paths.
const PUBLIC_DOCS = ['AGENTS.md', 'CLAUDE.md', 'CONTRACT.md'];
const PUBLIC_DIRS = ['prompts/', '.claude/'];
const WORD_MARKERS = [/\bn[45]\b/i, /\bjlpt\b/i];
const HOST_PATH = /\/(root|opt)\//;
// Files whose host-path text is legitimate (hook pattern and its test), path -> reason.
const HOST_PATH_EXEMPT = ['.githooks/guard.sh', 'tests/hooks-test.sh'];
const GIT_ENV = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' };

function findMarkers(text) {
  const lower = String(text).toLowerCase();
  return MARKERS.filter((m) => lower.includes(m));
}

function findWordMarkers(text) {
  const s = String(text);
  return WORD_MARKERS.filter((re) => re.test(s)).map(String).concat(HOST_PATH.test(s) ? ['host path'] : []);
}

function findHostPath(text) {
  return HOST_PATH.test(String(text));
}

function isPublicDoc(rel) {
  return PUBLIC_DOCS.includes(rel) || PUBLIC_DIRS.some((d) => rel.startsWith(d));
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

test('public docs and prompts carry no level words or host paths', () => {
  const hits = [];
  for (const rel of trackedFiles()) {
    if (rel === SELF || !isPublicDoc(rel)) continue;
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file).toString('utf8');
    for (const m of findWordMarkers(text)) hits.push(rel + ': ' + m);
  }
  assert.deepStrictEqual(hits, []);
});

test('a planted n4, n5 or jlpt word is detected', () => {
  assert.ok(findWordMarkers('Level N5 vocab').length > 0);
  assert.ok(findWordMarkers('see n4 list').length > 0);
  assert.ok(findWordMarkers('the JLPT set').length > 0);
  assert.deepStrictEqual(findWordMarkers('n40 and jlptx and room'), []);
});

test('no tracked file contains a host path except the exempt hook files', () => {
  const hits = [];
  for (const rel of trackedFiles()) {
    if (rel === SELF || HOST_PATH_EXEMPT.includes(rel)) continue;
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    if (findHostPath(fs.readFileSync(file).toString('latin1'))) hits.push(rel);
  }
  assert.deepStrictEqual(hits, []);
});

test('a planted host path is detected, lookalikes are not', () => {
  const sep = '/';
  assert.ok(findHostPath(sep + 'opt' + sep + 'x'));
  assert.ok(findHostPath('cd ' + sep + 'root' + sep + 'work'));
  assert.ok(!findHostPath('rooted'));
  assert.ok(!findHostPath('option'));
});
