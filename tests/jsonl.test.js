#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { test, afterEach } = require('node:test');

const { readJson, readJsonl, writeJsonl } = require('../tools/jsonl.js');

const tmpDirs = [];

function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
});

test('exports exactly readJson, readJsonl and writeJsonl', () => {
  assert.deepStrictEqual(Object.keys(require('../tools/jsonl.js')).sort(), ['readJson', 'readJsonl', 'writeJsonl']);
});

test('readJson parses an existing file', () => {
  const file = path.join(mkTmp(), 'a.json');
  fs.writeFileSync(file, '{"x":1}');
  assert.deepStrictEqual(readJson(file), { x: 1 });
});

test('readJson returns the default for a missing file when a default is passed', () => {
  const file = path.join(mkTmp(), 'missing.json');
  assert.deepStrictEqual(readJson(file, { clips: {} }), { clips: {} });
  assert.strictEqual(readJson(file, null), null);
});

test('readJson throws the fs error for a missing file when no default is passed', () => {
  const file = path.join(mkTmp(), 'missing.json');
  assert.throws(() => readJson(file), { code: 'ENOENT' });
});

test('readJsonl parses rows and skips blank lines', () => {
  const file = path.join(mkTmp(), 'rows.jsonl');
  fs.writeFileSync(file, '{"a":1}\n\n   \n{"a":2}\n');
  assert.deepStrictEqual(readJsonl(file), [{ a: 1 }, { a: 2 }]);
});

test('readJsonl returns [] for a missing file', () => {
  const file = path.join(mkTmp(), 'missing.jsonl');
  assert.deepStrictEqual(readJsonl(file), []);
});

test('readJsonl error names the file and the 1-based line number of a bad line', () => {
  const file = path.join(mkTmp(), 'bad.jsonl');
  fs.writeFileSync(file, '{"a":1}\n\n{oops\n');
  assert.throws(
    () => readJsonl(file),
    (err) => err.message.includes(file) && err.message.includes(':3:')
  );
});

test('writeJsonl then readJsonl round-trips unicode and nested rows', () => {
  const file = path.join(mkTmp(), 'rt.jsonl');
  const rows = [{ word: '日本語', tags: ['n5', 'ü'] }, { a: { b: [1, 2, { c: 'x' }] } }];
  writeJsonl(file, rows);
  assert.deepStrictEqual(readJsonl(file), rows);
});

test('writeJsonl ends the file with exactly one newline', () => {
  const file = path.join(mkTmp(), 'nl.jsonl');
  writeJsonl(file, [{ a: 1 }, { a: 2 }]);
  const text = fs.readFileSync(file, 'utf8');
  assert.strictEqual(text, '{"a":1}\n{"a":2}\n');
  assert.ok(!text.endsWith('\n\n'));
});

test('writeJsonl with an empty array writes an empty file', () => {
  const file = path.join(mkTmp(), 'empty.jsonl');
  writeJsonl(file, []);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '');
});
