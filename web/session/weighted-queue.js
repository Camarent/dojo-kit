/* session/weighted-queue.js — errorWeighted scheduler mode (contract 12.4) and record extras (12.3) for the study session engine.
 * Exports DojoSessionWeightedQueue: create(ctx) -> { weightedMode(unitId), weightedQueue({ids, newAllowance, limit}) -> [id],
 *   mixDaily(ids, fresh, groupId) -> ids, mixPractice(ids, limit) -> ids, weakByError(valid, limit) -> ids | null, extrasFor(item, writes, v) -> writes }.
 *   The seed comes from ctx.random. Ladder units are left in place; only ids of errorWeighted units are replaced.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var LIMIT = util.K.DEFAULT_PRACTICE_LIMIT;

  function create(ctx) {
    var modes = null;

    function modeTable() {
      if (!modes) {
        modes = {};
        (ctx.course.units || []).forEach(function (u) { modes[u.id] = ctx.fn.unitConfig(u.id).mode === 'errorWeighted'; });
      }
      return modes;
    }

    function weightedMode(unitId) {
      return modeTable()[unitId] === true;
    }

    function isWeightedId(id) {
      return !!ctx.byId[id] && weightedMode(ctx.byId[id].unit);
    }

    function anyWeighted() {
      return Object.keys(modeTable()).some(function (k) { return modeTable()[k]; });
    }

    function weightedQueue(opts) {
      var seed = String(Math.floor(ctx.random() * 9007199254740992));
      return ctx.dojo.call('weightedQueue', {
        ids: opts.ids, records: ctx.fn.records(), now: ctx.now(), seed: seed, limit: opts.limit, newAllowance: opts.newAllowance
      });
    }

    function mixDaily(ids, fresh, groupId) {
      if (!anyWeighted()) return ids;
      var inScope = function (id) {
        var it = ctx.byId[id];
        if (!it || !isWeightedId(id) || ctx.fn.unitIsExamOnly(it.unit)) return false;
        return groupId === undefined || groupId === null || ctx.unitGroup[it.unit] === groupId;
      };
      var wIds = ids.filter(inScope);
      var freshN = fresh.filter(inScope).length;
      var picked = weightedQueue({ ids: wIds, newAllowance: freshN, limit: LIMIT });
      return ids.filter(function (id) { return !isWeightedId(id); }).concat(picked);
    }

    function mixPractice(ids, limit) {
      if (!anyWeighted()) return ids.slice(0, limit);
      var picked = weightedQueue({ ids: ids.filter(isWeightedId), newAllowance: limit, limit: limit });
      return ids.filter(function (id) { return !isWeightedId(id); }).concat(picked).slice(0, limit);
    }

    function weakByError(valid, limit) {
      if (!anyWeighted()) return null;
      return weakRanked(ctx, valid, limit, isWeightedId);
    }

    function extrasFor(item, writes, v) {
      return extrasApply(ctx, { item: item, writes: writes, v: v }, weightedMode(item.unit));
    }

    return { weightedMode: weightedMode, weightedQueue: weightedQueue, mixDaily: mixDaily, mixPractice: mixPractice, weakByError: weakByError, extrasFor: extrasFor };
  }

  function weakRanked(ctx, valid, limit, isWeightedId) {
    var all = Object.keys(valid);
    var wIds = all.filter(isWeightedId);
    if (!wIds.length) return null;
    var recs = ctx.fn.records();
    var ranked = wIds.map(function (id, i) { return { id: id, e: recs[id] && recs[id].e, i: i }; })
      .filter(function (r) { return typeof r.e === 'number' && isFinite(r.e); })
      .sort(function (a, b) { return b.e - a.e || a.i - b.i; })
      .map(function (r) { return r.id; });
    var rest = {};
    all.forEach(function (id) { if (!isWeightedId(id)) rest[id] = true; });
    var ladder = Object.keys(rest).length ? ctx.dojo.call('weakest', { items: recs, limit: limit, validIds: rest }) : [];
    return ranked.concat(ladder).slice(0, limit);
  }

  function extrasEnabled(ctx, item, weighted) {
    var unit = (ctx.course.units || []).find(function (u) { return u.id === item.unit; });
    return weighted || ctx.course.confusions === true || !!(unit && unit.timer) || !!ctx.course.timer;
  }

  function extrasApply(ctx, args, weighted) {
    var item = args.item;
    var writes = args.writes;
    var v = args.v;
    if (!writes || !writes[item.id] || !extrasEnabled(ctx, item, weighted)) return writes;
    var out = Object.assign({}, writes);
    out[item.id] = ctx.dojo.call('applyExtras', {
      rec: writes[item.id], correct: v.correct === true, given: !v.dontKnow && typeof v.given === 'string' ? v.given : null,
      timedOut: v.timedOut === true, weighted: weighted
    });
    return out;
  }

  function matches(item, opts) {
    if (opts.units && opts.units.indexOf(item.unit) < 0) return false;
    if (opts.types && opts.types.indexOf(item.type) < 0) return false;
    if (opts.tags && !(item.tags || []).some(function (t) { return opts.tags.indexOf(t) >= 0; })) return false;
    return true;
  }

  // Adds matches / practiceQueue to the queue helper object h (needs h.preferShared).
  function practiceHelpers(ctx, h) {
    h.matches = matches;
    h.practiceQueue = function (opts) {
      var recs = ctx.fn.records();
      var t = ctx.now();
      var rows = ctx.fn.activeItems().filter(function (it) { return matches(it, opts); }).map(function (it, i) {
        var rec = recs[it.id];
        var due = ctx.dojo.call('isDue', { rec: rec, now: t });
        return { id: it.id, due: due ? 0 : 1, last: (rec && rec.last) || 0, i: i };
      });
      rows.sort(function (a, b) { return a.due - b.due || a.last - b.last || a.i - b.i; });
      var shared = h.preferShared(rows.map(function (r) { return r.id; }));
      if (ctx.fn.mixPractice) return ctx.fn.mixPractice(shared, opts.limit || LIMIT);
      return shared.slice(0, opts.limit || LIMIT);
    };
  }

  // Weakest ids among shared items; among all valid ones when no shared item is weak.
  function weakIds(ctx, h, valid, limit) {
    var byError = ctx.fn.weakByError && ctx.fn.weakByError(valid, limit);
    if (byError) return byError;
    var all = Object.keys(valid);
    var shared = h.preferShared(all);
    if (shared.length < all.length) {
      var sv = {};
      shared.forEach(function (id) { sv[id] = true; });
      var ids = ctx.dojo.call('weakest', { items: ctx.fn.records(), limit: limit, validIds: sv });
      if (ids.length > 0) return ids;
    }
    return ctx.dojo.call('weakest', { items: ctx.fn.records(), limit: limit, validIds: valid });
  }

  function weakValidIds(ctx) {
    var valid = {};
    var recs = ctx.fn.records();
    var seenEntity = {};
    ctx.fn.activeItems().forEach(function (it) {
      var se = ctx.scopedEntityOf[it.id];
      if (se !== undefined) {
        var r = recs[it.id];
        if (seenEntity[se] || !r || !(r.bad > 0)) return;
        seenEntity[se] = true;
      }
      valid[it.id] = true;
    });
    return valid;
  }

  function weakRow(ctx, id) {
    var it = ctx.byId[id];
    var st = it && it.stimulus && ctx.stimById ? ctx.stimById[it.stimulus] : null;
    return { id: id, prompt: it ? it.prompt : '', stimText: st ? st.text : undefined, answer: it ? it.answer : undefined };
  }

  // Adds weakIds / weakValidIds / weakQueue / weakList to the queue helper object h (needs h.preferShared).
  function weakHelpers(ctx, h) {
    h.weakIds = function (valid, limit) { return weakIds(ctx, h, valid, limit); };
    h.weakValidIds = function () { return weakValidIds(ctx); };
    h.weakQueue = function (opts) { return h.weakIds(h.weakValidIds(), opts.limit || util.K.DEFAULT_WEAK_LIMIT); };
    h.weakList = function (limit) {
      return h.weakIds(h.weakValidIds(), limit).map(function (id) { return weakRow(ctx, id); });
    };
  }

  var api = { create: create, practiceHelpers: practiceHelpers, weakHelpers: weakHelpers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionWeightedQueue = api;
})(typeof self !== 'undefined' ? self : this);
