'use strict';

const { round4 } = require('./timer.js');

const DAY_MS = 86400000;
const WORST_MAX = 5;
const WORST_MIN_E = 0.3;
const BOXF = [1, 0.7071067811865476, 0.5, 0.35355339059327373, 0.25, 0.17677669529663687];
const MASK = (1n << 64n) - 1n;
const fin = Number.isFinite;

const isRec = (r) => r !== null && typeof r === 'object' && !Array.isArray(r);
const eOf = (rec) => (fin(rec.e) ? Math.min(1, Math.max(0, rec.e)) : 0.5);
const count = (x) => (fin(x) ? Math.max(0, Math.floor(x)) : 0);

function splitmix64(state) {
  const s = (state + 0x9E3779B97F4A7C15n) & MASK;
  let z = s;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
  return { state: s, value: (z ^ (z >> 31n)) & MASK };
}

// splitmix64 output -> r in [0, 1)
const unitRandom = (v) => Number(v >> 11n) / 2 ** 53;

function parseSeed(seed) {
  if (typeof seed !== 'string' || !/^\d{1,20}$/.test(seed)) throw new Error('bad seed');
  const n = BigInt(seed);
  if (n > MASK) throw new Error('bad seed');
  return n;
}

// {rec?, now} -> unrounded weight; an invalid rec is a new item
function weight({ rec, now }) {
  const r = isRec(rec) ? rec : null;
  const e = r ? eOf(r) : 0.5;
  const b = r && fin(r.s) && r.s > 0 ? Math.min(5, Math.floor(r.s)) : 0;
  const stale = r && fin(r.last) ? Math.min(7, Math.max(0, Math.floor((now - r.last) / DAY_MS))) : 7;
  return ((0.15 + e) * BOXF[b]) * (1 + ((0.5 * stale) / 7));
}

function recordOf(records, id) {
  if (!isRec(records) || !Object.hasOwn(records, id)) return null;
  return isRec(records[id]) ? records[id] : null;
}

function pickCandidates({ ids, records, newAllowance }) {
  let fresh = newAllowance;
  return ids.filter((id) => {
    if (recordOf(records, id)) return true;
    if (fresh > 0) { fresh--; return true; }
    return false;
  });
}

function worstFirst(cands, records) {
  return cands
    .map((id, i) => ({ id, i, rec: recordOf(records, id) }))
    .filter((x) => x.rec && fin(x.rec.e) && eOf(x.rec) >= WORST_MIN_E)
    .sort((a, b) => eOf(b.rec) - eOf(a.rec) || a.i - b.i)
    .slice(0, WORST_MAX)
    .map((x) => x.id);
}

function drawIndex(weights, r) {
  const total = weights.reduce((a, b) => a + b, 0);
  const target = r * total;
  let run = 0;
  for (let i = 0; i < weights.length; i++) {
    run += weights[i];
    if (run > target) return i;
  }
  return weights.length - 1;
}

function sampleWeighted({ pool, weights, seed, count: want }) {
  let state = seed;
  const rest = pool.slice();
  const w = weights.slice();
  const out = [];
  while (out.length < want && rest.length) {
    const next = splitmix64(state);
    state = next.state;
    const at = drawIndex(w, unitRandom(next.value));
    out.push(rest[at]);
    rest.splice(at, 1);
    w.splice(at, 1);
  }
  return out;
}

// {ids, records, now, seed, limit, newAllowance} -> [id]
function weightedQueue(input) {
  const seed = parseSeed(input.seed);
  const { records, now } = input;
  const limit = count(input.limit);
  const ids = [...new Set(input.ids)];
  const cands = pickCandidates({ ids, records, newAllowance: count(input.newAllowance) });
  const head = worstFirst(cands, records).slice(0, limit);
  const taken = new Set(head);
  const pool = cands.filter((id) => !taken.has(id));
  const weights = pool.map((id) => weight({ rec: recordOf(records, id), now }));
  return head.concat(sampleWeighted({ pool, weights, seed, count: limit - head.length }));
}

module.exports = { drawIndex, weightedQueue, weight, splitmix64, unitRandom, BOXF, round4 };
