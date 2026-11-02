/* session/placement-queue.js — placement queue building (self and check modes) of the study session engine.
 * Exports DojoSessionPlacementQueue: create(ctx) -> { placementQueue }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var hashString = util.hashString;
  var mulberry32 = util.mulberry32;
  var shuffledIndexes = util.shuffledIndexes;

  var SELF_RATED_TYPES = ['card'];

  function selfQueue(ctx, perUnit, seed) {
    var sampled = [];
    (ctx.course.units || []).forEach(function (unit) {
      if (unit.placement === false) return;
      var unitItems = ctx.fn.activeItems().filter(function (it) { return it.unit === unit.id; });
      if (unitItems.length === 0) return;
      var count = Math.min(perUnit, unitItems.length);
      shuffledIndexes(unitItems.length, seed + '|' + unit.id).slice(0, count).forEach(function (idx) {
        sampled.push(unitItems[idx].id);
      });
    });
    return sampled;
  }

  // byUnit[unitId][type] -> items (insertion order kept)
  function groupByUnitAndType(items) {
    var byUnit = {};
    items.forEach(function (item) {
      var types = byUnit[item.unit] || (byUnit[item.unit] = {});
      (types[item.type] || (types[item.type] = [])).push(item);
    });
    return byUnit;
  }

  function typeOrderFor(types, seed) {
    var rand = mulberry32(hashString(seed));
    return types.slice().sort(function () {
      var ra = rand();
      var rb = rand();
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
  }

  // Round-robin over types; stops after two empty passes' worth of tries.
  function collectUnit(byType, typeOrder, max) {
    var collected = [];
    var typePos = {};
    typeOrder.forEach(function (t) { typePos[t] = 0; });
    var typeIndex = 0;
    while (collected.length < max) {
      var typeKey = typeOrder[typeIndex % typeOrder.length];
      var items = byType[typeKey];
      if (typePos[typeKey] < items.length) collected.push(items[typePos[typeKey]++]);
      typeIndex++;
      if (typeIndex >= typeOrder.length * 2) break;
    }
    return collected;
  }

  function interleave(unitIds, sampledByUnit) {
    var result = [];
    var pos = 0;
    var anyRemaining = true;
    while (anyRemaining) {
      anyRemaining = false;
      unitIds.forEach(function (uid) {
        if (pos < sampledByUnit[uid].length) {
          result.push(sampledByUnit[uid][pos].id);
          anyRemaining = true;
        }
      });
      pos++;
    }
    return result;
  }

  // Check mode: skip card items, mix types, interleave units
  function checkQueue(ctx, perUnit, seed) {
    var included = (ctx.course.units || []).filter(function (unit) { return unit.placement !== false; });
    var allItems = ctx.fn.activeItems().filter(function (it) {
      return SELF_RATED_TYPES.indexOf(it.type) < 0 && included.some(function (u) { return u.id === it.unit; });
    });
    if (allItems.length === 0) return [];
    var byUnit = groupByUnitAndType(allItems);
    var unitIds = Object.keys(byUnit);
    var sampledByUnit = {};
    unitIds.forEach(function (unitId) {
      var types = Object.keys(byUnit[unitId]);
      var total = types.reduce(function (n, t) { return n + byUnit[unitId][t].length; }, 0);
      sampledByUnit[unitId] = collectUnit(byUnit[unitId], typeOrderFor(types, seed + '|' + unitId), Math.min(perUnit, total));
    });
    return interleave(unitIds, sampledByUnit);
  }

  function create(ctx) {
    function placementQueue(opts) {
      var perUnit = opts.perUnit || ctx.fn.placementPerUnit();
      return ctx.fn.placementMode() === 'self' ? selfQueue(ctx, perUnit, opts.seed) : checkQueue(ctx, perUnit, opts.seed);
    }
    return { placementQueue: placementQueue };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionPlacementQueue = api;
})(typeof self !== 'undefined' ? self : this);
