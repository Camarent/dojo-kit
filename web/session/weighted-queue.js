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
      var it = ctx.byId[id];
      return !!it && weightedMode(it.unit);
    }

    function anyWeighted() {
      var t = modeTable();
      return Object.keys(t).some(function (k) { return t[k]; });
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
      var wIds = ids.filter(isWeightedId);
      var picked = weightedQueue({ ids: wIds, newAllowance: limit, limit: limit });
      return ids.filter(function (id) { return !isWeightedId(id); }).concat(picked).slice(0, limit);
    }

    function weakByError(valid, limit) {
      if (!anyWeighted()) return null;
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
        rec: writes[item.id], correct: v.correct === true, given: !v.dontKnow && typeof v.given === 'string' ? v.given : null,
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
