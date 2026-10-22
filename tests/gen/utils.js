'use strict';

// A number that is written to the vector file with a ".0" suffix (parsed as a float by Rust).
class Fl {
  constructor(n) { this.n = n; }
  toJSON() { return '__FLOAT__' + this.n + '__'; }
}

function toJson(obj) {
  return JSON.stringify(obj, null, 2).replace(/"__FLOAT__(-?\d+)__"/g, '$1.0') + '\n';
}

function assertUnique(cases, groupName) {
  const names = cases.map(c => c.name);
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) {
      console.error(`Duplicate case name '${n}' in ${groupName}`);
      process.exit(1);
    }
    seen.add(n);
  }
}

function noonMsOf(dateKey) {
  const parts = dateKey.split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2], 12);
}

// Re-export from oracle modules
const { splitmix64Js, drawTierJs, sampleJs, scoreJs } = require('./oracles/exam.js');
const { normalizeJs, gapVerdictJs } = require('./oracles/check.js');
const { fnv1aJs, pickDrillJs, unitQueueOracle } = require('./oracles/srs.js');

// A vector case whose expectation is the oracle applied to the input.
function oracleCase(name, input, oracle) {
  return { name, input, expect: oracle(input), source: 'spec' };
}

// A vector case with a literal expectation.
function vec(name, input, expect, source = 'spec') {
  return { name, input, expect, source };
}

// splitmix64 vector: the first n outputs (as decimal strings) from a decimal seed string.
function splitmixCase(name, seed, n) {
  let state = BigInt(seed);
  const expect = [];
  for (let i = 0; i < n; i++) {
    const r = splitmix64Js(state);
    state = r.newState;
    expect.push(r.value.toString());
  }
  return { name, input: { seed, n }, expect, source: 'spec' };
}

module.exports = {
  oracleCase, splitmixCase, vec,
  Fl, toJson, assertUnique, noonMsOf,
  fnv1aJs, pickDrillJs, splitmix64Js,
  normalizeJs, gapVerdictJs,
  drawTierJs, sampleJs, scoreJs,
  unitQueueOracle
};
