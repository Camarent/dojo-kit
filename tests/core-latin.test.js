'use strict';
// Guard: core code, tests, schema, examples and scripts carry no Han, kana or Cyrillic text.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SELF = path.relative(ROOT, __filename).split(path.sep).join('/');
const GIT_ENV = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' };
// Scanned roots: a tracked file is in scope when its path starts with one of these prefixes.
const SCOPE_PREFIXES = ['crates/', 'web/', 'tests/', 'schema/', 'examples/', 'scripts/'];
// Modules are optional and may be non-Latin; they are never scanned.
const EXCLUDE_PREFIXES = ['modules/'];
// Inside web/ only the i18n string tables and vendored code are exempt.
const WEB_EXEMPT = (rel) => (rel.startsWith('web/i18n/') && rel.endsWith('.json')) || rel.startsWith('web/vendor/');
// Han (CJK ideographs), hiragana/katakana, Cyrillic, written as code points so this file stays clean.
const NON_LATIN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u0400-\u04ff]/u;

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, env: GIT_ENV, maxBuffer: 1 << 26 }).toString('utf8');
  return out.split('\0').filter(Boolean);
}

function inScope(rel) {
  if (rel === SELF) return false;
  if (EXCLUDE_PREFIXES.some((p) => rel.startsWith(p))) return false;
  if (!SCOPE_PREFIXES.some((p) => rel.startsWith(p))) return false;
  if (rel.startsWith('web/') && WEB_EXEMPT(rel)) return false;
  return true;
}

// Returns "file:line" strings for every line holding a non-Latin character.
function findOffenders(files) {
  const hits = [];
  for (const rel of files) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const raw = fs.readFileSync(file);
    if (raw.includes(0)) continue; // binary (audio, images): not source text
    const lines = raw.toString('utf8').split('\n');
    lines.forEach((line, i) => {
      if (NON_LATIN.test(line)) hits.push(rel + ':' + (i + 1));
    });
  }
  return hits;
}

test('core code, tests, schema, examples and scripts contain no Han, kana or Cyrillic', () => {
  const files = trackedFiles().filter(inScope);
  assert.ok(files.length > 20, 'scan saw too few files: ' + files.length);
  assert.deepStrictEqual(findOffenders(files), []);
});

test('the scan covers crates, web, tests and examples', () => {
  const files = trackedFiles();
  assert.ok(files.some((f) => inScope(f) && f.startsWith('crates/')));
  assert.ok(files.some((f) => inScope(f) && f.startsWith('web/')));
  assert.ok(files.some((f) => inScope(f) && f.startsWith('tests/')));
  assert.ok(files.some((f) => inScope(f) && f.startsWith('examples/')));
});

test('modules, web i18n tables and vendor code are out of scope', () => {
  assert.strictEqual(inScope('modules/latin/x.js'), false);
  assert.strictEqual(inScope('web/i18n/ru.json'), false);
  assert.strictEqual(inScope('web/vendor/lib.js'), false);
  assert.strictEqual(inScope('web/app.js'), true);
});

test('a planted Han, kana or Cyrillic character is detected, Latin text is not', () => {
  const planted = ['\u6f22', '\u3042', '\u30ab', '\u0416'];
  for (const ch of planted) assert.ok(NON_LATIN.test('let x = "a' + ch + '";'), 'missed ' + ch.codePointAt(0).toString(16));
  assert.ok(!NON_LATIN.test('plain ASCII and Latin-1 café éü'));
});
