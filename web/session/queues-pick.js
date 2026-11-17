/* session/queues-pick.js — picker of the daily queue: random-order unit slots and extra-group new items.
 * Exports DojoSessionQueuesPick: { shuffleRandomUnits(ctx, h, order), queueWithExtraNew(ctx, h, args, order) }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var shuffledIndexes = util.shuffledIndexes;
  var GROUP_NEW_PREFIX = util.K.GROUP_NEW_PREFIX;

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

  var api = { shuffleRandomUnits: shuffleRandomUnits, queueWithExtraNew: queueWithExtraNew };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionQueuesPick = api;
})(typeof self !== 'undefined' ? self : this);
