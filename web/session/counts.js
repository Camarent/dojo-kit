/* session/counts.js — counts, group counts and entity states of the study session engine.
 * Exports DojoSessionCounts: create(ctx) -> api.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var isRetired = util.isRetired;

  function unitRow(byUnit, unit) {
    return byUnit[unit] || (byUnit[unit] = { total: 0, due: 0, fresh: 0, learning: 0, learned: 0 });
  }

  function thresholdOf(ctx, cache, unit) {
    var threshold = cache.get(unit);
    if (threshold === undefined) {
      threshold = ctx.fn.getUnitThreshold(unit);
      cache.set(unit, threshold);
    }
    return threshold;
  }

  // Record of an item; a scoped entity shares one record across its members.
  function recordOf(ctx, st, it) {
    var rec = st.recs[it.id];
    var se = ctx.scopedEntityOf[it.id];
    if (se !== undefined) {
      if (!(se in st.views)) st.views[se] = ctx.fn.entityViewOf(se);
      rec = st.views[se] === null ? undefined : st.views[se];
    }
    return rec;
  }

  function tallyItem(ctx, st, it) {
    var u = unitRow(st.byUnit, it.unit);
    u.total++;
    var rec = recordOf(ctx, st, it);
    if (ctx.dojo.call('isNew', { rec: rec })) {
      u.fresh++; st.t.fresh++;
      return;
    }
    var stage = rec ? rec.s : undefined;
    var learned = stage !== undefined && stage >= thresholdOf(ctx, st.thresholdCache, it.unit);
    if (learned) {
      u.learned++; st.t.learned++;
    } else {
      u.learning++; st.t.learning++;
    }
    var se = ctx.scopedEntityOf[it.id];
    if (ctx.dojo.call('isDue', { rec: rec, now: ctx.now() }) && (se === undefined || !st.dueSeen[se])) {
      if (se !== undefined) st.dueSeen[se] = true;
      u.due++; st.t.due++;
    }
  }

  function counts(ctx) {
    var active = ctx.fn.activeItems();
    var st = {
      recs: ctx.fn.records(), byUnit: {}, views: {}, dueSeen: {}, thresholdCache: new Map(),
      t: { due: 0, fresh: 0, learning: 0, learned: 0 }
    };
    active.forEach(function (it) { tallyItem(ctx, st, it); });
    var t = st.t;
    var bq = ctx.fn.builtQueue();
    var newToday = bq.fresh.length;
    var totals = { total: active.length, fresh: t.fresh, learning: t.learning, learned: t.learned };
    // Due = the due items the session will show (same builtQueue), not every due item of every unit.
    var out = { total: ctx.items.length, active: active.length, due: bq.due.length, fresh: t.fresh, learning: t.learning, learned: t.learned, newToday: newToday, queue: bq.due.length + bq.fresh.length, byUnit: st.byUnit, totals: totals };
    if (ctx.groupList.length || (ctx.course.bars && ctx.course.bars.length)) {
      var gc = groupCounts(ctx);
      out.groups = gc.groups;
      out.bars = gc.bars;
      if (ctx.groupList.length) out.summary = summarize(ctx, gc.groups, st.byUnit, bq);
    }
    return out;
  }

  // Home summary of a course with groups, consistent with the group cards: due = group due (entities) + due items of
  // ungrouped units; newToday = group newToday (entities) + fresh items of ungrouped units in today's queue.
  function summarize(ctx, groups, byUnit, bq) {
    var due = 0;
    var newToday = 0;
    var parts = [];
    ctx.groupList.forEach(function (g) {
      var gn = groups[g.id] ? groups[g.id].newToday : 0;
      parts.push({ id: g.id, title: g.title, newToday: gn });
    });
    Object.keys(groups).forEach(function (id) { due += groups[id].due; newToday += groups[id].newToday; });
    var unitOf = {};
    ctx.items.forEach(function (it) { unitOf[it.id] = it.unit; });
    Object.keys(byUnit).forEach(function (u) { if (!(u in ctx.unitGroup)) due += byUnit[u].due; });
    var other = 0;
    bq.fresh.forEach(function (id) { if (!(unitOf[id] in ctx.unitGroup)) { newToday++; other++; } });
    if (other > 0) parts.push({ id: 'other', title: null, newToday: other });
    return { due: due, newToday: newToday, parts: parts, queue: bq.due.length + bq.fresh.length };
  }

  // Entity-level counts from WASM; the course copy carries the user's per-group newPerDay override.
  function groupCounts(ctx) {
    var c = Object.assign({}, ctx.course, {
      groups: ctx.groupList.map(function (g) {
        var cap = ctx.fn.groupCap(g);
        var copy = Object.assign({}, g);
        if (cap === null) delete copy.newPerDay; else copy.newPerDay = cap;
        return copy;
      })
    });
    var meta = ctx.items.map(function (it) {
      return { id: it.id, unit: it.unit, entity: ctx.itemEntities[it.id], tags: it.tags || [], retired: isRetired(it) };
    });
    var gargs = { course: c, items: meta, records: ctx.fn.records(), now: ctx.now(), used: ctx.fn.groupUsed(), extraNew: ctx.fn.extraNewToday() };
    if (ctx.hasScope) gargs.scopedEntities = Object.keys(ctx.scopedMembers);
    return ctx.dojo.call('groupCounts', gargs);
  }

  // Per-entity catalog summary from WASM `entityStates`: [{id, members, started, minStage, due, learned, atLearned}].
  function entityStates(ctx) {
    var meta = ctx.items.map(function (it) { return { id: it.id, entity: ctx.itemEntities[it.id], retired: isRetired(it) }; });
    var eargs = { items: meta, records: ctx.fn.records(), now: ctx.now(), learnedStage: ctx.fn.learnedStage() };
    if (ctx.hasScope) eargs.scopedEntities = Object.keys(ctx.scopedMembers);
    return ctx.dojo.call('entityStates', eargs);
  }

  function create(ctx) {
    return {
      counts: function () { return counts(ctx); },
      summarize: function (groups, byUnit, bq) { return summarize(ctx, groups, byUnit, bq); },
      groupCounts: function () { return groupCounts(ctx); },
      entityStates: function () { return entityStates(ctx); }
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionCounts = api;
})(typeof self !== 'undefined' ? self : this);
