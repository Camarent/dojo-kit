#!/usr/bin/env node
'use strict';

// Flat TSV tables from a progress export and a course folder, for grep/awk instead of ad-hoc JSON scripts.
// Usage: node scripts/data-tables.js <progress.json> <course-dir> <out-dir>
//        node scripts/data-tables.js --help
// Reads the inputs only; writes only under <out-dir> (created when missing). Output, sorted by id, header row first:
//   progress-items.tsv  id, ok, bad, due, last, s; plus qok, qbad, qlast, wk when any item carries them.
//   progress-intros.tsv id, value (object values as JSON).
//   catalog.tsv         id, type, title, tags, status, source. One row per non-blank line of <course-dir>/content/*.jsonl.
//   counts.txt          row count of every table, then counts per type and per status.
// Catalog rules (same as the validator, CONTRACT.md "content/<unit>.jsonl"):
//   title   = topic when a non-blank string, else meta.title, else empty.
//   tags    = the tags[] array joined with ','.
//   status  = "retired" when status is "retired", else "live".
//   source  = the jsonl file name. Every non-blank line must be a JSON object; a bad line stops the run with file:line.
// Tab and newline inside a value become a space, so every row keeps its column count.

const fs = require('fs');
const path = require('path');

const PROGRESS_COLUMNS = ['ok', 'bad', 'due', 'last', 's'];
const UNIT_EXTRA_COLUMNS = ['qok', 'qbad', 'qlast', 'wk'];
const CATALOG_COLUMNS = ['id', 'type', 'title', 'tags', 'status', 'source'];

const HELP = `Usage: node scripts/data-tables.js <progress.json> <course-dir> <out-dir>

Writes progress-items.tsv, progress-intros.tsv, catalog.tsv and counts.txt into <out-dir>.

Useful one-liners:
  grep -P '^[^\\t]*\\t[^\\t]*\\t[1-9]' OUT/progress-items.tsv   # items with bad answers
  grep -P '\\tretired\\t' OUT/catalog.tsv                       # retired catalog rows
  grep -cP '^[^\\t]*\\tTYPE\\t' OUT/catalog.tsv                 # catalog rows of type TYPE
`;

function clean(value) {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.replace(/[\t\r\n]/g, ' ');
}

function byId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function tsv(header, rows) {
  return [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n') + '\n';
}

// Progress export: { items: { id: {ok, bad, due, last, s, qok?, ...} }, intros: { id: value } }.
function progressTables(exp) {
  const items = Object.entries(exp.items || {}).map(([id, v]) => ({ id, ...v })).sort(byId);
  const extras = UNIT_EXTRA_COLUMNS.filter((c) => items.some((it) => it[c] !== undefined));
  const columns = [...PROGRESS_COLUMNS, ...extras];
  const itemRows = items.map((it) => [clean(it.id), ...columns.map((c) => clean(it[c]))]);
  const intros = Object.entries(exp.intros || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const introRows = intros.map(([id, value]) => [clean(id), clean(value)]);
  return {
    items: tsv(['id', ...columns], itemRows),
    intros: tsv(['id', 'value'], introRows),
    itemCount: itemRows.length,
    introCount: introRows.length,
  };
}

// Catalog rows from content/*.jsonl; throws with file:line on a bad line.
function catalogRows(courseDir) {
  const dir = path.join(courseDir, 'content');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  const rows = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.trim() === '') return;
      let it;
      try {
        it = JSON.parse(line);
      } catch (err) {
        throw new Error(`${file}:${i + 1}: bad JSON (${err.message})`, { cause: err });
      }
      if (it === null || typeof it !== 'object' || Array.isArray(it)) {
        throw new Error(`${file}:${i + 1}: entry is not a JSON object`);
      }
      const topic = typeof it.topic === 'string' ? it.topic.trim() : '';
      const metaTitle = it.meta && typeof it.meta.title === 'string' ? it.meta.title : '';
      rows.push({
        id: clean(it.id),
        type: clean(it.type),
        title: clean(topic || metaTitle),
        tags: clean(Array.isArray(it.tags) ? it.tags.join(',') : ''),
        status: it.status === 'retired' ? 'retired' : 'live',
        source: clean(file),
      });
    });
  }
  return rows.sort(byId);
}

function catalogTable(rows) {
  return tsv(CATALOG_COLUMNS, rows.map((r) => CATALOG_COLUMNS.map((c) => r[c])));
}

function countBy(rows, key) {
  const counts = new Map();
  for (const r of rows) counts.set(r[key], (counts.get(r[key]) || 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

function countsText(p, rows) {
  const lines = [
    `progress-items.tsv ${p.itemCount}`,
    `progress-intros.tsv ${p.introCount}`,
    `catalog.tsv ${rows.length}`,
  ];
  for (const [type, n] of countBy(rows, 'type')) lines.push(`type ${type} ${n}`);
  for (const [status, n] of countBy(rows, 'status')) lines.push(`status ${status} ${n}`);
  return lines.join('\n') + '\n';
}

function run(progressFile, courseDir, outDir) {
  const exp = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
  const p = progressTables(exp);
  const rows = catalogRows(courseDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'progress-items.tsv'), p.items);
  fs.writeFileSync(path.join(outDir, 'progress-intros.tsv'), p.intros);
  fs.writeFileSync(path.join(outDir, 'catalog.tsv'), catalogTable(rows));
  const counts = countsText(p, rows);
  fs.writeFileSync(path.join(outDir, 'counts.txt'), counts);
  return counts;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }
  if (argv.length !== 3) {
    process.stderr.write(HELP);
    return 2;
  }
  const counts = run(argv[0], argv[1], argv[2]);
  process.stdout.write(counts);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`data-tables: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { progressTables, catalogRows, catalogTable, countsText, run };
