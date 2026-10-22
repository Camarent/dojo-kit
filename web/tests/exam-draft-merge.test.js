'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');

const NOW = 1760000000000;
const MIN = 60000;

function items() {
  const out = [];
  for (let i = 1; i <= 3; i++) out.push({ id: 'q' + i, unit: 'u', type: 'gap', prompt: 'P' + i, answers: ['x'], tags: ['x'] });
  return out;
}

const SECTIONS = [{ title: 'A', count: 3, tags: ['x'] }];
const EXAM = { id: 'm1', passMark: 0.5, sections: SECTIONS, minutes: 30 };

let dojoP;
function loadDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

function content() {
  return { v: 1, version: 't', lock: items().map((i) => i.id), items: items(), course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], exams: [EXAM] } };
}

function mockLocal() {
  const data = {};
  return {
    getItem: (k) => data[k],
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
    clear: () => { Object.keys(data).forEach((k) => delete data[k]); }
  };
}

function solve(s) { return s.answer({ text: 'x' }); }

function device(dojo, clock, c) {
  const store = DojoStorage.createStore({ courseId: 'c', dojo, now: () => clock.t, localStorage: mockLocal(), claude: null });
  const engine = DojoSession.createEngine({ dojo, store, content: c || content(), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  return { store, engine, clock };
}

function sync(from, to) { return to.store.importText(from.store.exportText()); }

test('S2: closing another session on B keeps B open draft ahead of A tombstone (real store + wasm merge)', async () => {
  const dojo = await loadDojo();
  const ca = { t: NOW };
  const cb = { t: NOW };
  const A = device(dojo, ca);
  const B = device(dojo, cb);
  ca.t = NOW + 10;
  const sx = A.engine.start('exam', { examId: 'm1' }).id;
  ca.t = NOW + 20;
  A.engine.discardDraft(sx);
  assert.strictEqual(A.store.doc.examDraft.closed, 'abandoned');
  cb.t = NOW + 5;
  const sb = B.engine.start('exam', { examId: 'm1' }).id;
  cb.t = NOW + 30;
  B.engine.discardDraft(sx);
  assert.strictEqual(B.store.doc.examDraft.sid, sb);
  assert.strictEqual(B.store.doc.examDraft.updatedAt, NOW + 31);
  sync(A, B);
  assert.strictEqual(B.store.doc.examDraft.sid, sb);
  assert.strictEqual(B.store.doc.examDraft.closed, undefined);
  assert.ok(B.engine.examDraft());
  sync(B, A);
  assert.strictEqual(A.store.doc.examDraft.sid, sb);
  assert.strictEqual(A.store.doc.examDraft.closed, undefined);
});

test('finish on A while B has it open: B finish returns finished_elsewhere and writes no result', async () => {
  const dojo = await loadDojo();
  const ca = { t: NOW };
  const cb = { t: NOW };
  const A = device(dojo, ca);
  const B = device(dojo, cb);
  const sa = A.engine.start('exam', { examId: 'm1' });
  sync(A, B);
  const sb = B.engine.start('exam', { examId: 'm1', resume: B.engine.examDraft() });
  assert.strictEqual(sb.id, sa.id);
  for (let k = 0; k < 3; k++) { solve(sa); sa.next(); }
  ca.t = NOW + 1000;
  const sum = sa.finish();
  assert.strictEqual(sum.error, undefined);
  assert.strictEqual(Object.keys(A.store.doc.exams).length, 1);
  sync(A, B);
  assert.strictEqual(B.store.doc.examDraft.closed, 'finished');
  cb.t = NOW + 2000;
  assert.deepStrictEqual(sb.finish(), { error: 'finished_elsewhere' });
  assert.strictEqual(Object.keys(B.store.doc.exams).length, 1);
});

test('S3: close arriving between the start of finish and its store.update blocks the result write', async () => {
  const dojo = await loadDojo();
  const ca = { t: NOW };
  const cb = { t: NOW };
  const A = device(dojo, ca);
  const B = device(dojo, cb);
  const sa = A.engine.start('exam', { examId: 'm1' });
  sync(A, B);
  const sb = B.engine.start('exam', { examId: 'm1', resume: B.engine.examDraft() });
  for (let k = 0; k < 3; k++) { solve(sa); sa.next(); solve(sb); sb.next(); }
  ca.t = NOW + 1000;
  sa.finish();
  const real = B.store.update;
  let armed = true;
  B.store.update = function (fn) {
    if (armed) { armed = false; sync(A, B); }
    return real.call(B.store, fn);
  };
  cb.t = NOW + 2000;
  assert.deepStrictEqual(sb.finish(), { error: 'finished_elsewhere' });
  assert.strictEqual(Object.keys(B.store.doc.exams).length, 1);
});

test('S1: itemLadder asks core ladderForUnit with itemType; JS ladder duplicates are gone', async () => {
  const dojo = await loadDojo();
  const calls = [];
  const spy = { call: (n, a) => { if (n === 'ladderForUnit') calls.push(a); return dojo.call(n, a); } };
  const c = content();
  c.course.srsByType = { gap: { ladder: [0, 7200000] } };
  const clock = { t: NOW };
  const store = DojoStorage.createStore({ courseId: 'c', dojo, now: () => clock.t, localStorage: mockLocal(), claude: null });
  const engine = DojoSession.createEngine({ dojo: spy, store, content: c, now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  const s = engine.start('daily');
  s.answer({ text: 'x' });
  assert.ok(calls.length > 0 && calls.every((a) => a.itemType === 'gap' && a.unitId === 'u'));
  assert.strictEqual(store.doc.items[s.current().item.id].due, NOW + 7200000);
  const src = fs.readFileSync(path.join(__dirname, '..', 'session.js'), 'utf8');
  assert.ok(!/function ladderFor\b|unitHasLadder/.test(src));
});

test('M1: hostile non-object newBy:* / newByDay / extraNewByDay values are replaced, not thrown on', async () => {
  const dojo = await loadDojo();
  const clock = { t: NOW };
  const D = device(dojo, clock);
  D.store.update((d) => {
    d.stats.newByDay = 7;
    d.stats['newBy:u'] = 'oops';
    d.stats.extraNewByDay = [1];
  });
  D.store.doc.stats.newByDay = 7;
  D.store.doc.stats['newBy:u'] = 'oops';
  D.store.doc.stats.extraNewByDay = 'x';
  D.engine.moreNew(2);
  assert.strictEqual(D.store.doc.stats.extraNewByDay['2025-10-09'], 2);
  const s = D.engine.start('daily');
  s.answer({ text: 'x' });
  assert.strictEqual(D.store.doc.stats.newByDay['2025-10-09'], 1);
  assert.strictEqual(D.store.doc.stats['newBy:u']['2025-10-09'], 1);
});

test('L1: resume caps remainingMs at the group minutes (single and grouped)', async () => {
  const dojo = await loadDojo();
  const clock = { t: NOW };
  const D = device(dojo, clock);
  D.engine.start('exam', { examId: 'm1' });
  D.store.doc.examDraft.remainingMs = [10 * 30 * MIN];
  const dr = D.engine.examDraft();
  assert.ok(dr);
  assert.strictEqual(dr.remainingMs[0], 30 * MIN);
});

function fakeCloud() {
  const remote = { data: null };
  remote.claude = {
    use: async (name) => (name === 'db'
      ? { doc: () => ({
        get: async () => ({ exists: remote.data !== null, data: () => remote.data }),
        set: async (b) => { remote.data = JSON.parse(JSON.stringify(b)); },
        onSnapshot: () => () => {}
      }) }
      : { id: async () => 'u1' })
  };
  return remote;
}

function cloudDevice(dojo, clock, cloud, max) {
  const store = DojoStorage.createStore({ courseId: 'c', dojo, now: () => clock.t, localStorage: mockLocal(), claude: cloud ? cloud.claude : null, maxDocBytes: max, setTimeoutFn: () => 0, clearTimeoutFn: () => {} });
  const engine = DojoSession.createEngine({ dojo, store, content: content(), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  return { store, engine };
}

function playXThenOpenY(A, B, ca, cb) {
  const sa = A.engine.start('exam', { examId: 'm1' });
  sync(A, B);
  const sb = B.engine.start('exam', { examId: 'm1', resume: B.engine.examDraft() });
  for (let k = 0; k < 3; k++) { solve(sa); sa.next(); solve(sb); sb.next(); }
  ca.t = NOW + 1000;
  assert.strictEqual(sa.finish().error, undefined);
  ca.t = NOW + 2000;
  A.engine.start('exam', { examId: 'm1' });
  return { sa, sb };
}

test('oversize fallback keeps closedSids as a payload-free tombstone so B cannot record a second result', async () => {
  const dojo = await loadDojo();
  const pa = { t: NOW };
  const probe = cloudDevice(dojo, pa, null);
  playXThenOpenY(probe, device(dojo, { t: NOW }), pa, { t: NOW });
  const limit = JSON.stringify(probe.store.doc).length - 20;
  const cloud = fakeCloud();
  const ca = { t: NOW };
  const cb = { t: NOW };
  const A = cloudDevice(dojo, ca, cloud, limit);
  const B = device(dojo, cb);
  await A.store.load();
  const { sa, sb } = playXThenOpenY(A, B, ca, cb);
  await A.store.flush();
  const w = cloud.data;
  assert.ok(w.examDraft, 'closure survives in remote');
  assert.deepStrictEqual(w.examDraft.closedSids.map((c) => c.sid), [sa.id]);
  assert.ok(w.examDraft.closed);
  assert.strictEqual(w.examDraft.answers, undefined);
  assert.strictEqual(w.examDraft.ids, undefined);
  assert.ok(A.store.doc.examDraft && !A.store.doc.examDraft.closed, 'local open Y untouched');
  B.store.importText(JSON.stringify(w));
  cb.t = NOW + 3000;
  assert.deepStrictEqual(sb.finish(), { error: 'finished_elsewhere' });
  assert.strictEqual(Object.keys(B.store.doc.exams).length, 1);
});

test('oversize fallback without closedSids deletes the open draft from the remote body', async () => {
  const dojo = await loadDojo();
  const remote = { data: null };
  const claude = {
    use: async (name) => (name === 'db'
      ? { doc: () => ({
        get: async () => ({ exists: remote.data !== null, data: () => remote.data }),
        set: async (b) => { remote.data = JSON.parse(JSON.stringify(b)); },
        onSnapshot: () => () => {}
      }) }
      : { id: async () => 'u1' })
  };
  const clock = { t: NOW };
  const probe = device(dojo, clock);
  probe.engine.start('exam', { examId: 'm1' });
  const withDraft = JSON.stringify(probe.store.doc).length;
  const store = DojoStorage.createStore({ courseId: 'c', dojo, now: () => clock.t, localStorage: mockLocal(), claude, maxDocBytes: withDraft - 50, setTimeoutFn: () => 0, clearTimeoutFn: () => {} });
  const engine = DojoSession.createEngine({ dojo, store, content: content(), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  await store.load();
  engine.start('exam', { examId: 'm1' });
  await store.flush();
  assert.ok(store.doc.examDraft && !store.doc.examDraft.closed);
  assert.ok(remote.data === null || remote.data.examDraft === undefined);
});
