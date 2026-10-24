'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'tools', 'check-progress.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-progress-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

let seq = 0;
function write(obj) {
  const file = path.join(dir, `f${seq++}.json`);
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

function content(items, extra = {}) {
  const ids = items.map((it) => it.id).sort();
  const types = Object.fromEntries(items.map((it) => [it.id, it.type]));
  return { v: 1, course: { id: 'demo-course' }, items, lock: { v: 1, ids, retired: [], types }, ...extra };
}

const L1 = [
  { id: 'n-1', type: 'numeric', answer: 1 },
  { id: 'n-5', type: 'numeric', answer: 5 },
];
const FORMS = [{ id: 'f-1', type: 'gap', answers: ['un'] }];

function run(args) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: res.status, out: res.stdout + res.stderr };
}

test('L1-only old and L1+forms new pass', () => {
  const oldFile = write(content(L1));
  const newFile = write(content([...L1, ...FORMS]));
  assert.strictEqual(run(['--content', newFile, '--old-content', oldFile]).code, 0);
});

test('removed id fails', () => {
  const oldFile = write(content(L1));
  const newFile = write(content([L1[0]]));
  assert.strictEqual(run(['--content', newFile, '--old-content', oldFile]).code, 1);
});

test('type change numeric to gap fails', () => {
  const oldFile = write(content(L1));
  const changed = [L1[0], { id: 'n-5', type: 'gap', answers: ['5'] }];
  const newFile = write(content(changed));
  const r = run(['--content', newFile, '--old-content', oldFile]);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /type changed: n-5/);
});

test('old lock without types: type change still caught via old items', () => {
  const oldDoc = content(L1);
  delete oldDoc.lock.types;
  const oldFile = write(oldDoc);
  const same = write(content([...L1, ...FORMS]));
  assert.strictEqual(run(['--content', same, '--old-content', oldFile]).code, 0);
  const changed = write(content([L1[0], { id: 'n-5', type: 'gap', answers: ['5'] }]));
  assert.strictEqual(run(['--content', changed, '--old-content', oldFile]).code, 1);
});

test('answer change fails', () => {
  const oldFile = write(content(L1));
  const changed = [L1[0], { id: 'n-5', type: 'numeric', answer: 6 }];
  const newFile = write(content(changed));
  assert.strictEqual(run(['--content', newFile, '--old-content', oldFile]).code, 1);
});

test('export with unknown id fails', () => {
  const newFile = write(content(L1));
  const exp = write({ v: 1, course: 'demo-course', items: { 'n-1': {}, 'n-99': {} } });
  const r = run(['--content', newFile, '--export', exp]);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /unknown id in export: n-99/);
});

test('export from foreign course fails', () => {
  const newFile = write(content(L1));
  const exp = write({ v: 1, course: 'other-course', items: { 'n-1': {} } });
  assert.strictEqual(run(['--content', newFile, '--export', exp]).code, 1);
});

test('internal check: lock ids must match items', () => {
  const bad = content(L1);
  bad.lock.ids = ['n-1'];
  const newFile = write(bad);
  assert.strictEqual(run(['--content', newFile]).code, 1);
});

test('dropped locked id (lock keeps it, items lack it) fails', () => {
  const dropped = content(L1);
  dropped.items = dropped.items.filter((it) => it.id !== 'n-5');
  const newFile = write(dropped);
  const r = run(['--content', newFile]);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /lock id without item: n-5/);
});

test('missing --content is a usage error', () => {
  assert.strictEqual(run([]).code, 1);
});
