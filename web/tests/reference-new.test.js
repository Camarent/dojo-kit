'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ref = (n) => require(path.join(__dirname, '..', '..', 'tools', 'reference', n + '.js'));
const { timerNext, timerLimit } = ref('timer');
const { applyExtras } = ref('extras');
const { weight, weightedQueue, splitmix64, unitRandom } = ref('weighted');
const round4 = (x) => Math.round(x * 1e4) / 1e4;

const wrong = { outcome: 'wrong', answerMs: 0, limitMs: 8000 };
const fast = { outcome: 'correct', answerMs: 100, limitMs: 8000 };

test('timer example 8000 -> 9600 -> 8640', () => {
  let s = timerNext({ scale: 1, streak: 0, ...wrong });
  assert.deepStrictEqual(s, { scale: 1.2, streak: 0 });
  assert.strictEqual(timerLimit({ baseMs: 8000, scale: s.scale }), 9600);
  for (let i = 0; i < 3; i++) s = timerNext({ ...s, ...fast });
  assert.deepStrictEqual(s, { scale: 1.08, streak: 0 });
  assert.strictEqual(timerLimit({ baseMs: 8000, scale: s.scale }), 8640);
});

test('timer streak resets on slow correct and on wrong', () => {
  assert.strictEqual(timerNext({ scale: 1, streak: 2, outcome: 'correct', answerMs: 7000, limitMs: 8000 }).streak, 0);
  assert.strictEqual(timerNext({ scale: 1, streak: 2, ...wrong }).streak, 0);
  assert.strictEqual(timerNext({ scale: 1, streak: 1, ...fast }).streak, 2);
});

test('timer bounds and limit clamps', () => {
  assert.strictEqual(timerNext({ scale: 1.9, streak: 0, ...wrong }).scale, 2);
  assert.strictEqual(timerNext({ scale: 0.5, streak: 2, ...fast }).scale, 0.5);
  assert.strictEqual(timerLimit({ baseMs: 2000, scale: 0.5 }), 1500);
  assert.strictEqual(timerLimit({ baseMs: 30000, scale: 2 }), 60000);
});

test('extras example e 0.5 -> 0.65 -> 0.455', () => {
  const a = applyExtras({ rec: {}, correct: false, given: 'x', timedOut: false, weighted: true });
  assert.strictEqual(a.e, 0.65);
  const b = applyExtras({ rec: a, correct: true, given: 'y', timedOut: false, weighted: true });
  assert.strictEqual(b.e, 0.455);
});

const cfOf = (rec, given) => applyExtras({ rec, correct: false, given, timedOut: false, weighted: false });

