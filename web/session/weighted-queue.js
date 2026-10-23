/* session/weighted-queue.js — errorWeighted scheduler mode (contract 12.4) and record extras (12.3) for the study session engine.
 * Exports DojoSessionWeightedQueue: create(ctx) -> { weightedMode(unitId), weightedQueue({ids, newAllowance, limit}) -> [id],
 *   mixDaily(ids, fresh) -> ids, mixPractice(ids, limit) -> ids, weakByError(valid, limit) -> ids | null, extrasFor(item, writes, v) -> writes }.
 *   The seed comes from ctx.random. Ladder units are left in place; only ids of errorWeighted units are replaced.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var LIMIT = util.K.DEFAULT_PRACTICE_LIMIT;

  function create(ctx) {
    function weightedMode(unitId) {
      return ctx.fn.unitConfig(unitId).mode === 'errorWeighted';
    }

    function isWeightedId(id) {
      var it = ctx.byId[id];
      return !!it && weightedMode(it.unit);
    }

    function anyWeighted() {
      return (ctx.course.units || []).some(function (u) { return weightedMode(u.id); });
    }

    function weightedQueue(opts) {
      var seed = String(Math.floor(ctx.random() * 9007199254740992));
      return ctx.dojo.call('weightedQueue', {
        ids: opts.ids, records: ctx.fn.records(), now: ctx.now(), seed: seed, limit: opts.limit, newAllowance: opts.newAllowance
      });
    }

    function mixDaily(ids, fresh) {
      if (!anyWeighted()) return ids;
      var recs = ctx.fn.records();
      var freshW = fresh.filter(isWeightedId);
      var known = ctx.fn.activeItems().filter(function (it) { return recs[it.id] !== undefined && isWeightedId(it.id); });
      var wIds = known.map(function (it) { return it.id; }).concat(freshW);
      var picked = weightedQueue({ ids: wIds, newAllowance: freshW.length, limit: LIMIT });
      return ids.filter(function (id) { return !isWeightedId(id); }).concat(picked);
    }

    function mixPractice(ids, limit) {
      if (!anyWeighted()) return ids.slice(0, limit);
      var wIds = ids.filter(isWeightedId);
      var picked = weightedQueue({ ids: wIds, newAllowance: limit, limit: limit });
      return ids.filter(function (id) { return !isWeightedId(id); }).concat(picked).slice(0, limit);
    }

    function weakByError(valid, limit) {
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

    function extrasEnabled(item, weighted) {
      var unit = (ctx.course.units || []).find(function (u) { return u.id === item.unit; });
      return weighted || ctx.course.confusions === true || !!(unit && unit.timer) || !!ctx.course.timer;
    }

    function extrasFor(item, writes, v) {
      var weighted = weightedMode(item.unit);
      if (!writes || !writes[item.id] || !extrasEnabled(item, weighted)) return writes;
      var out = Object.assign({}, writes);
      out[item.id] = ctx.dojo.call('applyExtras', {
        rec: writes[item.id], correct: v.correct === true, given: typeof v.given === 'string' ? v.given : null,
        timedOut: v.timedOut === true, weighted: weighted
      });
      return out;
    }

    return { weightedMode: weightedMode, weightedQueue: weightedQueue, mixDaily: mixDaily, mixPractice: mixPractice, weakByError: weakByError, extrasFor: extrasFor };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionWeightedQueue = api;
})(typeof self !== 'undefined' ? self : this);
