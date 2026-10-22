/* session/placement-queue.js — placement queue building (self and check modes) of the study session engine.
 * Exports DojoSessionPlacementQueue: create(ctx) -> { placementQueue }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var hashString = util.hashString;
  var mulberry32 = util.mulberry32;
  var shuffledIndexes = util.shuffledIndexes;

  function create(ctx) {
    var course = ctx.course;

    function placementQueue(opts) {
      var mode = ctx.fn.placementMode();
      var perUnit = opts.perUnit || ctx.fn.placementPerUnit();
      var sessionSeed = opts.seed;
      
      if (mode === 'self') {
        var sampled = [];
        var units = course.units || [];
        units.forEach(function (unit) {
          if (unit.placement === false) return;
          var unitItems = ctx.fn.activeItems().filter(function (it) { return it.unit === unit.id; });
          if (unitItems.length === 0) return;
          var count = Math.min(perUnit, unitItems.length);
          var indices = shuffledIndexes(unitItems.length, sessionSeed + '|' + unit.id).slice(0, count);
          indices.forEach(function (idx) { sampled.push(unitItems[idx].id); });
        });
        return sampled;
      }
      
      // Check mode: skip card items, mix types, interleave units
      var SELF_RATED_TYPES = ['card'];
      var units = course.units || [];
      var includedUnits = units.filter(function (unit) { return unit.placement !== false; });
      
      // Filter items: active, not self-rated, in included units
      var allItems = ctx.fn.activeItems().filter(function (it) {
        return SELF_RATED_TYPES.indexOf(it.type) < 0 && 
               includedUnits.some(function (u) { return u.id === it.unit; });
      });
      
      if (allItems.length === 0) return [];
      
      // Group by unit
      var itemsByUnit = {};
      allItems.forEach(function (item) {
        if (!itemsByUnit[item.unit]) itemsByUnit[item.unit] = [];
        itemsByUnit[item.unit].push(item);
      });
      
      // For each unit, group by type
      var byUnitAndType = {};
      Object.keys(itemsByUnit).forEach(function (unitId) {
        byUnitAndType[unitId] = {};
        itemsByUnit[unitId].forEach(function (item) {
          if (!byUnitAndType[unitId][item.type]) byUnitAndType[unitId][item.type] = [];
          byUnitAndType[unitId][item.type].push(item);
        });
      });
      
      // Sample per unit with mixed types via round-robin
      var sampledByUnit = {};
      var unitIds = Object.keys(byUnitAndType);
      
      unitIds.forEach(function (unitId) {
        var types = Object.keys(byUnitAndType[unitId]);
        var maxForUnit = Math.min(perUnit, itemsByUnit[unitId].length);
        
        // Deterministic type order from seed
        var typeOrder = types.slice();
        var typeSeed = hashString(sessionSeed + '|' + unitId);
        var typeRand = mulberry32(typeSeed);
        typeOrder.sort(function (a, b) {
          var ra = typeRand();
          var rb = typeRand();
          return ra < rb ? -1 : ra > rb ? 1 : 0;
        });
        
        // Collect items round-robin by type
        var collected = [];
        var typePos = {};
        types.forEach(function (t) { typePos[t] = 0; });
        
        var typeIndex = 0;
        while (collected.length < maxForUnit) {
          var typeKey = typeOrder[typeIndex % typeOrder.length];
          var items = byUnitAndType[unitId][typeKey];
          var pos = typePos[typeKey];
          
          if (pos < items.length) {
            collected.push(items[pos]);
            typePos[typeKey] = pos + 1;
          }
          
          typeIndex++;
          // If we've looped through all types and none had items, break
          if (typeIndex >= typeOrder.length * 2) break;
        }
        
        sampledByUnit[unitId] = collected;
      });
      
      // Interleave units using round-robin
      var result = [];
      var unitPos = {};
      unitIds.forEach(function (uid) { unitPos[uid] = 0; });
      
      var anyRemaining = true;
      while (anyRemaining) {
        anyRemaining = false;
        unitIds.forEach(function (uid) {
          var samples = sampledByUnit[uid];
          var pos = unitPos[uid];
          if (pos < samples.length) {
            result.push(samples[pos].id);
            unitPos[uid] = pos + 1;
            anyRemaining = true;
          }
        });
      }
      
      return result;
    }

    return { placementQueue: placementQueue };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionPlacementQueue = api;
})(typeof self !== 'undefined' ? self : this);
