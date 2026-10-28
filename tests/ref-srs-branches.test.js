'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../tools/reference/srs.js');

test('applyAnswer: promote, demote with learned floor, new record', () => {
  assert.strictEqual(S.applyAnswer(null, true, 0).s, 1);
  assert.strictEqual(S.applyAnswer({ s: 6 }, true, 0).s, 6);
  assert.strictEqual(S.applyAnswer({ s: 1, ok: 1 }, false, 0).s, 1);
  assert.strictEqual(S.applyAnswer(null, false, 5).s, 0);
  const r = S.applyAnswer({ s: 3, ok: 2, bad: 1, x: 9 }, false, 10);
  assert.strictEqual(r.s, 1);
  assert.strictEqual(r.x, 9);
  assert.strictEqual(r.bad, 2);
  assert.strictEqual(r.due, 10 + S.INTERVALS[1]);
});

test('applyPractice: due/not-due, right/wrong', () => {
  assert.strictEqual(S.applyPractice(null, true, 0).s, 1);
  assert.strictEqual(S.applyPractice({ s: 2 }, true, 0).s, 3);
  assert.strictEqual(S.applyPractice({ s: 2, due: 5 }, true, 9).s, 3);
  assert.deepStrictEqual(S.applyPractice({ s: 2, due: 50, ok: 1, k: 1 }, true, 9), { s: 2, due: 50, ok: 2, k: 1, last: 9 });
  assert.strictEqual(S.applyPractice({ s: 4, due: 50 }, false, 9).s, 2);
});

test('countsTowardDailyNew, applyRelearn, placementKnown', () => {
  assert.ok(S.countsTowardDailyNew('srs', undefined));
  assert.ok(!S.countsTowardDailyNew('srs', {}));
  assert.ok(!S.countsTowardDailyNew('practice', null));
  assert.strictEqual(S.applyRelearn(null, 0), null);
  const keep = { s: 2 };
  assert.strictEqual(S.applyRelearn(keep, 0), keep);
  assert.deepStrictEqual(S.applyRelearn({ s: 0, ok: 1, bad: 2 }, 0), { s: 1, due: S.INTERVALS[1], ok: 1, bad: 2, last: 0 });
  assert.strictEqual(S.placementKnown(null, 0, 0).s, 4);
  assert.strictEqual(S.placementKnown({ s: 5, ok: 1, bad: 1 }, 0, 0.5).s, 5);
  assert.strictEqual(typeof S.placementKnown(null, 0).due, 'number');
});

test('applyPlacement: unknown, known, idempotent, bad seed, custom ladder', () => {
  assert.strictEqual(S.applyPlacement(null, false, 0), null);
  assert.deepStrictEqual(S.applyPlacement({ s: 1 }, false, 0), { s: 1 });
  const r = S.applyPlacement(null, true, 100, null, '42');
  assert.strictEqual(r.s, 4);
  assert.ok(r.due > 100);
  assert.deepStrictEqual(S.applyPlacement({ s: 5 }, true, 0, null, 1), { s: 5 });
  assert.throws(() => S.applyPlacement({ s: 0 }, true, 0, null, 'x'), /u64/);
  assert.throws(() => S.applyPlacement({ s: 0 }, true, 0, null, '18446744073709551616'), /u64/);
  const small = S.applyPlacement({ s: 0 }, true, 0, [0, 1000], 7);
  assert.strictEqual(small.s, 1);
  assert.strictEqual(S.applyPlacement(3, true, 0, null, 7).s, 4);
});

test('isDue, isNew, dayKey, streak, queue and weakest do not throw and are sane', () => {
  assert.ok(S.isDue({ due: 1 }, 1));
  assert.ok(!S.isDue({ due: 2 }, 1));
  assert.ok(!S.isDue(null, 1));
  assert.ok(S.isNew(undefined));
  assert.ok(!S.isNew({ s: 1, ok: 1 }));
  assert.strictEqual(typeof S.dayKey(0), 'string');
  assert.strictEqual(typeof S.streak([], 0), 'number');
  const items = { a: { s: 1, due: 5, ok: 1, bad: 3 }, b: { s: 1, due: 1, ok: 1, bad: 0 } };
  const q = S.buildQueue(items, ['a', 'b', 'c', 'd'], 10, 1);
  assert.deepStrictEqual(q, { due: ['b', 'a'], fresh: ['c'] });
  assert.deepStrictEqual(S.buildQueue(null, ['x'], 0, -3), { due: [], fresh: [] });
  assert.deepStrictEqual(S.weakest(items, 1, { a: true, b: true }), ['a']);
  assert.deepStrictEqual(S.weakest(null), []);
  assert.deepStrictEqual(S.weakest({ a: { bad: 1, ok: 0, s: 5 }, b: { bad: 1, ok: 0, s: 5, last: 3 }, c: null }), ['b', 'a']);
  const t = new Date(2024, 0, 10, 15).getTime();
  assert.strictEqual(S.dayKey(new Date(2024, 0, 5).getTime()), '2024-01-05');
  assert.strictEqual(S.streak({ '2024-01-10': 1, '2024-01-09': 1, '2024-01-07': 1 }, t), 2);
  assert.strictEqual(S.streak({ '2024-01-09': 1 }, t), 1);
  assert.strictEqual(S.streak(null, t), 0);
});
