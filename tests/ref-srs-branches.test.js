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
  assert.strictEqual(S.applyPlacement(null, { known: false, now: 0 }), null);
  assert.deepStrictEqual(S.applyPlacement({ s: 1 }, { known: false, now: 0 }), { s: 1 });
  const r = S.applyPlacement(null, { known: true, now: 100, ladder: null, seed: '42' });
  assert.strictEqual(r.s, 4);
  assert.ok(r.due > 100);
  assert.deepStrictEqual(S.applyPlacement({ s: 5 }, { known: true, now: 0, ladder: null, seed: 1 }), { s: 5 });
  assert.throws(() => S.applyPlacement({ s: 0 }, { known: true, now: 0, ladder: null, seed: 'x' }), /u64/);
  assert.throws(() => S.applyPlacement({ s: 0 }, { known: true, now: 0, ladder: null, seed: '18446744073709551616' }), /u64/);
  const small = S.applyPlacement({ s: 0 }, { known: true, now: 0, ladder: [0, 1000], seed: 7 });
  assert.strictEqual(small.s, 1);
  assert.strictEqual(S.applyPlacement(3, { known: true, now: 0, ladder: null, seed: 7 }).s, 4);
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

test('browser (no module) path exposes SRS on the global self', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'reference', 'srs.js'), 'utf8');
  const sandbox = { self: {} };
  vm.runInNewContext(src, sandbox);
  assert.strictEqual(typeof sandbox.self.SRS, 'object');
  assert.strictEqual(sandbox.self.SRS.applyPractice(null, true, 0).s, 1);
});

test('boundary: isDue is strict at due time, weakest orders by bad count', () => {
  // mutation check: changing `due <= now` to `due < now` makes the equal-time case fail
  assert.ok(S.isDue({ due: 7 }, 7));
  assert.ok(!S.isDue({ due: 8 }, 7));
  // items with bad 0 are excluded from weakest
  assert.deepStrictEqual(S.weakest({ a: { bad: 0, ok: 0, s: 1 }, b: { bad: 2, ok: 0, s: 1 } }), ['b']);
});
