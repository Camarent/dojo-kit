'use strict';

const { weightedQueue, weight, unitRandom, splitmix64, drawIndex } = require('../../../tools/reference/weighted.js');

const NOW = 1000 * 86400000;
const D = 86400000;
const q = (name, input) => ({ name, input, expect: weightedQueue(input), source: 'reference' });
const w = (name, input) => ({ name, input, expect: weight(input), source: 'reference' });
const Q = (o) => ({ ids: [], records: {}, now: NOW, seed: '1', limit: 10, newAllowance: 0, ...o });
const rec = (s, e, daysAgo) => ({ s, e, last: NOW - daysAgo * D, due: 0 });

function weightCases() {
  return [
    w('new item 0.975', { rec: undefined, now: NOW }),
    w('e .455 b1 stale 0 -> 0.4278', { rec: rec(1, 0.455, 0), now: NOW }),
    w('b clamps at 5', { rec: rec(9, 0.5, 0), now: NOW }),
    w('b 5 exact', { rec: rec(5, 0.5, 0), now: NOW }),
    w('b 3 odd', { rec: rec(3, 0.5, 0), now: NOW }),
    w('b 0', { rec: rec(0, 0.5, 0), now: NOW }),
    w('stale clamps at 7', { rec: rec(0, 0.5, 30), now: NOW }),
    w('stale floor 3', { rec: rec(0, 0.5, 3.9), now: NOW }),
    w('stale negative clamps to 0', { rec: rec(0, 0.5, -4), now: NOW }),
    w('record without e', { rec: { s: 1, last: NOW }, now: NOW }),
    w('record null is new', { rec: null, now: NOW }),
    w('record array is new', { rec: [1], now: NOW }),
    w('s 2.5 floors to b 2', { rec: rec(2.5, 0.5, 0), now: NOW }),
    w('e 2 clamps to 1', { rec: rec(0, 2, 0), now: NOW }),
    w('e -1 clamps to 0', { rec: rec(0, -1, 0), now: NOW }),
    w('last string -> stale 7', { rec: { s: 0, e: 0.5, last: 'x' }, now: NOW }),
    w('b3 stale 6 op order', { rec: rec(3, 0.5, 6), now: NOW }),
    w('b1 stale 4 op order', { rec: rec(1, 0.65, 4), now: NOW }),
    w('s negative treated as b 0', { rec: { s: -1, e: 0.5, last: NOW }, now: NOW }),
    w('record without last', { rec: { s: 1, e: 0.5 }, now: NOW })
  ];
}

