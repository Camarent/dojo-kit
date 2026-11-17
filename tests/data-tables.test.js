#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { test, afterEach } = require('node:test');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'data-tables.js');
const { progressTables, catalogRows, catalogTable, countsText } = require(SCRIPT);

const tmpDirs = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

// Synthetic course: two jsonl files, one blank line, one retired entry, one topic-less entry.
function courseFixture() {
  const dir = tmp('data-tables-course-');
  fs.mkdirSync(path.join(dir, 'content'));
  fs.writeFileSync(path.join(dir, 'content', 'a.jsonl'),
    '{"id":"n-2","type":"choice","topic":"  Alpha ","tags":["t1","t2"],"status":"retired"}\n' +
    '{"id":"n-1","type":"gap","meta":{"title":"Beta"},"tags":[]}\n');
  fs.writeFileSync(path.join(dir, 'content', 'b.jsonl'),
    '{"id":"n-3","type":"card","topic":"Gamma","tags":["t3"]}\n\n' +
    '{"id":"n-4","type":"choice","tags":["t1"]}\n');
  return dir;
}

function progressFixture(items, intros = {}) {
  const dir = tmp('data-tables-progress-');
  const file = path.join(dir, 'progress.json');
  fs.writeFileSync(file, JSON.stringify({ course: 'synthetic', items, intros }));
  return file;
}

const THREE_ITEMS = {
  'x-2': { ok: 1, bad: 0, due: '2026-01-02', last: '2026-01-01', s: 3 },
  'x-1': { ok: 2, bad: 1, due: '', last: '2026-01-01', s: 0 },
  'x-3': { ok: 0, bad: 2, due: '2026-01-05', last: '2026-01-04', s: 1 },
};

test('progress-items.tsv: header first, sorted by id, exact rows', () => {
  const p = progressTables({ items: THREE_ITEMS });
  assert.strictEqual(p.items,
    'id\tok\tbad\tdue\tlast\ts\n' +
    'x-1\t2\t1\t\t2026-01-01\t0\n' +
    'x-2\t1\t0\t2026-01-02\t2026-01-01\t3\n' +
    'x-3\t0\t2\t2026-01-05\t2026-01-04\t1\n');
  assert.strictEqual(p.itemCount, 3);
});

test('progress-items.tsv: unit extras become columns only when present', () => {
  const p = progressTables({ items: { 'u-1': { ok: 1, bad: 0, due: '', last: '', s: 0, qok: 4, qbad: 1, qlast: '2026-02-01', wk: 2 } } });
  assert.strictEqual(p.items.split('\n')[0], 'id\tok\tbad\tdue\tlast\ts\tqok\tqbad\tqlast\twk');
  assert.strictEqual(p.items.split('\n')[1], 'u-1\t1\t0\t\t\t0\t4\t1\t2026-02-01\t2');
});

test('progress-intros.tsv: id and value, sorted', () => {
  const p = progressTables({ items: {}, intros: { 'b-1': 'seen', 'a-1': { at: 5 } } });
  assert.strictEqual(p.intros, 'id\tvalue\na-1\t{"at":5}\nb-1\tseen\n');
  assert.strictEqual(p.introCount, 2);
});

test('catalog.tsv: 4 entries, one retired, exact rows', () => {
  const rows = catalogRows(courseFixture());
  assert.strictEqual(catalogTable(rows),
    'id\ttype\ttitle\ttags\tstatus\tsource\n' +
    'n-1\tgap\tBeta\t\tlive\ta.jsonl\n' +
    'n-2\tchoice\tAlpha\tt1,t2\tretired\ta.jsonl\n' +
    'n-3\tcard\tGamma\tt3\tlive\tb.jsonl\n' +
    'n-4\tchoice\t\tt1\tlive\tb.jsonl\n');
});

test('counts.txt: row counts per table, per type and per status', () => {
  const dir = courseFixture();
  const rows = catalogRows(dir);
  const p = progressTables({ items: THREE_ITEMS, intros: { 'a-1': 'x' } });
  assert.strictEqual(countsText(p, rows),
    'progress-items.tsv 3\n' +
    'progress-intros.tsv 1\n' +
    'catalog.tsv 4\n' +
    'type card 1\n' +
    'type choice 2\n' +
    'type gap 1\n' +
    'status live 3\n' +
    'status retired 1\n');
});

test('catalog: a non-object line stops the run with file:line', () => {
  const dir = tmp('data-tables-bad-');
  fs.mkdirSync(path.join(dir, 'content'));
  fs.writeFileSync(path.join(dir, 'content', 'c.jsonl'), '{"id":"n-1","type":"gap"}\n[1,2]\n');
  assert.throws(() => catalogRows(dir), /c\.jsonl:2: entry is not a JSON object/);
});

test('CLI: writes the four files into out-dir, prints counts, leaves no other files', () => {
  const course = courseFixture();
  const progress = progressFixture(THREE_ITEMS);
  const out = path.join(tmp('data-tables-out-'), 'nested');
  const stdout = execFileSync(process.execPath, [SCRIPT, progress, course, out], { encoding: 'utf8' });
  assert.match(stdout, /^progress-items\.tsv 3\n/);
  assert.deepStrictEqual(fs.readdirSync(out).sort(),
    ['catalog.tsv', 'counts.txt', 'progress-intros.tsv', 'progress-items.tsv']);
  assert.strictEqual(fs.readFileSync(path.join(out, 'counts.txt'), 'utf8'), stdout);
});

test('CLI: --help prints usage and grep one-liners', () => {
  const stdout = execFileSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.match(stdout, /^Usage: node scripts\/data-tables\.js/);
  assert.match(stdout, /grep -P '\\tretired\\t'/);
  assert.match(stdout, /grep -cP/);
  assert.doesNotMatch(stdout, /awk|cut /);
});
