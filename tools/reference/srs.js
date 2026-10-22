/*
 * srs.js — spaced-repetition rules (pure functions, no DOM, no storage).
 * Runs in the browser (window.SRS) and in Node (module.exports).
 *
 * Progress record per item: { s: stage 0..6, due: ms, ok: n, bad: n, last: ms }
 * Stage intervals: 0 → 4h → 1d → 3d → 7d → 14d → mastered (30d).
 */
(function (root) {
  'use strict';

  var HOUR = 3600 * 1000;
  var DAY = 24 * HOUR;
  var INTERVALS = [0, 4 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  var MAX_STAGE = 6;
  var MASTERED = 6;
  var PLACEMENT_STAGE = 4;

  function clampStage(s) {
    return Math.max(0, Math.min(MAX_STAGE, s | 0));
  }

  /** True when the item has ever been answered correctly or reached stage >= 1. */
  function everLearned(rec) {
    return !!rec && ((rec.ok | 0) > 0 || (rec.s | 0) > 0);
  }

  /**
   * Applies one graded answer and returns a NEW record.
   * Correct: stage + 1. Wrong: stage - 2, minimum 1 if the item was ever learned, else 0.
   * due = now + interval(new stage).
   */
  function applyAnswer(rec, correct, now) {
    var s = rec ? rec.s | 0 : 0;
    var ns;
    if (correct) {
      ns = clampStage(s + 1);
    } else {
      ns = s - 2;
      ns = Math.max(ns, everLearned(rec) ? 1 : 0);
      ns = clampStage(ns);
    }
    var out = {};
    if (rec && typeof rec === 'object') Object.keys(rec).forEach(function (k) { out[k] = rec[k]; });
    out.s = ns;
    out.due = now + INTERVALS[ns];
    out.ok = (rec ? rec.ok | 0 : 0) + (correct ? 1 : 0);
    out.bad = (rec ? rec.bad | 0 : 0) + (correct ? 0 : 1);
    out.last = now;
    return out;
  }

  /**
   * Grades the first answer to an item in any training mode (daily, «Ещё», practice — CONTRACT Round 5a):
   * - no record or due → applyAnswer (normal SRS);
   * - started and not due → correct: stage and due unchanged, ok + 1, last = now (no early promotion);
   *   wrong: applyAnswer (stage − 2, floor 1 when ever learned; bad + 1).
   * Returns a NEW record; extra fields of a not-due record are kept on a correct answer.
   */
  function applyPractice(rec, correct, now) {
    if (!rec || typeof rec !== 'object' || typeof rec.due !== 'number' || rec.due <= now) return applyAnswer(rec, correct, now);
    if (!correct) return applyAnswer(rec, false, now);
    var out = {};
    Object.keys(rec).forEach(function (k) { out[k] = rec[k]; });
    out.ok = (rec.ok | 0) + 1;
    out.last = now;
    return out;
  }

  /** True when introducing this item counts toward the daily new limit: only answers in the daily/«Ещё» flow (mode 'srs'). */
  function countsTowardDailyNew(mode, rec) {
    return mode === 'srs' && !rec;
  }

  /**
   * A later correct answer to an item re-queued in the same session.
   * Only an item that fell to stage 0 is promoted (to stage 1); otherwise the
   * record is returned unchanged, so wrong-then-right never beats a first-try answer.
   */
  function applyRelearn(rec, now) {
    if (!rec || (rec.s | 0) > 0) return rec;
    return { s: 1, due: now + INTERVALS[1], ok: rec.ok | 0, bad: rec.bad | 0, last: now };
  }

  /** Record for an item marked "known" in the placement check (stage 4, due spread over ~4–10 days). */
  function placementKnown(rec, now, rand) {
    var r = typeof rand === 'number' ? rand : Math.random();
    var s = Math.max(PLACEMENT_STAGE, rec ? rec.s | 0 : 0);
    var spread = INTERVALS[PLACEMENT_STAGE] * (0.6 + 0.8 * r);
    return { s: s, due: now + Math.round(spread), ok: rec ? rec.ok | 0 : 0, bad: rec ? rec.bad | 0 : 0, last: now };
  }

  /**
   * Applies placement marking to a record.
   * - known = true: move to stage 4 (or highest <= 4), with due spread over a deterministic window.
   * - known = false: return record unchanged.
   * - Idempotent: never lower an existing stage.
   * Uses splitmix64 seeded PRNG for deterministic spreading.
   */
  function applyPlacement(rec, known, now, ladder, seed) {
    if (!known) {
      return rec === null || rec === undefined ? null : Object.assign({}, rec);
    }
    if (!rec || typeof rec !== 'object') {
      rec = { s: 0, ok: 0, bad: 0 };
    }
    var ladderToUse = ladder || INTERVALS;
    var maxStage = Math.max(0, ladderToUse.length - 1);
    var target = Math.min(4, maxStage);
    var currentStage = rec.s | 0;
    
    // Idempotent: if already at or past target, return unchanged
    if (currentStage >= target) {
      return Object.assign({}, rec);
    }
    
    // Seed is a decimal u64 (string, or a safe non-negative integer number); matches Rust `str::parse::<u64>`.
    var seedStr = String(seed);
    if (!/^\d+$/.test(seedStr) || BigInt(seedStr) >= (1n << 64n)) {
      throw new Error('seed must be a decimal u64');
    }
    var state = BigInt(seedStr);
    
    // One iteration of splitmix64 (standard algorithm)
    // Must mask after each operation to stay within 64 bits
    state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    var z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    var randValue = (z ^ (z >> 31n)) & 0xffffffffffffffffn;
    
    // Convert to [0, 1) to match Rust's (randValue as f64) / (u64::MAX as f64)
    // Use upper 53 bits to avoid precision loss when converting BigInt to Number
    // Shift right by 11 to get upper 53 bits, then divide by 2^53
    var upper53 = randValue >> 11n;
    var max53 = 1n << 53n; // 2^53
    var rand = Number(upper53) / Number(max53);
    var targetInterval = ladderToUse[target] || 0;
    var spread = targetInterval * (0.6 + 0.8 * rand);
    var due = now + Math.round(spread);
    
    var out = Object.assign({ ok: 0, bad: 0 }, rec);
    out.s = target;
    out.due = due;
    out.last = now;
    return out;
  }

  function isDue(rec, now) {
    return !!rec && rec.due <= now;
  }

  function isNew(rec) {
    return !rec;
  }

  /**
   * Today's queue.
   * items: progress map {id: rec}; order: result of orderNew; newAllowance: how many new items.
   * Returns { due: [ids sorted by due asc], fresh: [ids] }.
   */
  function buildQueue(items, order, now, newAllowance) {
    items = items || {};
    var due = [];
    var knownIds = Object.create(null);
    order.forEach(function (id) { knownIds[id] = true; });
    Object.keys(items).forEach(function (id) {
      if (knownIds[id] && isDue(items[id], now)) due.push(id);
    });
    due.sort(function (a, b) { return items[a].due - items[b].due; });
    var fresh = [];
    var n = Math.max(0, newAllowance | 0);
    for (var i = 0; i < order.length && fresh.length < n; i++) {
      if (isNew(items[order[i]])) fresh.push(order[i]);
    }
    return { due: due, fresh: fresh };
  }

  /** Weakness score: items answered wrong at least once, worst first. */
  function weakest(items, limit, validIds) {
    items = items || {};
    var list = Object.keys(items).filter(function (id) {
      var r = items[id];
      return r && (r.bad | 0) > 0 && (!validIds || validIds[id]);
    });
    var score = function (r) {
      var ok = r.ok | 0, bad = r.bad | 0;
      return (bad + 1) / (ok + bad + 2) + (r.s < 3 ? 0.1 : 0);
    };
    list.sort(function (a, b) {
      return score(items[b]) - score(items[a]) || (items[b].bad | 0) - (items[a].bad | 0) || (items[b].last || 0) - (items[a].last || 0);
    });
    return list.slice(0, limit == null ? 10 : limit);
  }

  /** Local calendar date key "YYYY-MM-DD". */
  function dayKey(ms) {
    var d = new Date(ms);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /** Consecutive study days ending today (or yesterday, if today has no study yet). days: {dayKey: count}. */
  function streak(days, now) {
    days = days || {};
    var d = new Date(now);
    d.setHours(12, 0, 0, 0);
    if (!days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1);
    var n = 0;
    while (days[dayKey(d.getTime())]) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  var api = {
    HOUR: HOUR,
    DAY: DAY,
    INTERVALS: INTERVALS,
    MAX_STAGE: MAX_STAGE,
    MASTERED: MASTERED,
    PLACEMENT_STAGE: PLACEMENT_STAGE,
    everLearned: everLearned,
    applyAnswer: applyAnswer,
    applyRelearn: applyRelearn,
    applyPractice: applyPractice,
    countsTowardDailyNew: countsTowardDailyNew,
    placementKnown: placementKnown,
    applyPlacement: applyPlacement,
    isDue: isDue,
    isNew: isNew,
    buildQueue: buildQueue,
    weakest: weakest,
    dayKey: dayKey,
    streak: streak
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SRS = api;
})(typeof self !== 'undefined' ? self : this);
