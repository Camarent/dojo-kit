'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { bundleScripts } = require('./load-bundle.js');

const ALLOW = [];

const NAMES = new Set(bundleScripts().flatMap((s) => [s, path.basename(s)]));
const ARRAY_REGEX = /((?:only|skip)\s*:\s*)?\[[^\[\]]*\]/g;
const LITERAL_REGEX = /(['"`])([^'"`\n]+\.js)\1/g;

// True when an array literal other than a loadBundle `only:`/`skip:` option lists two or more distinct bundle scripts.
function hasScriptList(text) {
  for (const m of text.matchAll(ARRAY_REGEX)) {
    if (m[1]) continue;
    const found = new Set();
    for (const l of m[0].matchAll(LITERAL_REGEX)) {
      if (NAMES.has(l[2])) found.add(path.basename(l[2]));
    }
    if (found.size >= 2) return true;
  }
  return false;
}

test('detector flags arrays of bundle scripts', () => {
  assert.ok(hasScriptList(`x(['session.js', 'ext.js'])`));
  assert.ok(hasScriptList(`x(["session.js","ext.js"])`));
  assert.ok(hasScriptList('x([`ext.js`, `speech.js`])'));
  assert.ok(hasScriptList(`x(['ext.js','speech.js'])`));
  assert.ok(hasScriptList(`const L = [\n  'vendor/preact.min.js',\n  'types/card.js',\n];`));
});

test('detector ignores other arrays', () => {
  assert.ok(!hasScriptList(`x(['session.js'])`));
  assert.ok(!hasScriptList(`loadBundle(sb, { only: ['ext.js', 'speech.js'] })`));
  assert.ok(!hasScriptList(`x(['a.js', 'b.js'])`));
  assert.ok(!hasScriptList(`x([1, 2, 'ext.js'], ['speech.js'])`));
  assert.ok(!hasScriptList(`const a = [1, 2, 3]; const s = 'session.js, ext.js';`));
});

test('no web test hard-codes the bundle script list', () => {
  const files = fs.readdirSync(__dirname).filter(
    (f) => f.endsWith('.js') && f !== 'load-bundle.js' && f !== 'no-hardcoded-bundle.test.js'
  );
  const violations = files.filter((file) =>
    !ALLOW.includes(file) && hasScriptList(fs.readFileSync(path.join(__dirname, file), 'utf8')));
  assert.deepStrictEqual(violations, [],
    `Hardcoded bundle script lists found in:\n${violations.map((v) => `  ${v}`).join('\n')}`);
});