function queueCases() {
  const seen = { a: rec(1, 0.9, 1), b: rec(0, 0.5, 2), c: rec(2, 0.1, 3), d: rec(1, 0.5, 9) };
  const many = {};
  for (let i = 0; i < 8; i++) many['m' + i] = rec(0, 0.9 - i * 0.05, i);
  return [
    q('empty input', Q({})),
    q('limit 0', Q({ ids: ['a'], records: { a: seen.a }, limit: 0 })),
    q('new allowance input order', Q({ ids: ['n1', 'n2', 'n3', 'n4'], newAllowance: 2 })),
    q('no allowance skips new', Q({ ids: ['n1', 'a'], records: { a: seen.a } })),
    q('limit above candidates', Q({ ids: ['a', 'b', 'c', 'n1'], records: seen, newAllowance: 5, limit: 50 })),
    q('worst first order', Q({ ids: ['c', 'b', 'a', 'd'], records: seen })),
    q('worst first ties input order', Q({ ids: ['d', 'b'], records: seen })),
    q('worst first threshold 0.3', Q({ ids: ['x', 'y'], records: { x: rec(0, 0.3, 0), y: rec(0, 0.2999, 0) } })),
    q('worst first max five', Q({ ids: Object.keys(many), records: many, limit: 6 })),
    q('worst first capped by limit', Q({ ids: Object.keys(many), records: many, limit: 2 })),
    q('new items not worst first', Q({ ids: ['n1', 'c'], records: seen, newAllowance: 1, limit: 1 })),
    q('seed 0 sampling', Q({ ids: ['c', 'd', 'n1', 'n2'], records: seen, newAllowance: 2, seed: '0', limit: 3 })),
    q('seed 42 sampling', Q({ ids: ['c', 'd', 'n1', 'n2'], records: seen, newAllowance: 2, seed: '42', limit: 3 })),
    q('seed big', Q({ ids: ['c', 'd', 'n1', 'n2'], records: seen, newAllowance: 2, seed: '18446744073709551615', limit: 4 })),
    q('only new seed 7', Q({ ids: ['n1', 'n2', 'n3', 'n4', 'n5'], newAllowance: 5, seed: '7', limit: 5 })),
    q('sampling deterministic repeat', Q({ ids: ['c', 'd', 'n1', 'n2'], records: seen, newAllowance: 2, seed: '42', limit: 3 })),
    q('stale clamp matters', Q({ ids: ['x', 'y'], records: { x: rec(0, 0.1, 100), y: rec(0, 0.1, 0) }, seed: '3', limit: 2 })),
    q('duplicate ids', Q({ ids: ['a', 'a', 'b', 'a', 'n1', 'n1'], records: seen, newAllowance: 5, seed: '9' })),
    q('limit -1', Q({ ids: ['a', 'b'], records: seen, limit: -1 })),
    q('limit 2.7 floors', Q({ ids: ['a', 'b', 'c', 'd'], records: seen, limit: 2.7 })),
    q('limit string -> 0', Q({ ids: ['a'], records: seen, limit: '3' })),
    q('newAllowance 1.9 floors', Q({ ids: ['n1', 'n2', 'n3'], newAllowance: 1.9 })),
    q('null record is new', Q({ ids: ['x', 'n1'], records: { x: null }, newAllowance: 1, seed: '4' })),
    q('null record without allowance skipped', Q({ ids: ['x'], records: { x: null } })),
    q('array record is new', Q({ ids: ['x'], records: { x: [1] }, newAllowance: 1 })),
    q('prototype names are new', Q({ ids: ['constructor', 'toString', '__proto__'], records: {} })),
    q('prototype names with allowance', Q({ ids: ['constructor', 'toString'], records: {}, newAllowance: 1 })),
    q('s 2.5 acts as b 2', Q({ ids: ['x', 'y', 'z'], records: { x: { s: 2.5, e: 0.2, last: NOW }, y: { s: 2, e: 0.2, last: NOW }, z: { s: 3, e: 0.2, last: NOW } }, seed: '11' })),
    q('e 2 clamps to 1', Q({ ids: ['x', 'y'], records: { x: { s: 0, e: 2, last: NOW }, y: { s: 0, e: 1, last: NOW } }, seed: '12' })),
    q('e -1 clamps to 0 (not worst-first)', Q({ ids: ['x', 'y'], records: { x: { s: 0, e: -1, last: NOW }, y: { s: 0, e: 0.2, last: NOW } }, seed: '12' })),
    q('record without last stale 7', Q({ ids: ['x', 'y'], records: { x: { s: 0, e: 0.1 }, y: { s: 0, e: 0.1, last: NOW } }, seed: '13' })),
    q('records without e are not worst-first', Q({ ids: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b'], records: { a1: { s: 0 }, a2: { s: 0 }, a3: { s: 0 }, a4: { s: 0 }, a5: { s: 0 }, a6: { s: 0 }, b: { s: 0, e: 0.4 } }, limit: 1 })),
    q('b clamp at 5 sampling', Q({ ids: ['x', 'y'], records: { x: rec(50, 0.1, 0), y: rec(5, 0.1, 0) }, seed: '3', limit: 2 }))
  ];
}

function splitmixCases() {
  const { splitmix64 } = require('../../../tools/reference/weighted.js');
  const mk = (name, seed, n) => {
    let state = BigInt(seed);
    const expect = [];
    for (let i = 0; i < n; i++) { const r = splitmix64(state); state = r.state; expect.push(r.value.toString()); }
    return { name, input: { seed, n }, expect, source: 'reference' };
  };
  return [mk('seed 0 first 3', '0', 3), mk('seed 42 first 3', '42', 3)];
}

function unitRandomCases() {
  const mk = (seed) => {
    let state = BigInt(seed);
    const expect = [];
    for (let i = 0; i < 3; i++) { const r = splitmix64(state); state = r.state; expect.push(unitRandom(r.value)); }
    return { name: 'seed ' + seed, input: { seed, n: 3 }, expect, source: 'reference' };
  };
  return ['0', '42', '18446744073709551615'].map(mk);
}

function drawIndexCases() {
  const d = (name, weights, r) => ({ name, input: { weights, r }, expect: drawIndex(weights, r), source: 'reference' });
  const u = [0.9750000000000001, 0.9750000000000001, 0.9750000000000001, 0.4285714285714286];
  return [
    d('left-to-right total r low', u, 0.29073482428115016),
    d('left-to-right total r mid', u, 0.5814696485623003),
    d('strict greater at boundary', [0.25, 0.5, 0.25], 0.25),
    d('r zero', [0.25, 0.5, 0.25], 0)
  ];
}

function makeWeightedCases() {
  return { groups: [
    { fn: 'weight', cases: weightCases() },
    { fn: 'weightedQueue', cases: queueCases() },
    { fn: 'splitmix64', cases: splitmixCases() },
    { fn: 'unitRandom', cases: unitRandomCases() },
    { fn: 'drawIndex', cases: drawIndexCases() }
  ] };
}

module.exports = { makeWeightedCases };
