'use strict';

const { round4 } = require('./timer.js');

const MAX_INT = Number.MAX_SAFE_INTEGER;
const CF_MAX_KEYS = 8;
const CF_MAX_LEN = 16;
const WS = '\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const TRIM = new RegExp(`^[${WS}]+|[${WS}]+$`, 'g');

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const validKey = (k) => typeof k === 'string' && [...k].length >= 1 && [...k].length <= CF_MAX_LEN;
const validCount = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_INT;

function normalizeCf(cf) {
  if (!Array.isArray(cf)) return [];
  const seen = new Set();
  const out = [];
  for (const p of cf) {
    if (!Array.isArray(p) || p.length !== 2 || !validKey(p[0]) || !validCount(p[1])) continue;
    if (seen.has(p[0])) continue;
    seen.add(p[0]);
    out.push([p[0], p[1]]);
  }
  return out;
}

function addConfusion(cfIn, key) {
  const cf = normalizeCf(cfIn);
  const at = cf.findIndex((p) => p[0] === key);
  if (at >= 0) cf[at][1] = Math.min(MAX_INT, cf[at][1] + 1);
  else cf.push([key, 1]);
  while (cf.length > CF_MAX_KEYS) {
    let drop = -1;
    cf.forEach((p, i) => {
      if (p[0] !== key && (drop < 0 || p[1] < cf[drop][1])) drop = i;
    });
    cf.splice(drop, 1);
  }
  return cf;
}

// {rec, correct, given, timedOut, weighted} -> new rec; s/due/ok/bad/last and unknown fields untouched
function applyExtras({ rec, correct, given, timedOut, weighted }) {
  const out = isObj(rec) ? { ...rec } : {};
  const ok = correct === true;
  if (weighted === true) {
    const e0 = Number.isFinite(out.e) ? Math.min(1, Math.max(0, out.e)) : 0.5;
    out.e = round4((0.7 * e0) + (0.3 * (ok ? 0 : 1)));
  }
  if (!ok && timedOut !== true && typeof given === 'string') {
    const key = given.replace(TRIM, '');
    if (validKey(key)) out.cf = addConfusion(out.cf, key);
  }
  if (timedOut === true) {
    const t = Number.isFinite(out.to) && out.to >= 0 ? Math.floor(out.to) : 0;
    out.to = Math.min(MAX_INT, t + 1);
  }
  return out;
}

module.exports = { applyExtras };
