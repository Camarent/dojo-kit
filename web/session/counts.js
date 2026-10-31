/* session/counts.js — counts, group counts and entity states of the study session engine.
 * Exports DojoSessionCounts: create(ctx) -> api.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var isRetired = util.isRetired;

  function create(ctx) {
    var dojo = ctx.dojo;
    var course = ctx.course;
    var items = ctx.items;
    var now = ctx.now;

    function counts() {
      var active = ctx.fn.activeItems();
      var recs = ctx.fn.records();
      var byUnit = {};
      var due = 0;
      var fresh = 0;
      var learning = 0;
      var learned = 0;
      var thresholdCache = new Map();
      var views = {};
      var dueSeen = {};
      active.forEach(function (it) {
        var u = byUnit[it.unit] || (byUnit[it.unit] = { total: 0, due: 0, fresh: 0, learning: 0, learned: 0 });
        u.total++;
        var rec = recs[it.id];
        var se = ctx.scopedEntityOf[it.id];
        if (se !== undefined) {
          if (!(se in views)) views[se] = ctx.fn.entityViewOf(se);
          rec = views[se] === null ? undefined : views[se];
        }
        if (dojo.call('isNew', { rec: rec })) {
          u.fresh++; fresh++;
        } else {
          var stage = rec ? rec.s : undefined;
          var unitThreshold = thresholdCache.get(it.unit);
          if (unitThreshold === undefined) {
            unitThreshold = ctx.fn.getUnitThreshold(it.unit);
            thresholdCache.set(it.unit, unitThreshold);
          }
          if (stage !== undefined && stage >= unitThreshold) {
            u.learned++; learned++;
          } else {
            u.learning++; learning++;
          }
          if (dojo.call('isDue', { rec: rec, now: now() }) && (se === undefined || !dueSeen[se])) {
            if (se !== undefined) dueSeen[se] = true;
            u.due++; due++;
          }
        }
      });
      var bq = ctx.fn.builtQueue();
      var newToday = bq.fresh.length;
      var totals = { total: active.length, fresh: fresh, learning: learning, learned: learned };
      var out = { total: items.length, active: active.length, due: due, fresh: fresh, learning: learning, learned: learned, newToday: newToday, queue: bq.due.length + bq.fresh.length, byUnit: byUnit, totals: totals };
      if (ctx.groupList.length || (course.bars && course.bars.length)) {
        var gc = groupCounts();
        out.groups = gc.groups;
        out.bars = gc.bars;
        if (ctx.groupList.length) out.summary = summarize(gc.groups, byUnit, bq);
      }
      return out;
    }

    // Home summary of a course with groups, consistent with the group cards: due = group due (entities) + due items of
    // ungrouped units; newToday = group newToday (entities) + fresh items of ungrouped units in today's queue.
    function summarize(groups, byUnit, bq) {
      var due = 0;
      var newToday = 0;
      var parts = [];
      ctx.groupList.forEach(function (g) {
        var gn = groups[g.id] ? groups[g.id].newToday : 0;
        parts.push({ id: g.id, title: g.title, newToday: gn });
      });
      Object.keys(groups).forEach(function (id) { due += groups[id].due; newToday += groups[id].newToday; });
      var unitOf = {};
      items.forEach(function (it) { unitOf[it.id] = it.unit; });
      Object.keys(byUnit).forEach(function (u) { if (!(u in ctx.unitGroup)) due += byUnit[u].due; });
      var other = 0;
      bq.fresh.forEach(function (id) { if (!(unitOf[id] in ctx.unitGroup)) { newToday++; other++; } });
      if (other > 0) parts.push({ id: 'other', title: null, newToday: other });
      return { due: due, newToday: newToday, parts: parts, queue: bq.due.length + bq.fresh.length };
    }

    // Entity-level counts from WASM; the course copy carries the user's per-group newPerDay override.
    function groupCounts() {
      var c = Object.assign({}, course, {
        groups: ctx.groupList.map(function (g) {
          var cap = ctx.fn.groupCap(g);
          var copy = Object.assign({}, g);
          if (cap === null) delete copy.newPerDay; else copy.newPerDay = cap;
          return copy;
        })
      });
      var meta = items.map(function (it) {
        return { id: it.id, unit: it.unit, entity: ctx.itemEntities[it.id], tags: it.tags || [], retired: isRetired(it) };
      });
      var gargs = { course: c, items: meta, records: ctx.fn.records(), now: now(), used: ctx.fn.groupUsed(), extraNew: ctx.fn.extraNewToday() };
      if (ctx.hasScope) gargs.scopedEntities = Object.keys(ctx.scopedMembers);
      return dojo.call('groupCounts', gargs);
    }

    // Per-entity catalog summary from WASM `entityStates`: [{id, members, started, minStage, due, learned, atLearned}].
    function entityStates() {
      var meta = items.map(function (it) { return { id: it.id, entity: ctx.itemEntities[it.id], retired: isRetired(it) }; });
      var eargs = { items: meta, records: ctx.fn.records(), now: now(), learnedStage: ctx.fn.learnedStage() };
      if (ctx.hasScope) eargs.scopedEntities = Object.keys(ctx.scopedMembers);
      return dojo.call('entityStates', eargs);
    }

    return {
      counts: counts, summarize: summarize, groupCounts: groupCounts,
      entityStates: entityStates
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionCounts = api;
})(typeof self !== 'undefined' ? self : this);
