'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
require('../storage.js');
const { checkWasmFresh } = require('./loader.js');
require('./load-bundle.js');

path.join(__dirname, '..', '..');
const NOW = 1760000000000;
const MIN = 60000;

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































test('start writes an open draft with per-group remainingMs', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  const d = t.doc.examDraft;
  assert.strictEqual(d.sid, s.id);
  assert.strictEqual(d.examId, 'm1');
  assert.deepStrictEqual(d.remainingMs, [10 * MIN, 20 * MIN]);
  assert.strictEqual(d.group, 0);
  assert.strictEqual(d.ids.length, 6);
  assert.deepStrictEqual(d.answers, []);
  assert.strictEqual(d.closed, undefined);
  assert.ok(t.engine.examDraft());
});

test('single-timer exam drafts remainingMs as one entry', async () => {
  const t = await setup([SINGLE]);
  t.engine.start('exam', { examId: 'm2' });
  assert.deepStrictEqual(t.doc.examDraft.remainingMs, [30 * MIN]);
});

test('an answer is written to the draft immediately (not throttled)', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  t.clock.t += 100;
  solve(s);
  assert.deepStrictEqual(t.doc.examDraft.answers, [{ i: 0, c: true, g: 'x' }]);
});

test('tickDraft refreshes remainingMs every 60 s even without changes', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  t.clock.t += 61000;
  s.tickDraft();
  assert.strictEqual(t.doc.examDraft.remainingMs[0], 10 * MIN - 61000);
  assert.strictEqual(t.doc.examDraft.updatedAt, t.clock.t);
});

test('saveDraft forces a write (visibility hidden)', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  t.clock.t += 10;
  solve(s);
  s.saveDraft();
  assert.strictEqual(t.doc.examDraft.answers.length, 1);
});

test('given text is capped at 200 chars', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  s.answer({ text: 'y'.repeat(500) });
  s.saveDraft();
  assert.strictEqual(t.doc.examDraft.answers[0].g.length, 200);
});

test('resume restores sid, index, answers and remaining time; time away does not count', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  solve(s);
  s.next();
  s.answer({ text: 'wrong' });
  s.next();
  t.clock.t += 4 * MIN;
  s.saveDraft();
  const nextId = s.current().item.id;
  t.clock.t += 3 * 60 * MIN;
  const draft = t.engine.examDraft();
  assert.ok(draft);
  const r = t.engine.start('exam', { examId: 'm1', resume: draft });
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.id, s.id);
  assert.strictEqual(r.index, 2);
  assert.strictEqual(r.current().item.id, nextId);
  assert.strictEqual(r.deadline, t.clock.t + 6 * MIN);
  assert.strictEqual(r.group.index, 0);
  assert.strictEqual(r.training, false);
  for (let k = 0; k < 4; k++) { solve(r); r.next(); }
  assert.strictEqual(r.done, true);
  const sum = r.finish();
  assert.strictEqual(sum.raw, 5);
  assert.strictEqual(sum.total, 6);
  assert.strictEqual(sum.review.length, 6);
  assert.strictEqual(sum.durationMs, 4 * MIN);
});

test('resume does not re-apply answers already committed to SRS', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  solve(s);
  s.next();
  s.saveDraft();
  const before = clone(t.doc.items);
  t.engine.start('exam', { examId: 'm1', resume: t.engine.examDraft() });
  assert.deepStrictEqual(t.doc.items, before);
});

test('answered current question moves on after resume', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  solve(s);
  s.saveDraft();
  assert.strictEqual(t.doc.examDraft.index, 0);
  const r = t.engine.start('exam', { examId: 'm1', resume: t.engine.examDraft() });
  assert.strictEqual(r.index, 1);
  assert.strictEqual(solve(r).error, undefined);
});

test('resume in group 2 restores that group deadline and skipped items of group 1', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  solve(s); s.next();
  t.clock.t += 11 * MIN;
  assert.strictEqual(s.expire().jumped, true);
  assert.strictEqual(s.group.index, 1);
  t.clock.t += 5 * MIN;
  s.saveDraft();
  assert.deepStrictEqual(t.doc.examDraft.remainingMs, [0, 15 * MIN]);
  t.clock.t += 60 * MIN;
  const r = t.engine.start('exam', { examId: 'm1', resume: t.engine.examDraft() });
  assert.strictEqual(r.group.index, 1);
  assert.strictEqual(r.index, 3);
  assert.strictEqual(r.deadline, t.clock.t + 15 * MIN);
  for (let k = 0; k < 3; k++) { solve(r); r.next(); }
  const sum = r.finish();
  assert.strictEqual(sum.skipped.length, 2);
  assert.strictEqual(sum.raw, 4);
});

test('resume with an expired current group jumps at once', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  s.saveDraft();
  t.doc.examDraft.remainingMs = [0, 20 * MIN];
  const r = t.engine.start('exam', { examId: 'm1', resume: t.engine.examDraft() });
  assert.strictEqual(r.group.index, 1);
  assert.strictEqual(r.index, 3);
  assert.strictEqual(r.deadline, t.clock.t + 20 * MIN);
});

test('resume where the last group already expired is finished and scored', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  solve(s);
  s.saveDraft();
  Object.assign(t.doc.examDraft, { group: 1, index: 3, remainingMs: [0, 0] });
  const r = t.engine.start('exam', { examId: 'm1', resume: t.engine.examDraft() });
  assert.strictEqual(r.done, true);
  const sum = r.finish();
  assert.strictEqual(sum.raw, 1);
  assert.strictEqual(Object.keys(t.doc.exams).length, 1);
  assert.strictEqual(t.doc.examDraft.closed, 'finished');
});

test('finish writes the result and the finished tombstone in one update', async () => {
  const t = await setup();
  const orig = t.store.update;
  t.store.update = (fn) => {
    const had = Object.keys(t.doc.exams).length;
    orig(fn);
    if (Object.keys(t.doc.exams).length > had) assert.strictEqual(t.doc.examDraft.closed, 'finished');
  };
  const s = t.engine.start('exam', { examId: 'm1' });
  solve(s);
  s.finish();
  assert.strictEqual(Object.keys(t.doc.exams).length, 1);
  assert.strictEqual(t.doc.examDraft.closed, 'finished');
  assert.strictEqual(t.doc.examDraft.sid, s.id);
  assert.strictEqual(t.doc.examDraft.ids, undefined);
  assert.strictEqual(t.engine.examDraft(), null);
  assert.ok(t.doc.examDraft.closedSids.some((c) => c.sid === s.id));
});
