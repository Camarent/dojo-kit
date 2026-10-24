'use strict';

const { applyExtras } = require('../../../tools/reference/extras.js');

const ex = (name, input) => ({ name, input, expect: applyExtras(input), source: 'reference' });
const A = (rec, o = {}) => ({ rec, correct: false, given: 'x', timedOut: false, weighted: false, ...o });
const base = { s: 2, due: 5, ok: 3, bad: 1, last: 99 };
const pairs = (n, from = 2) => Array.from({ length: n }, (_, i) => ['k' + i, i + from]);
const same8 = ['m', 'z', 'a', 'b', 'c', 'd', 'e', 'f'].map((k) => [k, 1]);

function eCases() {
  return [
    ex('e default wrong', A({}, { weighted: true })),
    ex('e default correct', A({}, { weighted: true, correct: true, given: '' })),
    ex('e 0.5 wrong 0.65', A({ e: 0.5 }, { weighted: true })),
    ex('e 0.65 correct 0.455', A({ e: 0.65 }, { weighted: true, correct: true })),
    ex('e not touched when not weighted', A({ e: 0.5 })),
    ex('e absent not created when not weighted', A(base, { correct: true })),
    ex('e rounds to 4 places', A({ e: 0.1234 }, { weighted: true, correct: true })),
    ex('e -1 wrong clamps to 0.3', A({ e: -1 }, { weighted: true })),
    ex('e 2 correct clamps to 0.7', A({ e: 2 }, { weighted: true, correct: true })),
    ex('e string uses default', A({ e: 'x' }, { weighted: true })),
    ex('e NaN-like null uses default', A({ e: null }, { weighted: true })),
    ex('timed out weighted raises e', A({ e: 0.2 }, { timedOut: true, weighted: true })),
    ex('weighted flag 1 is not set', A({ e: 0.5 }, { weighted: 1 })),
    ex('correct 1 handled as wrong', A({ e: 0.5 }, { weighted: true, correct: 1 }))
  ];
}

function cfCases() {
  return [
    ex('cf wrong counts', A(base, { given: 'abc' })),
    ex('cf trims', A(base, { given: '  abc  ' })),
    ex('cf increments existing in place', A({ cf: [['q', 1], ['abc', 2], ['r', 1]] }, { given: 'abc' })),
    ex('cf 16 chars counts', A(base, { given: 'a'.repeat(16) })),
    ex('cf 17 chars ignored', A(base, { given: 'a'.repeat(17) })),
    ex('cf emoji x9 counted', A(base, { given: '😀'.repeat(9) })),
    ex('cf emoji x16 counted', A(base, { given: '😀'.repeat(16) })),
    ex('cf emoji x17 ignored', A(base, { given: '😀'.repeat(17) })),
    ex('cf BOM kept as 3-code-point key', A(base, { given: '﻿ab' })),
    ex('cf NEL trimmed', A(base, { given: '\u0085ab' })),
    ex('cf ideographic space trimmed', A(base, { given: '　ab　' })),
    ex('cf empty given ignored', A(base, { given: '' })),
    ex('cf blank given ignored', A(base, { given: '   ' })),
    ex('cf number given ignored', A(base, { given: 123 })),
    ex('cf correct ignored', A(base, { correct: true, given: 'abc' })),
    ex('cf timed out not counted', A(base, { timedOut: true, given: 'abc' })),
    ex('cf key constructor stored', A(base, { given: 'constructor' })),
    ex('cf key __proto__ stored', A(base, { given: '__proto__' })),
    ex('cf key toString stored', A({ cf: [['toString', 1]] }, { given: 'toString' }))
  ];
}

function cfNormalizeCases() {
  return [
    ex('cf object normalised to list', A({ cf: { a: 1 } })),
    ex('cf bad entries dropped', A({ cf: [['a'], ['b', 0], ['c', 1.5], [1, 2], ['d', 1, 9], ['ok', 3]] })),
    ex('cf duplicate keeps first', A({ cf: [['a', 1], ['a', 5]] }, { given: 'zz' })),
    ex('cf string value becomes list', A({ cf: 'str' })),
    ex('cf null becomes list', A({ cf: null })),
    ex('cf malformed copied when rule does not fire', A({ cf: { a: 1 } }, { correct: true })),
    ex('cf count 2^53-1 increment stays', A({ cf: [['a', 9007199254740991]] }, { given: 'a' })),
    ex('cf key too long in storage dropped', A({ cf: [['a'.repeat(17), 2], ['b', 1]] }))
  ];
}

const WSALL = '\t\n\u000b\f\r \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000';

function cfEvictCases() {
  return [
    ex('cf 8 entries plus new evicts lowest other', A({ cf: pairs(8) }, { given: 'zz' })),
    ex('cf eviction tie earliest index', A({ cf: same8 }, { given: 'q' })),
    ex('cf ten tampered entries keeps new key', A({ cf: pairs(10) }, { given: 'new' })),
    ex('cf existing key at eight increments in place', A({ cf: pairs(8) }, { given: 'k3' })),
    ex('cf tampered nine excludes only new key keeps existing', A({ cf: pairs(9, 1) }, { given: 'k0' })),
    ex('cf dedupe judged among kept entries', A({ cf: [['a', 0], ['a', 3]] }, { given: 'zz' })),
    ex('given all 25 white space chars trimmed', A({}, { given: WSALL + 'ab' + WSALL })),
    ex('cf integer-like keys keep insertion order', A({ cf: [['zz', 1], ['87', 1]] }, { given: '9' })),
    ex('cf integer-like keys full list', A({ cf: [['zz', 1], ['87', 1], ['9', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 1], ['f', 1]] }, { given: '5' }))
  ];
}

function toCases() {
  return [
    ex('to first', A(base, { timedOut: true })),
    ex('to increments', A({ to: 2 }, { timedOut: true })),
    ex('to not on plain wrong', A({ to: 2 })),
    ex('to string 3 -> 1', A({ to: '3' }, { timedOut: true })),
    ex('to negative -> 1', A({ to: -2 }, { timedOut: true })),
    ex('to 2.7 -> 3', A({ to: 2.7 }, { timedOut: true })),
    ex('to 2^53-1 stays', A({ to: 9007199254740991 }, { timedOut: true })),
    ex('timedOut 1 is not set', A({ to: 2 }, { timedOut: 1 }))
  ];
}

function recCases() {
  return [
    ex('untouched fields kept', A(base, { weighted: true, timedOut: true })),
    ex('unknown fields kept', A({ ...base, zz: { n: 1 }, q: 'k' }, { weighted: true, given: 'w' })),
    ex('empty rec timed out', A({}, { timedOut: true, given: '' })),
    ex('rec null timed out', A(null, { timedOut: true })),
    ex('rec array becomes empty', A([1, 2], { weighted: true })),
    ex('rec absent', { correct: false, given: 'x', timedOut: false, weighted: true })
  ];
}

function makeExtrasCases() {
  const cases = [...eCases(), ...cfCases(), ...cfNormalizeCases(), ...cfEvictCases(), ...toCases(), ...recCases()];
  return { groups: [{ fn: 'applyExtras', cases }] };
}

module.exports = { makeExtrasCases };
