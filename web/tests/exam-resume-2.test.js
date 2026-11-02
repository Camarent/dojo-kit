'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const DojoStorage = require('../storage.js');
const { checkWasmFresh } = require('./loader.js');
require('./load-bundle.js');

path.join(__dirname, '..', '..');
const NOW = 1760000000000;
const MIN = 60000;
const DAY = 24 * 60 * MIN;

function items() {
  const out = [];
  ['a', 'b'].forEach((tag) => {
    for (let i = 1; i <= 3; i++) out.push({ id: tag + i, unit: 'u', type: 'gap', prompt: 'P ' + tag + i, answers: ['x'], tags: [tag] });
  });
  return out;
}

const SECTIONS = [{ title: 'A', count: 3, tags: ['a'] }, { title: 'B', count: 3, tags: ['b'] }];
const GROUPED = { id: 'm1', passMark: 0.5, sections: SECTIONS, timing: [{ sections: ['A'], minutes: 10 }, { sections: ['B'], minutes: 20 }] };
const SINGLE = { id: 'm2', passMark: 0.5, sections: SECTIONS, minutes: 30 };
const UNTIMED = { id: 'm3', passMark: 0.5, sections: SECTIONS };

let dojoP;
function loadDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

function content(exams) {
  const its = items();
  const course = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] };
  if (exams) course.exams = exams;
  return { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course: course };
}

function freshDoc() {
  return { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
}

async function setup(exams, o) {
  o = o || {};
  const dojo = await loadDojo();
  const doc = o.doc || freshDoc();
  const clock = { t: o.t || NOW };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo, store, content: content(exams === null ? null : (exams || [GROUPED])), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  return { engine, doc, clock, dojo, store };
}

function solve(s) { return s.answer({ text: 'x' }); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }































test('writes after finish are ignored', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  solve(s);
  s.finish();
  t.clock.t += 2 * MIN;
  s.saveDraft();
  s.tickDraft();
  assert.strictEqual(t.doc.examDraft.closed, 'finished');
});

test('finished exam never resurrects through a real wasm merge with an older open draft', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  solve(s);
  s.saveDraft();
  t.clock.t += 1000;
  const staleDevice = clone(t.doc);
  staleDevice.t = t.clock.t + 5;
  t.clock.t += 1000;
  s.finish();
  t.doc.t = t.clock.t;
  for (const [a, b] of [[t.doc, staleDevice], [staleDevice, t.doc]]) {
    const merged = t.dojo.call('merge', { a: clone(a), b: clone(b) });
    assert.strictEqual(merged.error, undefined);
    const t2 = await setup([GROUPED], { doc: merged, t: t.clock.t });
    assert.strictEqual(t2.engine.examDraft(), null);
    assert.ok(merged.examDraft.closedSids.some((c) => c.sid === s.id));
    assert.strictEqual(Object.keys(merged.exams).length, 1);
  }
});

test('a dead open slot whose sid is in closedSids is not offered', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  t.doc.examDraft.closedSids = [{ sid: s.id, updatedAt: NOW + 1 }];
  assert.strictEqual(t.engine.examDraft(), null);
});

test('real wasm merge round trip: newer open draft from another device is resumable', async () => {
  const a = await setup();
  const sa = a.engine.start('exam', { examId: 'm1' });
  solve(sa); sa.next();
  sa.saveDraft();
  const b = await setup([GROUPED], { doc: clone(a.doc), t: NOW + 30000 });
  const sb = b.engine.start('exam', { examId: 'm1', resume: b.engine.examDraft() });
  solve(sb); sb.next();
  b.clock.t += 5 * MIN;
  sb.saveDraft();
  b.doc.t = b.clock.t;
  a.doc.t = NOW + 1;
  const m1 = a.dojo.call('merge', { a: clone(a.doc), b: clone(b.doc) });
  const m2 = a.dojo.call('merge', { a: clone(b.doc), b: clone(a.doc) });
  assert.deepStrictEqual(m1.examDraft, m2.examDraft);
  const c = await setup([GROUPED], { doc: m1, t: b.clock.t + 2 * 60 * MIN });
  const draft = c.engine.examDraft();
  assert.ok(draft);
  assert.strictEqual(draft.sid, sa.id);
  assert.strictEqual(draft.answers.length, 2);
  const r = c.engine.start('exam', { examId: 'm1', resume: draft });
  assert.strictEqual(r.index, 2);
  assert.strictEqual(r.deadline, c.clock.t + draft.remainingMs[0]);
});

test('abandon writes an abandoned tombstone; resume offer disappears', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  s.abandon();
  assert.strictEqual(t.doc.examDraft.closed, 'abandoned');
  assert.strictEqual(t.engine.examDraft(), null);
  assert.strictEqual(Object.keys(t.doc.exams).length, 0);
});

