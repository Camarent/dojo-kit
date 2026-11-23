'use strict';
// Guard: every key named in docs/PROGRESS.md appears in the code files the doc cites.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'PROGRESS.md');
const KEY_SECTIONS = ['## Top-level keys', '## Item record'];
const CODE_PREFIXES = ['web/storage/', 'web/migrate.js', 'crates/dojo-core/src/progress/'];

// Backticked keys listed as "- `key` ..." under the key sections.
function docKeys(text) {
  const keys = [];
  let inSection = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) inSection = KEY_SECTIONS.includes(line.trim());
    const m = inSection && line.match(/^- `([A-Za-z_][A-Za-z0-9_]*)`/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// Code files cited in backticks by the doc (paths under CODE_PREFIXES).
function citedFiles(text) {
  const files = new Set();
  for (const m of text.matchAll(/`([^`\s]+)`/g)) {
    if (CODE_PREFIXES.some((p) => m[1].startsWith(p))) files.add(m[1]);
  }
  return [...files];
}

// Variable names that hold a progress doc or item in the cited code (property access on these counts).
const DOC_OBJECTS = ['item', 'doc', 'd', 'main', 'acc', 'raw', 'body', 'out'];

// Keys absent from every cited code file. A key counts as present when quoted or read/written on a DOC_OBJECTS name.
function missingKeys(text, root) {
  const code = citedFiles(text).map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  return docKeys(text).filter((k) => {
    const quoted = code.includes(`"${k}"`) || code.includes(`'${k}'`);
    const onDoc = new RegExp(`\\b(${DOC_OBJECTS.join('|')})\\.${k}\\b`).test(code);
    return !quoted && !onDoc;
  });
}

test('PROGRESS.md lists top-level and item keys and cites code files', () => {
  const text = fs.readFileSync(DOC, 'utf8');
  assert.ok(docKeys(text).length >= 17, 'key sections list the expected keys');
  assert.ok(citedFiles(text).length >= 5, 'doc cites code files');
  assert.deepStrictEqual(missingKeys(text, ROOT), []);
});

test('a key the code does not contain is reported (mutation)', () => {
  const text = fs.readFileSync(DOC, 'utf8');
  const mutated = text.replace('- `v` ', '- `fakeKeyZz` — not in code.\n- `v` ');
  assert.deepStrictEqual(missingKeys(mutated, ROOT), ['fakeKeyZz']);
});
