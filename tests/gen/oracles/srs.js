'use strict';

const { MASK64, T0 } = require('../const.js');
const { splitmix64Js } = require('./exam.js');
const progress = require('../../../tools/reference/progress.js');

// Seeded member pick of the scoped queue (mirror of groups::shuffle_entities / srs::pick_drill).
function fnv1aJs(text) {
  let h = 0xcbf29ce484222325n;
  for (const b of Buffer.from(text, 'utf8')) h = ((h ^ BigInt(b)) * 0x100000001b3n) & MASK64;
  return h;
}

function pickDrillJs({ members, n, courseId, day, entity }) {
  const list = members.slice();
  if (list.length > 1) {
    let state = fnv1aJs(courseId + '|' + day + '|' + entity);
    for (let i = list.length - 1; i >= 1; i--) {
      const r = splitmix64Js(state);
      state = r.newState;
      const j = Number(r.value % BigInt(i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  return list.slice(0, Math.max(n, 1));
}

// Unit queue oracle
function unitQueueOracle({ items, ord, allowance, caps, itemUnits }) {
  const due = ord.filter((id) => items[id] && items[id].due <= T0)
    .sort((x, y) => items[x].due - items[y].due);
  const used = {};
  const fresh = [];
  for (const id of ord) {
    if (fresh.length >= allowance) break;
    if (items[id]) continue;
    const u = itemUnits[id];
    if (u !== undefined && Object.prototype.hasOwnProperty.call(caps, u)) {
      if ((used[u] || 0) >= caps[u]) continue;
      used[u] = (used[u] || 0) + 1;
    }
    fresh.push(id);
  }
  return { due: due, fresh: fresh };
}

// Draft oracle helpers
const BOUND = 32;

function isValidDraft(d) {
  return d !== null && typeof d === 'object' && !Array.isArray(d) && typeof d.sid === 'string' && typeof d.updatedAt === 'number';
}

function isClosedDraft(d) {
  return typeof d.closed === 'string';
}

function withoutClosedSids(d) {
  const c = JSON.parse(JSON.stringify(d));
  delete c.closedSids;
  return c;
}

// Sort key of a candidate: greater key wins. Closed reason "expired" is the bottom reason.
function draftKey(d) {
  const closed = isClosedDraft(d);
  const tail = closed
    ? [d.closed === 'expired' ? 0 : 1, d.closed]
    : [Array.isArray(d.answers) ? d.answers.length : 0, progress.stableJson(withoutClosedSids(d))];
  return [d.updatedAt, d.sid, closed ? 1 : 0].concat(tail);
}

function keyCmp(ka, kb) {
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

// Expected merged doc for a LIST of docs (n-ary, so every fold order must equal it):
// generic merge from the reference for everything but examDraft;
// examDraft = greatest candidate + bounded set of closed sids.
function draftExpectAll(docs, ref) {
  let out = JSON.parse(JSON.stringify(docs[0]));
  for (let i = 1; i < docs.length; i++) out = JSON.parse(JSON.stringify(ref('merge', out, docs[i])));
  const reset = Math.max.apply(null, docs.map((d) => d.resetAt || 0));
  const fresh = (t) => reset === 0 || t >= reset;
  const valid = docs.map((d) => d.examDraft).filter(isValidDraft);
  const closedAt = {};
  const cands = [];
  valid.forEach((d) => {
    (Array.isArray(d.closedSids) ? d.closedSids : []).filter(isValidDraft).forEach((e) => {
      if (!fresh(e.updatedAt)) return;
      closedAt[e.sid] = Math.max(closedAt[e.sid] === undefined ? -Infinity : closedAt[e.sid], e.updatedAt);
      cands.push({ sid: e.sid, updatedAt: e.updatedAt, closed: 'expired' });
    });
    if (!fresh(d.updatedAt)) return;
    if (isClosedDraft(d)) {
      closedAt[d.sid] = Math.max(closedAt[d.sid] === undefined ? -Infinity : closedAt[d.sid], d.updatedAt);
      cands.push({ sid: d.sid, updatedAt: d.updatedAt, closed: d.closed });
    } else {
      cands.push(d);
    }
  });
  if (!cands.length) {
    if (valid.length) delete out.examDraft;
    return out;
  }
  const best = cands.reduce((m, d) => (keyCmp(draftKey(d), draftKey(m)) > 0 ? d : m));
  const list = Object.keys(closedAt)
    .map((sid) => ({ sid: sid, updatedAt: closedAt[sid] }))
    .sort((x, y) => keyCmp([x.updatedAt, x.sid], [y.updatedAt, y.sid]))
    .slice(-BOUND);
  const slot = JSON.parse(JSON.stringify(best));
  delete slot.closedSids;
  if (list.length) slot.closedSids = list;
  out.examDraft = slot;
  return out;
}

module.exports = {
  fnv1aJs,
  pickDrillJs,
  unitQueueOracle,
  // Draft oracles
  BOUND,
  isValidDraft,
  isClosedDraft,
  withoutClosedSids,
  draftKey,
  keyCmp,
  draftExpectAll
};
