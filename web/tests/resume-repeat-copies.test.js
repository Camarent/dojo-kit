'use strict';
// Guard: repeat copies and resume. Practice: a wrong answer queues one repeat copy (run-view.js recordGrade).
// Timed exam: no repeat copy is queued (recordGrade returns early in exam mode), so the draft keeps the
// planned ids; resume restores the queue, the answers and the repeat count (0) from the draft.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
require('../storage.js');
const { checkWasmFresh } = require('./loader.js');
require('./load-bundle.js');

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

let dojoP;
function loadDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

function content() {
  const its = items();
  const course = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], exams: [GROUPED] };
  return { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course: course };
}

async function setup() {
  const dojo = await loadDojo();
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo, store, content: content(), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  return { engine, doc, clock };
}

test('practice: a wrong answer queues one repeat copy, a right answer queues none', async () => {
  const t = await setup();
  const s = t.engine.start('practice', {});
  assert.strictEqual(s.error, undefined);
  const queueBefore = s.denominator();
  assert.strictEqual(s.repeats(), 0);
  s.answer({ text: 'wrong' });
  assert.strictEqual(s.repeats(), 1, 'the wrong answer queues one repeat copy');
  assert.strictEqual(s.denominator(), queueBefore + 1, 'the repeat copy is in the queue');
  s.next();
  s.answer({ text: 'x' });
  assert.strictEqual(s.repeats(), 1, 'a right answer queues no repeat');
  assert.strictEqual(s.denominator(), queueBefore + 1);
});

test('exam: a wrong answer, exit, resume keeps the queue and the repeat count', async () => {
  const t = await setup();
  const s = t.engine.start('exam', { examId: 'm1' });
  const repeatsBefore = s.repeats();
  const denomBefore = s.denominator();
  s.answer({ text: 'wrong' });
  s.next();
  t.clock.t += MIN;
  s.saveDraft();
  const idsBefore = t.doc.examDraft.ids.slice();
  assert.strictEqual(idsBefore.length, denomBefore, 'draft stores the full queue');
  assert.strictEqual(s.repeats(), repeatsBefore, 'exam mode queues no repeat for a wrong answer');
  const nextId = s.current().item.id;
  const draft = t.engine.examDraft();
  assert.ok(draft);
  const r = t.engine.start('exam', { examId: 'm1', resume: draft });
  assert.strictEqual(r.error, undefined);
  assert.strictEqual(r.denominator(), denomBefore, 'resumed queue length equals the queue before exit');
  assert.strictEqual(r.repeats(), repeatsBefore, 'resumed repeat count equals the count before exit');
  assert.strictEqual(r.index, 1);
  assert.strictEqual(r.current().item.id, nextId);
  r.saveDraft();
  assert.deepStrictEqual(t.doc.examDraft.ids, idsBefore, 'the draft written after resume keeps the same ids');
  assert.deepStrictEqual(t.doc.examDraft.answers.map((a) => [a.i, a.c]), [[0, false]], 'the wrong answer is restored');
});

test('practice: a wrong-answer repeat copy is never saved in a draft, so exit and return cannot lose one', async () => {
  const t = await setup();
  const s = t.engine.start('practice', {});
  s.answer({ text: 'wrong' });
  assert.strictEqual(s.repeats(), 1, 'the wrong answer queues one repeat copy');
  const queueBefore = s.denominator();
  s.saveDraft();
  assert.strictEqual(t.doc.examDraft, undefined, 'practice writes no exam draft');
  assert.strictEqual(t.engine.examDraft(), null, 'no draft is offered to resume');
  assert.strictEqual(s.denominator(), queueBefore, 'the repeat copy stays in the live queue until exit');
});
