'use strict';
// Guard: tracked test code must not read private course paths or the real-export helper.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SELF = path.relative(ROOT, __filename).split(path.sep).join('/');
// Tracked roots and extensions scanned by the live test.
const SCAN_DIRS = ['web/tests', 'tools', 'crates/*/tests'];
const SCAN_EXT = /\.(js|mjs|rs)$/;
// Only crates/<name>/tests/... counts as a crate test tree (git pathspec '*' also matches '/').
const CRATE_TESTS = /^crates\/[^/]+\/tests\//;
// Anchor: the literal 'workspace/' followed by a course-like name, or the real-export helper.
const PATTERNS = [/workspace\/[A-Za-z0-9_-]+/, /\bfindRealExports\b/];
// Files allowed to name these: the helper and its own test.
const ALLOW = ['tools/real-exports.js', 'tests/real-exports.test.js'];
const GIT_ENV = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' };

// files: [{file, text}]; allow: [file]. Returns [{file, line, text}] for every offending line.
function scanFiles(files, allow) {
  const hits = [];
  for (const { file, text } of files) {
    if (allow.includes(file)) continue;
    String(text).split('\n').forEach((line, i) => {
      if (PATTERNS.some((re) => re.test(line))) hits.push({ file, line: i + 1, text: line.trim() });
    });
  }
  return hits;
}

module.exports = { scanFiles };

function trackedScanFiles() {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...SCAN_DIRS], { cwd: ROOT, env: GIT_ENV, maxBuffer: 1 << 26 }).toString('utf8');
  return out.split('\0').filter((rel) => rel && rel !== SELF && SCAN_EXT.test(rel) && (!rel.startsWith('crates/') || CRATE_TESTS.test(rel)));
}

function readTracked(rels) {
  return rels
    .map((rel) => ({ file: rel, abs: path.join(ROOT, rel) }))
    .filter(({ abs }) => fs.existsSync(abs) && fs.statSync(abs).isFile())
    .map(({ file, abs }) => ({ file, text: fs.readFileSync(abs).toString('utf8') }));
}

function formatHits(hits) {
  return hits.map((h) => `${h.file}:${h.line}: ${h.text}`);
}

test('tracked test code reads no private course path and no real-export helper outside the allow-list', () => {
  const hits = scanFiles(readTracked(trackedScanFiles()), ALLOW);
  assert.deepStrictEqual(formatHits(hits), [], 'private read in tracked test code (file:line)');
});

test('decoy: a synthetic private read is reported in a non-allowed file and ignored in an allowed one', () => {
  // Built from parts so this file holds no literal private path for the commit guard.
  const decoy = "fs.readFileSync('" + ['workspace', 'n5', 'x'].join('/') + "')";
  const reported = scanFiles([{ file: 'tests/decoy.test.js', text: decoy }], ALLOW);
  assert.deepStrictEqual(reported, [{ file: 'tests/decoy.test.js', line: 1, text: decoy }]);
  const allowed = scanFiles([{ file: 'tools/real-exports.js', text: decoy }], ['tools/real-exports.js']);
  assert.deepStrictEqual(allowed, []);
});

test('the helper name is reported with its line number', () => {
  const text = 'const ok = 1;\nconst r = findRealExports("n5");';
  assert.deepStrictEqual(scanFiles([{ file: 'tests/other.test.js', text }], ALLOW), [
    { file: 'tests/other.test.js', line: 2, text: 'const r = findRealExports("n5");' },
  ]);
});