test('extras cf: new key enters, lowest other evicted, ties earliest', () => {
  let rec = {};
  for (const g of 'abcdefgh') rec = cfOf(rec, g);
  rec = cfOf(rec, 'i');
  assert.deepStrictEqual(rec.cf.map((p) => p[0]), [...'bcdefghi']);
  rec = cfOf({ cf: [['m', 1], ['z', 1], ['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 1], ['f', 1]] }, 'q');
  assert.strictEqual(rec.cf[0][0], 'z');
  assert.strictEqual(rec.cf.length, 8);
  const counted = Array.from({ length: 8 }, (_, i) => ['k' + i, i + 2]);
  const out = cfOf({ cf: counted }, 'zz').cf;
  assert.deepStrictEqual(out[7], ['zz', 1]);
  assert.strictEqual(out[0][0], 'k1');
});

test('extras cf: integer-like keys keep insertion order', () => {
  const rec = cfOf({ cf: [['zz', 1], ['87', 1]] }, '9');
  assert.deepStrictEqual(rec.cf.map((p) => p[0]), ['zz', '87', '9']);
});

test('extras cf: code points, White_Space trim, normaliser', () => {
  assert.strictEqual(cfOf({}, '\u{1F600}'.repeat(16)).cf.length, 1);
  assert.strictEqual(cfOf({}, '\u{1F600}'.repeat(17)).cf, undefined);
  assert.strictEqual(cfOf({}, '\uFEFFab').cf[0][0], '\uFEFFab');
  assert.strictEqual(cfOf({}, '\u0085ab').cf[0][0], 'ab');
  assert.deepStrictEqual(cfOf({ cf: { a: 1 } }, 'x').cf, [['x', 1]]);
  assert.deepStrictEqual(cfOf({ cf: [['a', 1], ['a', 5], ['b', 0], ['c']] }, 'x').cf, [['a', 1], ['x', 1]]);
  assert.deepStrictEqual(cfOf({}, '__proto__').cf, [['__proto__', 1]]);
});

test('extras e clamp, to normalisation, flags', () => {
  const run = (rec, o) => applyExtras({ rec, correct: false, given: '', timedOut: false, weighted: false, ...o });
  assert.strictEqual(run({ e: -1 }, { weighted: true }).e, 0.3);
  assert.strictEqual(run({ e: 2 }, { weighted: true, correct: true }).e, 0.7);
  assert.strictEqual(run({ to: '3' }, { timedOut: true }).to, 1);
  assert.strictEqual(run({ to: 2.7 }, { timedOut: true }).to, 3);
  assert.strictEqual(run({}, { weighted: 1 }).e, undefined);
  assert.deepStrictEqual(run(null, { timedOut: true }), { to: 1 });
});

test('timer input normalisation', () => {
  const t = (o) => timerNext({ scale: 1, streak: 0, outcome: 'correct', answerMs: 9000, limitMs: 8000, ...o });
  assert.strictEqual(t({ scale: 5 }).scale, 2);
  assert.strictEqual(timerNext({ scale: 0.1, streak: 0, ...wrong }).scale, 0.6);
  assert.deepStrictEqual(t({ streak: 7, answerMs: 1 }), { scale: 0.9, streak: 0 });
  assert.deepStrictEqual(t({ streak: -1, answerMs: 1 }), { scale: 1, streak: 1 });
  assert.strictEqual(t({ outcome: 'bogus', answerMs: 1 }).scale, 1.2);
  assert.strictEqual(timerLimit({ baseMs: 'x', scale: 1 }), 8000);
});

test('weightedQueue seed must be a u64 decimal string', () => {
  const q = (seed) => weightedQueue({ ids: [], records: {}, now: 0, seed, limit: 1, newAllowance: 0 });
  for (const bad of [1, '', '-1', '1.5', '18446744073709551616', '123456789012345678901', '+5', null]) {
    assert.throws(() => q(bad), undefined, String(bad));
  }
  assert.deepStrictEqual(q('18446744073709551615'), []);
});

test('weightedQueue inputs: dedupe, limit, own-property records, worst-first needs e', () => {
  const w = (o) => weightedQueue({ ids: [], records: {}, now: 0, seed: '1', limit: 9, newAllowance: 0, ...o });
  assert.deepStrictEqual(w({ ids: ['a', 'a'], newAllowance: 5 }), ['a']);
  assert.deepStrictEqual(w({ ids: ['a'], newAllowance: 5, limit: -1 }), []);
  assert.deepStrictEqual(w({ ids: ['constructor', 'toString', '__proto__'] }), []);
  const recs = { a: { s: 0 }, b: { s: 0, e: 0.4 } };
  assert.deepStrictEqual(w({ ids: ['a', 'b'], records: recs, limit: 1 }), ['b']);
});

test('extras timed out counts to only and keeps core fields', () => {
  const rec = { s: 2, due: 5, ok: 3, bad: 1, last: 9, zz: 1 };
  const out = applyExtras({ rec, correct: false, given: 'abc', timedOut: true, weighted: false });
  assert.deepStrictEqual(out, { ...rec, to: 1 });
  assert.deepStrictEqual(rec, { s: 2, due: 5, ok: 3, bad: 1, last: 9, zz: 1 });
});

test('weight examples 0.975 and 0.4278', () => {
  const now = 10 * 86400000;
  assert.strictEqual(round4(weight({ rec: undefined, now })), 0.975);
  assert.strictEqual(round4(weight({ rec: { s: 1, e: 0.455, last: now }, now })), 0.4278);
});

test('splitmix64 seed 0 matches the known first output', () => {
  assert.strictEqual(splitmix64(0n).value.toString(), '16294208416658607535');
});

test('weightedQueue: new allowance, limit and determinism', () => {
  const input = { ids: ['n1', 'n2', 'n3'], records: {}, now: 0, seed: '5', limit: 9, newAllowance: 2 };
  const out = weightedQueue(input);
  assert.deepStrictEqual([...out].sort(), ['n1', 'n2']);
  assert.deepStrictEqual(weightedQueue(input), out);
  assert.deepStrictEqual(weightedQueue({ ...input, ids: [] }), []);
});

test('weightedQueue: worst-first by e desc', () => {
  const records = { a: { s: 0, e: 0.4, last: 0 }, b: { s: 0, e: 0.9, last: 0 }, c: { s: 0, e: 0.1, last: 0 } };
  const out = weightedQueue({ ids: ['a', 'b', 'c'], records, now: 0, seed: '1', limit: 3, newAllowance: 0 });
  assert.deepStrictEqual(out.slice(0, 2), ['b', 'a']);
});

test('weighted.json weight group equals the raw reference weight', () => {
  const doc = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', '..', 'tests', 'vectors', 'weighted.json'), 'utf8'));
  const group = doc.groups.find((g) => g.fn === 'weight');
  for (const c of group.cases) assert.strictEqual(weight(c.input), c.expect, c.name);
});

test('unitRandom is (v >> 11) / 2^53', () => {
  assert.strictEqual(unitRandom((1n << 64n) - 1n), (2 ** 53 - 1) / 2 ** 53);
  assert.strictEqual(unitRandom(2047n), 0);
});
