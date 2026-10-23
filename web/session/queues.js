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
  var DEFAULT_PRACTICE_LIMIT = util.K.DEFAULT_PRACTICE_LIMIT;
  var DEFAULT_WEAK_LIMIT = util.K.DEFAULT_WEAK_LIMIT;

  function create(ctx) {
    var dojo = ctx.dojo;
    var store = ctx.store;
    var course = ctx.course;
    var items = ctx.items;
    var byId = ctx.byId;
    var now = ctx.now;
    var today = ctx.today;

    function scopedArgs() {
      return ctx.hasScope ? { scopedMembers: ctx.scopedMembers } : null;
    }

    function scopedRecords(e) {
      var recs = ctx.fn.records();
      var out = {};
      ctx.entityMembers[e].forEach(function (id) { if (recs[id] !== undefined) out[id] = recs[id]; });
      return out;
    }

    function scopedMemberList(e) {
      return ctx.entityMembers[e].map(function (id) { return { id: id, retired: isRetired(byId[id]) }; });
    }

    function entityViewOf(e) {
      return dojo.call('entityView', { members: scopedMemberList(e), records: scopedRecords(e) });
    }

    // Effective daily entity cap: user override > course group newPerDay > null (uncapped).
    function groupCap(g) {
      var o = ctx.fn.groupSettings(g.id);
      if (o.newPerDay !== undefined) return o.newPerDay;
      return typeof g.newPerDay === 'number' ? g.newPerDay : null;
    }

    function groupOrder(g) {
      var o = ctx.fn.groupSettings(g.id);
      return o.newOrder !== undefined ? o.newOrder : (g.newOrder || 'file');
    }

    function dayStat(key) {
      return (((store.doc.stats || {})[key]) || {})[today()] || 0;
    }

    function extraNewToday() {
      return dayStat('extraNewByDay');
    }

    function extraGroup() {
      for (var i = 0; i < ctx.groupList.length; i++) if (ctx.groupList[i].extraNew === true) return ctx.groupList[i];
      return null;
    }

    function groupUsed() {
      var used = {};
      ctx.groupList.forEach(function (g) { used[GROUP_NEW_PREFIX + g.id] = dayStat(GROUP_NEW_PREFIX + g.id); });
      return used;
    }

    // Items introduced today in capped groups do not consume the allowance of ungrouped units.
    function groupedItemsUsedToday() {
      var n = 0;
      ctx.groupList.forEach(function (g) {
        if (groupCap(g) === null) return;
        (g.units || []).forEach(function (u) { if (ctx.unitGroup[u] === g.id) n += dayStat(UNIT_NEW_PREFIX + u); });
      });
      return n;
    }

    function groupQueueArgs() {
      var caps = {};
      var units = {};
      var random = [];
      ctx.groupList.forEach(function (g) {
        var cap = groupCap(g);
        if (cap === null) return;
        caps[g.id] = cap;
        units[g.id] = (g.units || []).filter(function (u) { return ctx.unitGroup[u] === g.id; });
        if (groupOrder(g) === 'random') random.push(g.id);
      });
      if (!Object.keys(caps).length) return null;
      return { itemEntities: ctx.itemEntities, groupNewCaps: caps, groupUnits: units, randomGroups: random, used: groupUsed(), day: today(), courseId: course.id || '' };
    }

    // User-level daily new-item cap (applies to units whose course sets no cap).
    function globalNewPerDay() {
      var settings = store.doc.settings || {};
      return typeof settings.newPerDay === 'number' ? settings.newPerDay : DEFAULT_NEW_PER_DAY;
    }

    function newAllowance() {
      var doc = store.doc;
      var perDay = globalNewPerDay();
      var used = (doc.stats && doc.stats.newByDay && doc.stats.newByDay[today()]) || 0;
      var extra = (doc.stats && doc.stats.extraNewByDay && doc.stats.extraNewByDay[today()]) || 0;
      if (ctx.groupList.length) {
        used = Math.max(0, used - groupedItemsUsedToday());
        if (extraGroup() && groupCap(extraGroup()) !== null) extra = 0;
      }
      return Math.max(0, perDay + extra - used);
    }

    function buildUnitNewCaps() {
      var caps = {};
      var units = course.units || [];
      units.forEach(function (unit) {
        var effectiveCap = ctx.fn.unitConfig(unit.id).newPerDay;
        var override = ctx.fn.getUnitSettingsOverride(unit.id);
        if (override.newPerDay !== undefined) effectiveCap = override.newPerDay;
        if (effectiveCap !== null) {
          var usedToday = (((store.doc.stats || {})[UNIT_NEW_PREFIX + unit.id]) || {})[today()] || 0;
          caps[unit.id] = Math.max(0, Math.floor(effectiveCap) - usedToday);
        }
      });
      return caps;
    }

    function buildItemUnits() {
      var map = {};
      items.forEach(function (item) {
        if (item.unit) {
          map[item.id] = item.unit;
        }
      });
      return map;
    }

    function resolveNewOrder(unit) {
      if (!unit) return 'file';
      var override = ctx.fn.getUnitSettingsOverride(unit.id);
      return override.newOrder !== undefined ? override.newOrder : ctx.fn.unitConfig(unit.id).newOrder;
    }

    // Items of ids outside examOnly units; ids itself when that leaves nothing.
    function preferShared(ids) {
      var eo = {};
      (course.units || []).forEach(function (u) { if (u.examOnly === true) eo[u.id] = true; });
      var unitOf = {};
      items.forEach(function (it) { unitOf[it.id] = it.unit; });
      var shared = ids.filter(function (id) { return !eo[unitOf[id]]; });
      return shared.length > 0 ? shared : ids;
    }

    function unitIsExamOnly(unitId) {
      return (course.units || []).some(function (u) { return u.id === unitId && u.examOnly === true; });
    }

    // Queue without examOnly items unless that would leave the whole queue empty.
    function builtQueue() {
      var q = rawBuiltQueue(true);
      if (q.due.length + q.fresh.length > 0) return q;
      return rawBuiltQueue(false);
    }

    function shuffleRandomUnits(order) {
      // Shuffle items within each random-order unit's own slots
      var unitLookup = {};
      (course.units || []).forEach(function (u) { unitLookup[u.id] = u; });

      var itemUnit = {};
      items.forEach(function (it) { itemUnit[it.id] = it.unit; });

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
        var inCappedGroup = ctx.unitGroup[unitId] !== undefined && groupCap(ctx.groupById[ctx.unitGroup[unitId]]) !== null;
        if (!inCappedGroup && resolveNewOrder(unit) === 'random' && positions.length > 1) {
          var seed = course.id + '|' + today() + '|' + unitId;
          var perm = shuffledIndexes(positions.length, seed);
          positions.forEach(function (pos, i) {
            shuffledOrder[pos] = order[positions[perm[i]]];
          });
        }
      }
      return shuffledOrder;
    }

    function queueWithExtraNew(args, order) {
      var xg = extraGroup();
      var extra = extraNewToday();
      var base = xg ? groupCap(xg) : null;
      if (!xg || base === null || !(extra > 0)) return dojo.call('buildQueue', args);
      var tags = xg.extraTags || [];
      var tagFilter = tags.length > 0 && ctx.fn.groupSettings(xg.id).onlyTags === true;
      var extraRandom = ctx.fn.groupSettings(xg.id).extraRandom === true;
      if (!tagFilter && !extraRandom) {
        args.groupNewCaps[xg.id] = base + extra;
        return dojo.call('buildQueue', args);
      }
      // Two passes: the base share is picked as usual; entities beyond it are filtered by extraTags and/or drawn at random.
      var q0 = dojo.call('buildQueue', args);
      var inQ0 = {};
      q0.fresh.forEach(function (id) { inQ0[id] = true; });
      var xUnits = args.groupUnits[xg.id];
      var recs = ctx.fn.records();
      var tagged = {};
      items.forEach(function (it) {
        if ((it.tags || []).some(function (t) { return tags.indexOf(t) >= 0; })) tagged[ctx.itemEntities[it.id]] = true;
      });
      var inGroup = {};
      items.forEach(function (it) { if (xUnits.indexOf(it.unit) >= 0) inGroup[it.id] = true; });
      var order2 = order.filter(function (id) {
        return !inGroup[id] || recs[id] !== undefined || inQ0[id] || !tagFilter || tagged[ctx.itemEntities[id]];
      });
      var args2 = Object.assign({}, args, { order: order2 });
      if (extraRandom) {
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
        var perm2 = shuffledIndexes(rest.length, (course.id || '') + '|' + today() + '|' + xg.id + '|extra');
        var seq = head.slice();
        perm2.forEach(function (pi) { restOf[rest[pi]].forEach(function (id) { seq.push(id); }); });
        order2 = order2.slice();
        slots.forEach(function (pos, i) { order2[pos] = seq[i]; });
        args2.order = order2;
        args2.randomGroups = (args.randomGroups || []).filter(function (gid) { return gid !== xg.id; });
      }
      var used = args.used[GROUP_NEW_PREFIX + xg.id] || 0;
      var extraLeft = Math.max(0, Math.min(extra, base + extra - used));
      args2.groupNewCaps = Object.assign({}, args.groupNewCaps);
      args2.groupNewCaps[xg.id] = Math.max(0, base - used) + extraLeft + used;
      var q2 = dojo.call('buildQueue', args2);
      var more = q2.fresh.filter(function (id) { return !inQ0[id] && inGroup[id]; });
      var merged = { due: q0.due, fresh: q0.fresh.concat(more) };
      if (q0.drills) merged.drills = Object.assign({}, q0.drills, q2.drills);
      return merged;
    }

    function rawBuiltQueue(sharedOnly) {
      var order = ctx.fn.activeItems().map(function (it) { return it.id; });
      if (sharedOnly) order = preferShared(order);

      order = shuffleRandomUnits(order);

      var args = { items: ctx.fn.records(), order: order, now: now(), newAllowance: newAllowance(), unitNewCaps: buildUnitNewCaps(), itemUnits: buildItemUnits() };
      var sa = scopedArgs();
      if (sa) args.scopedMembers = sa.scopedMembers;
      var ga = groupQueueArgs();
      if (!ga) return dojo.call('buildQueue', args);
      Object.keys(ga).forEach(function (k) { args[k] = ga[k]; });
      return queueWithExtraNew(args, order);
    }

    function dailyQueue(groupId) {
      var q = builtQueue();
      var ids = q.due.concat(q.fresh);
      if (ctx.fn.mixDaily) ids = ctx.fn.mixDaily(ids, q.fresh);
      if (groupId === undefined || groupId === null) return ids;
      var unitOf = {};
      items.forEach(function (it) { unitOf[it.id] = it.unit; });
      function inGroup(id) { return ctx.unitGroup[unitOf[id]] === groupId; }
      var got = ids.filter(inGroup);
      if (got.length) return got;
      var raw = rawBuiltQueue(false);
      return raw.due.concat(raw.fresh).filter(inGroup);
    }

    function matches(item, opts) {
      if (opts.units && opts.units.indexOf(item.unit) < 0) return false;
      if (opts.types && opts.types.indexOf(item.type) < 0) return false;
      if (opts.tags && !(item.tags || []).some(function (t) { return opts.tags.indexOf(t) >= 0; })) return false;
      return true;
    }

    function practiceQueue(opts) {
      var recs = ctx.fn.records();
      var t = now();
      var rows = ctx.fn.activeItems().filter(function (it) { return matches(it, opts); }).map(function (it, i) {
        var rec = recs[it.id];
        var due = dojo.call('isDue', { rec: rec, now: t });
        return { id: it.id, due: due ? 0 : 1, last: (rec && rec.last) || 0, i: i };
      });
      rows.sort(function (a, b) { return a.due - b.due || a.last - b.last || a.i - b.i; });
      var all = rows.map(function (r) { return r.id; });
      var shared = preferShared(all);
      if (ctx.fn.mixPractice) return ctx.fn.mixPractice(shared, opts.limit || DEFAULT_PRACTICE_LIMIT);
      return shared.slice(0, opts.limit || DEFAULT_PRACTICE_LIMIT);
    }

    // Weakest ids among shared items; among all valid ones when no shared item is weak.
    function weakIds(valid, limit) {
      var byError = ctx.fn.weakByError && ctx.fn.weakByError(valid, limit);
      if (byError) return byError;
      var all = Object.keys(valid);
      var shared = preferShared(all);
      if (shared.length < all.length) {
        var sv = {};
        shared.forEach(function (id) { sv[id] = true; });
        var ids = dojo.call('weakest', { items: ctx.fn.records(), limit: limit, validIds: sv });
        if (ids.length > 0) return ids;
      }
      return dojo.call('weakest', { items: ctx.fn.records(), limit: limit, validIds: valid });
    }
    function weakValidIds() {
      var valid = {}, recs = ctx.fn.records(), seenEntity = {};
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
    function weakQueue(opts) {
      var valid = weakValidIds();
      return weakIds(valid, opts.limit || DEFAULT_WEAK_LIMIT);
    }
    function weakList(limit) {
      var valid = weakValidIds();
      var ids = weakIds(valid, limit);
      return ids.map(function (id) { return { id: id, prompt: byId[id] ? byId[id].prompt : '' }; });
    }
    return {
      scopedArgs: scopedArgs, scopedRecords: scopedRecords, scopedMemberList: scopedMemberList,
      entityViewOf: entityViewOf, groupCap: groupCap, groupOrder: groupOrder,
      dayStat: dayStat, extraNewToday: extraNewToday, extraGroup: extraGroup,
      groupUsed: groupUsed, groupedItemsUsedToday: groupedItemsUsedToday, groupQueueArgs: groupQueueArgs,
      globalNewPerDay: globalNewPerDay, newAllowance: newAllowance, buildUnitNewCaps: buildUnitNewCaps,
      buildItemUnits: buildItemUnits, resolveNewOrder: resolveNewOrder, preferShared: preferShared,
      unitIsExamOnly: unitIsExamOnly, builtQueue: builtQueue, rawBuiltQueue: rawBuiltQueue,
      dailyQueue: dailyQueue, matches: matches, practiceQueue: practiceQueue,
      weakIds: weakIds, weakValidIds: weakValidIds, weakQueue: weakQueue,
      weakList: weakList
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionQueues = api;
})(typeof self !== 'undefined' ? self : this);

