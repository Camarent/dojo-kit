/* session/queues.js — queue building (daily, practice, weak, placement), group caps and new-item allowance of the study session engine.
 * Exports DojoSessionQueues: create(ctx) -> api.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var shuffledIndexes = util.shuffledIndexes;
  var isRetired = util.isRetired;
  var UNIT_NEW_PREFIX = util.K.UNIT_NEW_PREFIX;
  var GROUP_NEW_PREFIX = util.K.GROUP_NEW_PREFIX;
  var DEFAULT_NEW_PER_DAY = util.K.DEFAULT_NEW_PER_DAY;
  var weighted = root.DojoSessionWeightedQueue || (typeof require === 'function' ? require('./weighted-queue.js') : null);

  // Each group fills the shared bag h from ctx; calls go through h at call time.
  function scopeHelpers(ctx, h) {
    var byId = ctx.byId;
    h.scopedArgs = function () {
      return ctx.hasScope ? { scopedMembers: ctx.scopedMembers } : null;
    };
    h.scopedRecords = function (e) {
      var recs = ctx.fn.records();
      var out = {};
      ctx.entityMembers[e].forEach(function (id) { if (recs[id] !== undefined) out[id] = recs[id]; });
      return out;
    };
    h.scopedMemberList = function (e) {
      return ctx.entityMembers[e].map(function (id) { return { id: id, retired: isRetired(byId[id]) }; });
    };
    h.entityViewOf = function (e) {
      return ctx.dojo.call('entityView', { members: h.scopedMemberList(e), records: h.scopedRecords(e) });
    };
  }

  function groupCapHelpers(ctx, h) {
    var store = ctx.store;
    h.groupCap = function (g) {
      var o = ctx.fn.groupSettings(g.id);
      if (o.newPerDay !== undefined) return o.newPerDay;
      return typeof g.newPerDay === 'number' ? g.newPerDay : null;
    };
    h.groupOrder = function (g) {
      var o = ctx.fn.groupSettings(g.id);
      return o.newOrder !== undefined ? o.newOrder : (g.newOrder || 'file');
    };
    h.dayStat = function (key) {
      return (((store.doc.stats || {})[key]) || {})[ctx.today()] || 0;
    };
    h.extraNewToday = function () {
      return h.dayStat('extraNewByDay');
    };
    h.extraGroup = function () {
      for (var i = 0; i < ctx.groupList.length; i++) if (ctx.groupList[i].extraNew === true) return ctx.groupList[i];
      return null;
    };
    h.groupUsed = function () {
      var used = {};
      ctx.groupList.forEach(function (g) { used[GROUP_NEW_PREFIX + g.id] = h.dayStat(GROUP_NEW_PREFIX + g.id); });
      return used;
    };
    // Items introduced today in capped groups do not consume the allowance of ungrouped units.
    h.groupedItemsUsedToday = function () {
      var n = 0;
      ctx.groupList.forEach(function (g) {
        if (h.groupCap(g) === null) return;
        (g.units || []).forEach(function (u) { if (ctx.unitGroup[u] === g.id) n += h.dayStat(UNIT_NEW_PREFIX + u); });
      });
      return n;
    };
  }

  function allowanceHelpers(ctx, h) {
    var store = ctx.store;
    h.groupQueueArgs = function () {
      var caps = {};
      var units = {};
      var random = [];
      ctx.groupList.forEach(function (g) {
        var cap = h.groupCap(g);
        if (cap === null) return;
        caps[g.id] = cap;
        units[g.id] = (g.units || []).filter(function (u) { return ctx.unitGroup[u] === g.id; });
        if (h.groupOrder(g) === 'random') random.push(g.id);
      });
      if (!Object.keys(caps).length) return null;
      return { itemEntities: ctx.itemEntities, groupNewCaps: caps, groupUnits: units, randomGroups: random, used: h.groupUsed(), day: ctx.today(), courseId: ctx.course.id || '' };
    };
    // User-level daily new-item cap (applies to units whose course sets no cap).
    h.globalNewPerDay = function () {
      var settings = store.doc.settings || {};
      return typeof settings.newPerDay === 'number' ? settings.newPerDay : DEFAULT_NEW_PER_DAY;
    };
    h.newAllowance = function () {
      var doc = store.doc;
      var today = ctx.today();
      var perDay = h.globalNewPerDay();
      var used = (doc.stats && doc.stats.newByDay && doc.stats.newByDay[today]) || 0;
      var extra = (doc.stats && doc.stats.extraNewByDay && doc.stats.extraNewByDay[today]) || 0;
      if (ctx.groupList.length) {
        used = Math.max(0, used - h.groupedItemsUsedToday());
        if (h.extraGroup() && h.groupCap(h.extraGroup()) !== null) extra = 0;
      }
      return Math.max(0, perDay + extra - used);
    };
  }

  function unitHelpers(ctx, h) {
    var store = ctx.store;
    h.buildUnitNewCaps = function () {
      var caps = {};
      var units = ctx.course.units || [];
      units.forEach(function (unit) {
        var effectiveCap = ctx.fn.unitConfig(unit.id).newPerDay;
        var override = ctx.fn.getUnitSettingsOverride(unit.id);
        if (override.newPerDay !== undefined) effectiveCap = override.newPerDay;
        if (effectiveCap !== null) {
          var usedToday = (((store.doc.stats || {})[UNIT_NEW_PREFIX + unit.id]) || {})[ctx.today()] || 0;
          caps[unit.id] = Math.max(0, Math.floor(effectiveCap) - usedToday);
        }
      });
      return caps;
    };
    h.buildItemUnits = function () {
      var map = {};
      ctx.items.forEach(function (item) {
        if (item.unit) {
          map[item.id] = item.unit;
        }
      });
      return map;
    };
    h.resolveNewOrder = function (unit) {
      if (!unit) return 'file';
      var override = ctx.fn.getUnitSettingsOverride(unit.id);
      return override.newOrder !== undefined ? override.newOrder : ctx.fn.unitConfig(unit.id).newOrder;
    };
    // Items of ids outside examOnly units; ids itself when that leaves nothing.
    h.preferShared = function (ids) {
      var eo = {};
      (ctx.course.units || []).forEach(function (u) { if (u.examOnly === true) eo[u.id] = true; });
      var unitOf = {};
      ctx.items.forEach(function (it) { unitOf[it.id] = it.unit; });
      var shared = ids.filter(function (id) { return !eo[unitOf[id]]; });
      return shared.length > 0 ? shared : ids;
    };
    h.unitIsExamOnly = function (unitId) {
      return (ctx.course.units || []).some(function (u) { return u.id === unitId && u.examOnly === true; });
    };
  }

  // Shuffle items within each random-order unit's own slots.
  function shuffleRandomUnits(ctx, h, order) {
    var course = ctx.course;
    var unitLookup = {};
    (course.units || []).forEach(function (u) { unitLookup[u.id] = u; });
    var itemUnit = {};
    ctx.items.forEach(function (it) { itemUnit[it.id] = it.unit; });
    // Group positions by unit
    var unitPositions = {};
    order.forEach(function (id, idx) {
      var unitId = itemUnit[id];
      if (!unitPositions[unitId]) unitPositions[unitId] = [];
      unitPositions[unitId].push(idx);
    });
    // Shuffle positions within each random-order unit
    var shuffledOrder = order.slice();
    for (var unitId in unitPositions) {
      var positions = unitPositions[unitId];
      var unit = unitLookup[unitId];
      var inCappedGroup = ctx.unitGroup[unitId] !== undefined && h.groupCap(ctx.groupById[ctx.unitGroup[unitId]]) !== null;
      if (!inCappedGroup && h.resolveNewOrder(unit) === 'random' && positions.length > 1) {
        var seed = course.id + '|' + ctx.today() + '|' + unitId;
        var perm = shuffledIndexes(positions.length, seed);
        positions.forEach(function (pos, i) {
          shuffledOrder[pos] = order[positions[perm[i]]];
        });
      }
    }
    return shuffledOrder;
  }

  // Extra-group entities beyond the base share: filtered by extraTags and/or drawn at random in their slots.
  function randomizeExtraSlots(o) {
    var ctx = o.ctx, xg = o.xg, order2 = o.order, inGroup = o.inGroup, recs = o.recs, q0 = o.q0;
    var slots = [];
    order2.forEach(function (id, i) { if (inGroup[id] && recs[id] === undefined) slots.push(i); });
    var baseEnt = {};
    q0.fresh.forEach(function (id) { baseEnt[ctx.itemEntities[id]] = true; });
    var head = [];
    var rest = [];
    var restOf = {};
    slots.forEach(function (i) {
      var id = order2[i];
      var e = ctx.itemEntities[id];
      if (baseEnt[e]) { head.push(id); return; }
      if (!restOf[e]) { restOf[e] = []; rest.push(e); }
      restOf[e].push(id);
    });
    var perm2 = shuffledIndexes(rest.length, (ctx.course.id || '') + '|' + ctx.today() + '|' + xg.id + '|extra');
    var seq = head.slice();
    perm2.forEach(function (pi) { restOf[rest[pi]].forEach(function (id) { seq.push(id); }); });
    var out = order2.slice();
    slots.forEach(function (pos, i) { out[pos] = seq[i]; });
    return out;
  }

  // Two passes: the base share is picked as usual; entities beyond it are filtered by extraTags and/or drawn at random.
  function extraTwoPass(ctx, args, order, o) {
    var xg = o.xg, base = o.base, extra = o.extra, tagFilter = o.tagFilter, extraRandom = o.extraRandom;
    var q0 = ctx.dojo.call('buildQueue', args);
    var inQ0 = {};
    q0.fresh.forEach(function (id) { inQ0[id] = true; });
    var xUnits = args.groupUnits[xg.id];
    var recs = ctx.fn.records();
    var tagged = {};
    ctx.items.forEach(function (it) {
      if ((it.tags || []).some(function (t) { return o.tags.indexOf(t) >= 0; })) tagged[ctx.itemEntities[it.id]] = true;
    });
    var inGroup = {};
    ctx.items.forEach(function (it) { if (xUnits.indexOf(it.unit) >= 0) inGroup[it.id] = true; });
    var order2 = order.filter(function (id) {
      return !inGroup[id] || recs[id] !== undefined || inQ0[id] || !tagFilter || tagged[ctx.itemEntities[id]];
    });
    var args2 = Object.assign({}, args, { order: order2 });
    if (extraRandom) {
      args2.order = randomizeExtraSlots({ ctx: ctx, xg: xg, order: order2, inGroup: inGroup, recs: recs, q0: q0 });
      args2.randomGroups = (args.randomGroups || []).filter(function (gid) { return gid !== xg.id; });
    }
    var used = args.used[GROUP_NEW_PREFIX + xg.id] || 0;
    var extraLeft = Math.max(0, Math.min(extra, base + extra - used));
    args2.groupNewCaps = Object.assign({}, args.groupNewCaps);
    args2.groupNewCaps[xg.id] = Math.max(0, base - used) + extraLeft + used;
    var q2 = ctx.dojo.call('buildQueue', args2);
    var more = q2.fresh.filter(function (id) { return !inQ0[id] && inGroup[id]; });
    var merged = { due: q0.due, fresh: q0.fresh.concat(more) };
    if (q0.drills) merged.drills = Object.assign({}, q0.drills, q2.drills);
    return merged;
  }

  function queueWithExtraNew(ctx, h, args, order) {
    var xg = h.extraGroup();
    var extra = h.extraNewToday();
    var base = xg ? h.groupCap(xg) : null;
    if (!xg || base === null || !(extra > 0)) return ctx.dojo.call('buildQueue', args);
    var tags = xg.extraTags || [];
    var tagFilter = tags.length > 0 && ctx.fn.groupSettings(xg.id).onlyTags === true;
    var extraRandom = ctx.fn.groupSettings(xg.id).extraRandom === true;
    if (!tagFilter && !extraRandom) {
      args.groupNewCaps[xg.id] = base + extra;
      return ctx.dojo.call('buildQueue', args);
    }
    return extraTwoPass(ctx, args, order, { xg: xg, base: base, extra: extra, tags: tags, tagFilter: tagFilter, extraRandom: extraRandom });
  }

  function queueHelpers(ctx, h) {
    h.rawBuiltQueue = function (sharedOnly) {
      var order = ctx.fn.activeItems().map(function (it) { return it.id; });
      if (sharedOnly) order = h.preferShared(order);
      order = shuffleRandomUnits(ctx, h, order);
      var args = { items: ctx.fn.records(), order: order, now: ctx.now(), newAllowance: h.newAllowance(), unitNewCaps: h.buildUnitNewCaps(), itemUnits: h.buildItemUnits() };
      var sa = h.scopedArgs();
      if (sa) args.scopedMembers = sa.scopedMembers;
      var ga = h.groupQueueArgs();
      if (!ga) return ctx.dojo.call('buildQueue', args);
      Object.keys(ga).forEach(function (k) { args[k] = ga[k]; });
      return queueWithExtraNew(ctx, h, args, order);
    };
    // Queue without examOnly items unless that would leave the whole queue empty.
    h.builtQueue = function () {
      var q = h.rawBuiltQueue(true);
      if (q.due.length + q.fresh.length > 0) return q;
      return h.rawBuiltQueue(false);
    };
    h.dailyQueue = function (groupId) {
      var q = h.builtQueue();
      var ids = q.due.concat(q.fresh);
      if (ctx.fn.mixDaily) ids = ctx.fn.mixDaily(ids, q.fresh, groupId);
      if (groupId === undefined || groupId === null) return ids;
      var unitOf = {};
      ctx.items.forEach(function (it) { unitOf[it.id] = it.unit; });
      function inGroup(id) { return ctx.unitGroup[unitOf[id]] === groupId; }
      var got = ids.filter(inGroup);
      if (got.length) return got;
      var raw = h.rawBuiltQueue(false);
      return raw.due.concat(raw.fresh).filter(inGroup);
    };
  }

  function create(ctx) {
    var h = {};
    scopeHelpers(ctx, h);
    groupCapHelpers(ctx, h);
    allowanceHelpers(ctx, h);
    unitHelpers(ctx, h);
    queueHelpers(ctx, h);
    weighted.practiceHelpers(ctx, h);
    weighted.weakHelpers(ctx, h);
    return h;
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionQueues = api;
})(typeof self !== 'undefined' ? self : this);
