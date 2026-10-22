/*
 * progress.js — the progress document: defaults, lossless sanitize, merge, comparison (pure functions).
 * Runs in the browser (window.ProgressDoc) and in Node (module.exports).
 *
 * Document: { v:1, t, resetAt, items:{id:{s,due,ok,bad,last}}, stats:{days, newByDay, gNewByDay, …}, settings:{…},
 *            exams?:{ "<exam>-<timestamp>": {exam, mode, date, raw, scaled, pass, …} } }
 * Schema changes are additive only; unknown fields and ids are preserved.
 */
(function (root) {
  'use strict';

  var DAY_LOG_KEEP = 150;
  /** stats fields shaped { "YYYY-MM-DD": count } — merged by max per day. */
  var DAY_STATS = ['days', 'newByDay', 'gNewByDay'];

  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }

  function emptyProgress() {
    return {
      v: 1, t: 0, resetAt: 0,
      items: {},
      stats: { days: {}, newByDay: {} },
      settings: { newPerDay: 10, placementDone: false, t: 0 }
    };
  }

  function validRec(r) {
    return !!r && typeof r === 'object' && typeof r.s === 'number' && typeof r.due === 'number';
  }

  /** Highest stage of a record: grammar point records (gp-…) use the 0..8 ladder, everything else 0..6. */
  function maxStage(id) { return String(id).indexOf('gp-') === 0 ? 8 : 6; }

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  /**
   * Coerces a stored object into a progress document, or returns null when it is not a v:1 progress doc.
   * Lossless for valid data: every item id is kept (known or not, valid record or not), extra fields on the
   * document, records, stats and settings are carried over unchanged; only the known numeric fields of a
   * valid record are type-normalized.
   */
  function sanitize(p) {
    if (!isObj(p) || p.v !== 1 || !isObj(p.items)) return null;
    var out = clone(p);
    out.t = +p.t || 0;
    out.resetAt = +p.resetAt || 0;
    out.items = {};
    Object.keys(p.items).forEach(function (id) {
      var r = p.items[id];
      if (validRec(r)) {
        var base = { s: Math.max(0, Math.min(maxStage(id), r.s | 0)), due: +r.due, ok: r.ok | 0, bad: r.bad | 0, last: +r.last || 0 };
        if (maxStage(id) === 8) {
          // gp- records: `ps` is a copy of the stage that an old client (clamping s to 6) leaves alone.
          if (typeof r.ps === 'number') base.ps = Math.max(0, Math.min(8, r.ps | 0));
          base.s = Math.max(0, Math.min(8, typeof r.ps === 'number' ? r.ps | 0 : r.s | 0));
        }
        out.items[id] = Object.assign(clone(r), base);
      } else {
        out.items[id] = r == null ? r : clone(r);
      }
    });
    out.stats = isObj(p.stats) ? clone(p.stats) : {};
    DAY_STATS.forEach(function (k) {
      var src = isObj(out.stats[k]) ? out.stats[k] : {};
      out.stats[k] = {};
      Object.keys(src).forEach(function (d) { if (/^\d{4}-\d\d-\d\d$/.test(d)) out.stats[k][d] = src[d] | 0; });
    });
    var se = isObj(p.settings) ? clone(p.settings) : {};
    se.newPerDay = typeof se.newPerDay === 'number' ? Math.max(0, Math.min(50, se.newPerDay | 0)) : 10;
    se.placementDone = !!se.placementDone;
    se.t = +se.t || 0;
    if ('kanjiReadings' in se && se.kanjiReadings !== 'n5' && se.kanjiReadings !== 'all') delete se.kanjiReadings;
    if ('ts' in se && !isObj(se.ts)) delete se.ts;
    out.settings = se;
    return out;
  }

  function pruneDays(obj) {
    var keys = Object.keys(obj).sort();
    while (keys.length > DAY_LOG_KEEP) delete obj[keys.shift()];
  }

  /** Stage of a record for tie-breaks: the higher of s and ps (gp- records). */
  function recStage(r) { return r && typeof r === 'object' ? Math.max(+r.s || 0, +r.ps || 0) : 0; }

  function recLast(r) { return r && typeof r === 'object' ? +r.last || 0 : 0; }

  /**
   * Merges two sanitized progress documents (e.g. this device and the cloud). Never loses data except
   * through an explicit reset/import (resetAt):
   * - items: union of ids; the record with the later `last` wins; records older than the newest reset are dropped;
   * - stats: max per day, from the sides that have seen the newest reset;
   * - settings: the whole object of the side with the newer reset, else the newer `t` (placementDone is OR-ed);
   * - unknown top-level fields: union, the newer side (by `t`) wins on conflict.
   */
  function merge(a, b) {
    var older = (a.t || 0) > (b.t || 0) ? b : a;
    var newer = older === a ? b : a;
    var out = Object.assign({}, clone(older), clone(newer));
    var resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
    out.v = 1;
    out.resetAt = resetAt;
    out.t = Math.max(a.t || 0, b.t || 0);
    out.items = {};
    out.stats = Object.assign({}, clone(older.stats), clone(newer.stats));
    DAY_STATS.forEach(function (k) { out.stats[k] = {}; });
    [a, b].forEach(function (src) {
      Object.keys(src.items).forEach(function (id) {
        var r = src.items[id];
        if (resetAt && recLast(r) < resetAt) return;
        if (!(id in out.items) || recLast(r) > recLast(out.items[id]) ||
            (recLast(r) === recLast(out.items[id]) && recStage(r) > recStage(out.items[id]))) out.items[id] = r;
      });
      if ((src.resetAt || 0) === resetAt) {
        DAY_STATS.forEach(function (k) {
          Object.keys(src.stats[k] || {}).forEach(function (d) {
            out.stats[k][d] = Math.max(out.stats[k][d] || 0, src.stats[k][d]);
          });
        });
      }
    });
    DAY_STATS.forEach(function (k) { pruneDays(out.stats[k]); });
    // Exam results: union by key over the sides that have seen the newest reset (a reset/import starts a new history).
    if (isObj(a.exams) || isObj(b.exams) || 'exams' in out) {
      out.exams = {};
      [a, b].forEach(function (src) {
        if ((src.resetAt || 0) !== resetAt || !isObj(src.exams)) return;
        Object.keys(src.exams).forEach(function (k) { if (!(k in out.exams)) out.exams[k] = clone(src.exams[k]); });
      });
    }
    var sa = a.settings, sb = b.settings;
    if ((a.resetAt || 0) !== (b.resetAt || 0)) {
      out.settings = clone((a.resetAt || 0) > (b.resetAt || 0) ? sa : sb);
    } else {
      out.settings = mergeSettings(sa, sb);
    }
    return clone(out);
  }

  /**
   * Per-field settings merge. A field's time is settings.ts[field] when present, else the side's settings.t
   * (docs written before ts existed). The later time wins per field; a field present on one side only is kept;
   * ties go to the side with the newer settings.t (then to `sa`). placementDone is OR-ed. t = max; ts = winners' times.
   */
  function mergeSettings(sa, sb) {
    var newerFirst = (sb.t || 0) > (sa.t || 0) ? [sb, sa] : [sa, sb];
    var fieldTime = function (se, f) { return se.ts && typeof se.ts[f] === 'number' ? se.ts[f] : (se.t || 0); };
    var out = {};
    var ts = {};
    var keys = {};
    [sa, sb].forEach(function (se) { Object.keys(se).forEach(function (k) { if (k !== 't' && k !== 'ts') keys[k] = true; }); });
    Object.keys(keys).forEach(function (f) {
      var best = null;
      newerFirst.forEach(function (se) {
        if (!(f in se)) return;
        if (!best || fieldTime(se, f) > fieldTime(best, f)) best = se;
      });
      out[f] = clone(best[f]);
      if (best.ts && typeof best.ts[f] === 'number') ts[f] = best.ts[f];
    });
    out.placementDone = !!(sa.placementDone || sb.placementDone);
    out.t = Math.max(sa.t || 0, sb.t || 0);
    if (Object.keys(ts).length) out.ts = ts;
    return out;
  }

  /** JSON with object keys sorted, so equal documents compare equal regardless of key order. */
  function stableJson(v) {
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stableJson(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  function sameProgress(a, b) {
    return stableJson(a) === stableJson(b);
  }


  var api = {
    DAY_STATS: DAY_STATS,
    emptyProgress: emptyProgress,
    validRec: validRec,
    sanitize: sanitize,
    merge: merge,
    stableJson: stableJson,
    sameProgress: sameProgress
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ProgressDoc = api;
})(typeof self !== 'undefined' ? self : this);
