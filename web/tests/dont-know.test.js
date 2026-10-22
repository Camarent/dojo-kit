'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');

const ROOT = path.join(__dirname, '..', '..');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

let dojoPromise;
function getDojo() {
  if (!dojoPromise) {
    checkWasmFresh();
    dojoPromise = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoPromise;
}

function makeItem(id, type, unit) {
  if (type === 'choice') {
    return { id, type, unit, prompt: 'Q' + id, answer: 0, options: ['A', 'B', 'C'] };
  }
  if (type === 'gap') {
    return { id, type, unit, prompt: 'Q' + id, answers: ['ans' + id] };
  }
  if (type === 'card') {
    return { id, type, unit, prompt: 'Q' + id, back: 'Back' + id };
  }
  throw new Error('Unknown type: ' + type);
}

function makeContent(items, courseOverrides) {
  const course = { id: 'test', title: 'Test', units: [{ id: 'u1', title: 'Unit 1' }], dontKnow: true, ...courseOverrides };
  return { v: 1, version: 'test', lock: items.map((i) => i.id), items, course };
}

async function setup(items, courseOverrides) {
  const dojo = await getDojo();
  const content = makeContent(items, courseOverrides);
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {}
  };
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  return { engine, doc, store, clock, content };
}

function ids(session) {
  const out = [];
  for (let c = session.current(); c; c = session.next()) out.push(c.item.id);
  return out;
}

test('dontKnow returns no_dont_know in placement mode', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { placement: { mode: 'self' } });
  const s = t.engine.start('placement');
  assert.deepStrictEqual(s.dontKnow(), { error: 'no_dont_know' });
});

test('dontKnow returns no_dont_know for card items', async () => {
  const items = [makeItem('i1', 'card', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  assert.deepStrictEqual(s.dontKnow(), { error: 'no_dont_know' });
});

test('dontKnow returns no_dont_know in timed exam', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { exams: [{ id: 'e1', sections: [{ title: 'S', count: 1 }], minutes: 30 }] });
  const s = t.engine.start('exam', { examId: 'e1' });
  assert.ok(s.deadline !== undefined);
  assert.deepStrictEqual(s.dontKnow(), { error: 'no_dont_know' });
  s.release && s.release();
});

test('dontKnow returns no_dont_know when course.dontKnow is not true', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { dontKnow: false });
  const s = t.engine.start('daily');
  assert.deepStrictEqual(s.dontKnow(), { error: 'no_dont_know' });
});

test('dontKnow returns no_dont_know when course.dontKnow is absent', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const content = { v: 1, version: 'test', lock: ['i1'], items, course: { id: 'test', title: 'Test', units: [{ id: 'u1', title: 'Unit 1' }] } };
  const dojo = await getDojo();
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {}
  };
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  const s = engine.start('daily');
  assert.deepStrictEqual(s.dontKnow(), { error: 'no_dont_know' });
});

test('dontKnow returns no_dont_know when already answered', async () => {
  const items = [makeItem('i1', 'choice', 'u1'), makeItem('i2', 'choice', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  s.answer({ index: 0 });
  assert.deepStrictEqual(s.dontKnow(), { error: 'already_answered' });
});

test('dontKnow works in daily mode with course.dontKnow=true', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  const r = s.dontKnow();
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.given, '-');
  assert.ok(!r.error);
  assert.ok(s.current().item);
});

test('dontKnow works in practice mode with course.dontKnow=true', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('practice');
  const r = s.dontKnow();
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.given, '-');
  assert.ok(!r.error);
});

test('dontKnow works in weak mode with course.dontKnow=true', async () => {
  const items = [makeItem('i1', 'choice', 'u1'), makeItem('i2', 'choice', 'u1')];
  const t = await setup(items);
  // First create a wrong record
  const s1 = t.engine.start('daily');
  s1.answer({ index: 1 }); // wrong answer
  s1.next();
  // Finish the session to create records
  s1.finish();
  // Now start weak mode - it should pick the wrong item
  const s = t.engine.start('weak');
  assert.ok(s.total > 0, 'Weak session should have items');
  const r = s.dontKnow();
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.given, '-');
  assert.ok(!r.error);
});

