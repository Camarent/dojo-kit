'use strict';

const T0 = 1760000000000;
const H = 3600000;
const D = 86400000;

const INTERVALS = [0, 4 * H, D, 3 * D, 7 * D, 14 * D, 30 * D];

// u64 constants for splitmix64
const SPLITMIX64_INC = 0x9e3779b97f4a7c15n;
const SPLITMIX64_MUL1 = 0xbf58476d1ce4e5b9n;
const SPLITMIX64_MUL2 = 0x94d049bb133111ebn;

// Mask for 64-bit unsigned integers
const MASK64 = (1n << 64n) - 1n;

module.exports = {
  T0, H, D, INTERVALS,
  SPLITMIX64_INC, SPLITMIX64_MUL1, SPLITMIX64_MUL2, MASK64
};
