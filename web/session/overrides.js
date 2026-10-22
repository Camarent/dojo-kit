/* session/overrides.js — per-unit and per-group user overrides and ladder helpers of the study session engine.
 * Exports DojoSessionOverrides: create(ctx) -> api.
 */
(function (root) {
  'use strict';

  function overrideStore(ctx, prefix, fields, validate) {
    function fieldKey(id, field) {
      return prefix + ':' + id + ':' + field;
    }

    // Per-field keys `<prefix>:<id>:<field>`; null is a tombstone and reads as absent.
    function read(id) {
      var settings = ctx.store.doc.settings || {};
      var result = {};
      fields.forEach(function (field) {
        var raw = settings[fieldKey(id, field)];
        if (raw !== undefined && raw !== null && validate(field, raw)) result[field] = raw;
      });
      return result;
    }

    function write(id, patch) {
      var settings = ctx.store.doc.settings || {};
      var hasChange = false;
      for (var pk in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, pk)) continue;
        var current = settings[fieldKey(id, pk)];
        if (patch[pk] === null ? (current !== undefined && current !== null) : current !== patch[pk]) hasChange = true;
      }
      if (!hasChange) return {};
      ctx.store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings.ts = doc.settings.ts || {};
        for (var pk in patch) {
          if (!Object.prototype.hasOwnProperty.call(patch, pk)) continue;
          var key = fieldKey(id, pk);
          doc.settings[key] = patch[pk];
          doc.settings.ts[key] = ctx.now();
        }
      });
      return {};
    }

    return { fieldKey: fieldKey, read: read, write: write };
  }

  function validateUnitOverrideField(k, v) {
    if (k === 'newPerDay') return Number.isInteger(v) && v >= 0 && v <= 50;
    if (k === 'ladderScale') return typeof v === 'number' && isFinite(v) && v >= 0.25 && v <= 4;
    if (k === 'dropOnWrong') return Number.isInteger(v) && v >= 0 && v <= 10;
    if (k === 'newOrder') return v === 'file' || v === 'random';
    return false;
  }

  function validateGroupOverrideField(k, v) {
    if (k === 'newPerDay') return Number.isInteger(v) && v >= 0 && v <= 50;
    if (k === 'newOrder') return v === 'file' || v === 'random';
    if (k === 'onlyTags' || k === 'extraRandom') return typeof v === 'boolean';
    return false;
  }

  function scaleLadder(ladder, scale) {
    if (scale === 1) return ladder;
    var out = ladder.map(function (v) { return v === 0 ? 0 : Math.round(v * scale); });
    for (var i = 1; i < out.length; i++) {
      if (out[i] < out[i - 1]) out[i] = out[i - 1];
    }
    return out;
  }

  var UNIT_OVERRIDE_FIELDS = ['newPerDay', 'ladderScale', 'dropOnWrong', 'newOrder'];
  var GROUP_OVERRIDE_FIELDS = ['newPerDay', 'newOrder', 'onlyTags', 'extraRandom'];

  function create(ctx) {
    var course = ctx.course;
    var dojo = ctx.dojo;
    var unitStore = overrideStore(ctx, 'unit', UNIT_OVERRIDE_FIELDS, validateUnitOverrideField);
    var groupStore = overrideStore(ctx, 'group', GROUP_OVERRIDE_FIELDS, validateGroupOverrideField);

    function unitFieldKey(unitId, field) {
      return unitStore.fieldKey(unitId, field);
    }

    // Course-resolved unit config from WASM (no user overrides); user overrides are layered on top in JS.
    function unitConfig(unitId) {
      return dojo.call('unitConfig', { course: course, unitId: unitId });
    }

    function getUnitSettingsOverride(unitId) {
      return unitStore.read(unitId);
    }

    function unitSettings(unitId) {
      return getUnitSettingsOverride(unitId);
    }

    function applyLadderScale(ladder, unitId) {
      var scale = getUnitSettingsOverride(unitId).ladderScale;
      return scale !== undefined && scale !== 1 && ladder && ladder.length ? scaleLadder(ladder, scale) : ladder;
    }

    function ladderForUnit(unitId) {
      return applyLadderScale(unitConfig(unitId).ladder, unitId);
    }

    function getUnitThreshold(unitId) {
      var courseThreshold = ctx.fn.learnedStage();
      var ladder = ladderForUnit(unitId);
      if (!ladder || ladder.length === 0) return courseThreshold;
      var maxStage = ladder.length - 1;
      if (maxStage < courseThreshold) return maxStage;
      return courseThreshold;
    }

    function itemLadderFor(item) {
      return applyLadderScale(dojo.call('ladderForUnit', { course: course, unitId: item.unit, itemType: item.type }), item.unit);
    }

    function dropForItem(item) {
      var override = getUnitSettingsOverride(item.unit);
      if (override.dropOnWrong !== undefined) return override.dropOnWrong;
      return dojo.call('dropForUnit', { course: course, unitId: item.unit, itemType: item.type });
    }

    function setUnitSetting(unitId, patch) {
      var validUnit = false;
      var units = course.units || [];
      for (var i = 0; i < units.length; i++) {
        if (units[i].id === unitId) {
          validUnit = true;
          break;
        }
      }
      if (!validUnit) return { error: 'unknown_unit' };
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k) && patch[k] !== null && !validateUnitOverrideField(k, patch[k])) {
          return { error: 'bad_value' };
        }
      }
      return unitStore.write(unitId, patch);
    }

    function groupFieldKey(groupId, field) {
      return groupStore.fieldKey(groupId, field);
    }

    function groupSettings(groupId) {
      return groupStore.read(groupId);
    }

    function setGroupSetting(groupId, patch) {
      if (!ctx.groupById[groupId]) return { error: 'unknown_group' };
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k) && (GROUP_OVERRIDE_FIELDS.indexOf(k) < 0 || (patch[k] !== null && !validateGroupOverrideField(k, patch[k])))) {
          return { error: 'bad_value' };
        }
      }
      return groupStore.write(groupId, patch);
    }

    return {
      unitFieldKey: unitFieldKey, unitConfig: unitConfig, validateUnitOverrideField: validateUnitOverrideField,
      getUnitSettingsOverride: getUnitSettingsOverride, unitSettings: unitSettings, scaleLadder: scaleLadder,
      setUnitSetting: setUnitSetting, applyLadderScale: applyLadderScale, ladderForUnit: ladderForUnit,
      getUnitThreshold: getUnitThreshold, itemLadderFor: itemLadderFor, dropForItem: dropForItem,
      groupFieldKey: groupFieldKey, validateGroupOverrideField: validateGroupOverrideField,
      groupSettings: groupSettings, setGroupSetting: setGroupSetting
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionOverrides = api;
})(typeof self !== 'undefined' ? self : this);