test('discardDraft tombstones the offered draft', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  t.engine.discardDraft(s.id);
  assert.strictEqual(t.doc.examDraft.closed, 'abandoned');
  assert.strictEqual(t.engine.examDraft(), null);
});

test('starting a new exam replaces the draft and keeps the closed sid of the old one', async () => {
  const t = await setup();
  const s1 = t.engine.start('exam', { examId: 'm1' });
  t.engine.discardDraft(s1.id);
  t.clock.t += 5;
  const s2 = t.engine.start('exam', { examId: 'm1' });
  assert.notStrictEqual(s1.id, s2.id);
  assert.strictEqual(t.doc.examDraft.sid, s2.id);
  assert.ok(t.doc.examDraft.closedSids.some((c) => c.sid === s1.id));
  assert.strictEqual(t.engine.examDraft().sid, s2.id);
});

test('closedSids is bounded to 32 newest', async () => {
  const t = await setup();
  for (let i = 0; i < 40; i++) {
    t.clock.t += 5;
    t.engine.start('exam', { examId: 'm1' }).abandon();
  }
  assert.strictEqual(t.doc.examDraft.closedSids.length, 32);
});

test('finished_elsewhere: refuses to store a second result for the same sid', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  t.doc.examDraft = { sid: s.id, updatedAt: t.clock.t + 1, closed: 'finished' };
  assert.strictEqual(s.finish().error, 'finished_elsewhere');
  assert.strictEqual(Object.keys(t.doc.exams).length, 0);
});

test('training mode and untimed exams are never drafted', async () => {
  const t = await setup([GROUPED, UNTIMED]);
  const tr = t.engine.start('exam', { examId: 'm1', training: true });
  solve(tr); tr.next(); tr.saveDraft(); tr.tickDraft(); tr.abandon(); tr.finish();
  assert.strictEqual(t.doc.examDraft, undefined);
  const u = t.engine.start('exam', { examId: 'm3' });
  solve(u); u.next(); u.saveDraft(); u.finish();
  assert.strictEqual(t.doc.examDraft, undefined);
  assert.strictEqual(Object.keys(t.doc.exams).length, 1);
  assert.strictEqual(t.engine.examDraft(), null);
});

test('daily sessions and courses without exams get no examDraft', async () => {
  const t = await setup(null);
  const s = t.engine.start('daily', {});
  solve(s);
  assert.strictEqual('examDraft' in t.doc, false);
  assert.strictEqual(t.engine.examDraft(), null);
  assert.strictEqual('examDraft' in t.doc, false);
});

test('resume is rejected for training and for a mismatching exam', async () => {
  const t = await setup([GROUPED, SINGLE]);
  t.engine.start('exam', { examId: 'm1' });
  const d = t.engine.examDraft();
  assert.strictEqual(t.engine.start('exam', { examId: 'm1', training: true, resume: d }).error, 'bad_input');
  assert.strictEqual(t.engine.start('exam', { examId: 'm2', resume: d }).error, 'bad_input');
});

test('a draft older than 7 days is tombstoned expired', async () => {
  const t = await setup();
  t.engine.start('exam', { examId: 'm1' });
  t.clock.t += 7 * DAY + 1;
  assert.strictEqual(t.engine.examDraft(), null);
  assert.strictEqual(t.doc.examDraft.closed, 'expired');
});

test('an invalid draft (unknown item, bad shape) is tombstoned expired', async () => {
  for (const mut of [
    (d) => { d.ids[0] = 'gone'; },
    (d) => { d.remainingMs = [1]; },
    (d) => { d.group = 5; },
    (d) => { d.index = 99; },
    (d) => { d.answers = [{ i: 0, c: 'yes' }]; },
    (d) => { d.ids = new Array(1001).fill('a1'); },
    (d) => { d.examId = 'nope'; }
  ]) {
    const t = await setup();
    t.engine.start('exam', { examId: 'm1' });
    mut(t.doc.examDraft);
    assert.strictEqual(t.engine.examDraft(), null);
    assert.strictEqual(t.doc.examDraft.closed, 'expired');
  }
});

test('reset removes the examDraft', async () => {
  const dojo = await loadDojo();
  const mem = new Map();
  const store = DojoStorage.createStore({
    courseId: 'c', dojo, now: () => NOW + 10,
    localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, v); } }
  });
  store.update((d) => { d.examDraft = { sid: 's', updatedAt: NOW, closed: 'finished' }; });
  await store.reset();
  assert.strictEqual(store.doc.examDraft, undefined);
});