test('dontKnow works in untimed exam (training) with course.dontKnow=true', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { exams: [{ id: 'e1', sections: [{ title: 'S', count: 1 }] }] });
  const s = t.engine.start('exam', { examId: 'e1', training: true });
  const r = s.dontKnow();
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.given, '-');
  assert.ok(!r.error);
  s.release && s.release();
});

test('dontKnow requeues the item once', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  const cur = s.current();
  assert.strictEqual(cur.position, 1);
  assert.strictEqual(cur.total, 1);
  s.dontKnow();
  assert.strictEqual(s.retryCount(), 1);
  // After dontKnow, the queue has the original item + requeued copy
  // current() returns the current item, and total is the queue length
  const cur2 = s.current();
  assert.strictEqual(cur2.total, 2); // queue length increased
});

test('dontKnow records wrong answer and requeues once, does not double-record', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  const r1 = s.dontKnow();
  assert.strictEqual(r1.correct, false);
  assert.strictEqual(s.retryCount(), 1);
  
  // Move to next (the requeued copy)
  s.next();
  assert.ok(s.current());
  assert.strictEqual(s.current().item.id, 'i1');
  
  // Answer the requeued copy with dontKnow again
  const r2 = s.dontKnow();
  assert.strictEqual(r2.correct, false);
  assert.strictEqual(s.retryCount(), 1); // Still 1, because it was already requeued
});

test('dontKnow sets given to - in review', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  s.dontKnow();
  const summary = s.finish();
  assert.strictEqual(summary.review[0].given, '-');
  assert.strictEqual(summary.review[0].correct, false);
});

test('canOverride returns false for dontKnow verdict', async () => {
  const items = [makeItem('i1', 'gap', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  s.dontKnow();
  assert.strictEqual(s.canOverride(), false);
});

test('dontKnow works with gap items', async () => {
  const items = [makeItem('i1', 'gap', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  const r = s.dontKnow();
  assert.strictEqual(r.correct, false);
  assert.strictEqual(r.given, '-');
  assert.ok(!r.error);
});

test('dontKnow is refused in a non-training exam even without a timer', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { exams: [{ id: 'e1', sections: [{ title: 'S', count: 1 }] }] });
  const s = t.engine.start('exam', { examId: 'e1' });
  assert.deepStrictEqual(s.dontKnow(), { error: 'no_dont_know' });
  s.release && s.release();
});

test('dontKnow stores a single wrong record for a new item', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  s.dontKnow();
  assert.ok(t.doc.items.i1);
  assert.strictEqual(t.doc.stats.days[TODAY], 1);
  assert.strictEqual(t.doc.stats.newByDay[TODAY], 1);
});

test('answer() result keeps the old shape (no given) while dontKnow() adds given', async () => {
  const items = [makeItem('i1', 'gap', 'u1'), makeItem('i2', 'gap', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  const r = s.answer({ text: 'wrong' });
  assert.ok(!('given' in r));
  s.next();
  assert.strictEqual(s.dontKnow().given, '-');
});

test('canDontKnow returns true for choice in daily with dontKnow enabled', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  assert.ok(s.canDontKnow());
  assert.strictEqual(typeof s.canDontKnow, 'function');
});

test('canDontKnow returns false for card items', async () => {
  const items = [makeItem('i1', 'card', 'u1')];
  const t = await setup(items);
  const s = t.engine.start('daily');
  assert.strictEqual(s.canDontKnow(), false);
});

test('canDontKnow returns false in placement mode', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { placement: { mode: 'self' } });
  const s = t.engine.start('placement');
  assert.strictEqual(s.canDontKnow(), false);
});

test('canDontKnow returns false in timed exam', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { exams: [{ id: 'e1', sections: [{ title: 'S', count: 1 }], minutes: 10 }] });
  const s = t.engine.start('exam', { examId: 'e1' });
  assert.strictEqual(s.canDontKnow(), false);
  s.release && s.release();
});

test('canDontKnow returns true in training exam', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { exams: [{ id: 'e1', sections: [{ title: 'S', count: 1 }] }] });
  const s = t.engine.start('exam', { examId: 'e1', training: true });
  assert.strictEqual(s.canDontKnow(), true);
  s.release && s.release();
});

test('canDontKnow returns false when course.dontKnow is not set', async () => {
  const items = [makeItem('i1', 'choice', 'u1')];
  const t = await setup(items, { dontKnow: undefined });
  const s = t.engine.start('daily');
  assert.strictEqual(s.canDontKnow(), false);
});
