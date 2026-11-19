'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const parts = require('../storage/parts.js');
const body = require('../storage/body.js');
const { checkWasmFresh } = require('./loader.js');

const COURSE = 'demo';
const { CLOUD_DOC_BUDGET_BYTES, MAX_PARTS, byteSize } = parts;
let dojo;

test.before(async () => {
  checkWasmFresh();
  dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
});

/** Synthetic progress doc with n records; ids like exambunpou-103. */
function makeBody(n) {
  const items = {};
  for (let i = 0; i < n; i++) {
    const last = 1700000000000 + i;
    items[`exambunpou-${100 + i}`] = { bad: 0, due: last + 1000, last, ok: 1, s: 1 };
  }
  const d = dojo.call('emptyProgress', {});
  d.course = COURSE;
  d.items = items;
  d.t = 1700000000000 + n;
  return dojo.call('sanitize', d);
}

function merge(a, b) {
  return dojo.call('merge', { a, b });
}

/** Splits via buildDocs and reassembles; returns docs and the round-tripped doc. */
function roundTrip(doc) {
  const res = body.buildDocs(doc, null, CLOUD_DOC_BUDGET_BYTES, true);
  assert.ok(res.docs, `buildDocs failed: ${res.error}`);
  const main = res.docs[res.docs.length - 1];
  const partDocs = res.docs.slice(0, -1);
  return { res, back: parts.assemble(main, partDocs, merge) };
}

test('C1: budget is below the measured platform fail size', () => {
  assert.ok(CLOUD_DOC_BUDGET_BYTES < 139000);
  assert.strictEqual(MAX_PARTS, 64);
});

test('C2: small course stays one doc without parts key', () => {
  const doc = makeBody(10);
  const res = body.buildDocs(doc, null, CLOUD_DOC_BUDGET_BYTES, true);
  assert.strictEqual(res.docs.length, 1);
  assert.deepStrictEqual(res.docs[0], doc);
  assert.ok(!('parts' in res.docs[0]));
});

test('C2: near-budget course (100000-120000 bytes) stays one doc', () => {
  let doc = makeBody(1400);
  const bytes = byteSize(doc);
  assert.ok(bytes >= 100000 && bytes <= 120000, `body bytes ${bytes}`);
  const res = body.buildDocs(doc, null, CLOUD_DOC_BUDGET_BYTES, true);
  assert.strictEqual(res.docs.length, 1);
  assert.deepStrictEqual(res.docs[0], doc);
  assert.ok(!('parts' in res.docs[0]));
});

test('C3: 2271-record course splits into main + parts, each within budget, round trip equal', (t) => {
  const doc = makeBody(2271);
  const bytes = byteSize(doc);
  assert.ok(bytes >= 170000 && bytes <= 200000, `body bytes ${bytes}`);
  const { res, back } = roundTrip(doc);
  const largest = Math.max(...res.docs.map(byteSize));
  t.diagnostic(`body bytes ${bytes}, parts ${res.docs.length - 1}, largest doc bytes ${largest}`);
  assert.ok(res.docs.length - 1 >= 2, 'expected at least two parts');
  res.docs.forEach((d) => assert.ok(byteSize(d) <= CLOUD_DOC_BUDGET_BYTES));
  assert.strictEqual(res.docs[res.docs.length - 1].parts, res.docs.length - 1);
  assert.deepStrictEqual(back, doc);
});

test('C4: course several times the budget splits within MAX_PARTS and round trips', () => {
  const doc = makeBody(10000);
  const { res, back } = roundTrip(doc);
  assert.ok(res.docs.length - 1 <= MAX_PARTS);
  res.docs.forEach((d) => assert.ok(byteSize(d) <= CLOUD_DOC_BUDGET_BYTES));
  assert.deepStrictEqual(back, doc);
});

test('splitItems returns a fresh main and leaves the input body unchanged', () => {
  const doc = makeBody(2271);
  const before = JSON.stringify(doc);
  const split = parts.splitItems(doc, CLOUD_DOC_BUDGET_BYTES);
  assert.ok(split);
  assert.strictEqual(JSON.stringify(doc), before);
  assert.strictEqual(Object.keys(split.main.items).length, 0);
  assert.strictEqual(split.main.parts, split.parts.length);
  assert.notStrictEqual(split.main, doc);
});

test('C5: byteSize counts UTF-8 bytes', () => {
  // é is 2 UTF-8 bytes, e is 1: two é add 2 bytes over two e.
  assert.strictEqual(byteSize('éé'), byteSize('ee') + 2);
  // Single é: JSON quotes (2) + 2 UTF-8 bytes = 4; plain e: 2 + 1 = 3.
  assert.strictEqual(byteSize('é'), 4);
  assert.strictEqual(byteSize('e'), 3);
});

test('C5: partCount accepts only integers 1..MAX_PARTS', () => {
  assert.strictEqual(parts.partCount(undefined), 0);
  assert.strictEqual(parts.partCount({ parts: 0 }), 0);
  assert.strictEqual(parts.partCount({ parts: -1 }), 0);
  assert.strictEqual(parts.partCount({ parts: 1.5 }), 0);
  assert.strictEqual(parts.partCount({ parts: '2' }), 0);
  assert.strictEqual(parts.partCount({ parts: 65 }), 0);
  assert.strictEqual(parts.partCount({ parts: 3 }), 3);
});
