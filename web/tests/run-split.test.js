// Characterisation of session/run-parts.js (moved out of session/run.js): sx state shape and remaining-time list.
// Synthetic data only; no DOM, no storage.
const test = require('node:test');
const assert = require('node:assert');
const { makeSx, remainingList } = require('../session/run-parts.js');

function fakeCtx(now, lock) {
  return { now: function () { return now; }, fn: { acquireWakeLock: function () { return lock || 'lock'; } } };
}

test('makeSx for a plain practice plan: queue is a copy, no lock, group index 0', () => {
  const ids = ['a', 'b'];
  const session = { id: 's1', mode: 'practice' };
  const sx = makeSx(fakeCtx(1000), 'practice', { ids: ids }, session);
  assert.notStrictEqual(sx.queue, ids);
  assert.deepStrictEqual(sx.queue, ['a', 'b']);
  assert.strictEqual(sx.lockHolder, null);
  assert.strictEqual(sx.groupIdx, 0);
  assert.strictEqual(sx.groups, null);
  assert.strictEqual(sx.isTimedExam, false);
  assert.strictEqual(sx.startedAt, 1000);
  assert.strictEqual(sx.lastWriteAt, -Infinity);
  assert.strictEqual(Object.getPrototypeOf(sx.introSeen), null);
  assert.strictEqual(session.group, undefined);
});

test('makeSx for a timed exam with groups and resume: group, start time and lock come from the plan', () => {
  const session = { id: 's2', mode: 'exam' };
  const plan = {
    ids: ['q1', 'q2', 'q3'], deadline: 5000, groups: [{ minutes: 1 }, { minutes: 2 }],
    resume: { group: 1, elapsedMs: 300, index: 0, answers: [] }
  };
  const sx = makeSx(fakeCtx(2000, 'WL'), 'exam', plan, session);
  assert.deepStrictEqual(session.group, { index: 1, count: 2 });
  assert.strictEqual(sx.groupIdx, 1);
  assert.strictEqual(sx.startedAt, 2000 - 300);
  assert.strictEqual(sx.lockHolder, 'WL');
  assert.strictEqual(sx.isTimedExam, true);
});

test('makeSx for a training exam with a deadline: lock still taken, but not a timed exam', () => {
  const sx = makeSx(fakeCtx(0), 'exam', { ids: ['x'], deadline: 9, training: true }, { id: 's3' });
  assert.strictEqual(sx.lockHolder, 'lock');
  assert.strictEqual(sx.isTimedExam, false);
});

test('remainingList without groups: one entry, time left clamped at 0', () => {
  const rc = { ctx: fakeCtx(1000), session: { deadline: 4000 }, sx: { groups: null } };
  assert.deepStrictEqual(remainingList(rc), [3000]);
  rc.session.deadline = 500;
  assert.deepStrictEqual(remainingList(rc), [0]);
});

test('remainingList with groups: current group gets time left, earlier groups 0, later groups full minutes', () => {
  const rc = {
    ctx: fakeCtx(1000), session: { deadline: 4000 },
    sx: { groups: [{ minutes: 1 }, { minutes: 2 }, { minutes: 3 }], groupIdx: 1 }
  };
  assert.deepStrictEqual(remainingList(rc), [0, 3000, 3 * 60000]);
});
