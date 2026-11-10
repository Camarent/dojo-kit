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

  var UNIT_FIELD_CHECKS = {
    newPerDay: function (v) { return Number.isInteger(v) && v >= 0 && v <= 50; },
    ladderScale: function (v) { return typeof v === 'number' && isFinite(v) && v >= 0.25 && v <= 4; },
    dropOnWrong: function (v) { return Number.isInteger(v) && v >= 0 && v <= 10; },
    newOrder: function (v) { return v === 'file' || v === 'random'; }
  };

  var GROUP_FIELD_CHECKS = {
    newPerDay: function (v) { return Number.isInteger(v) && v >= 0 && v <= 50; },
    newOrder: function (v) { return v === 'file' || v === 'random'; },
    onlyTags: function (v) { return typeof v === 'boolean'; },
    extraRandom: function (v) { return typeof v === 'boolean'; }
  };

  function validateUnitOverrideField(k, v) {
    return Object.prototype.hasOwnProperty.call(UNIT_FIELD_CHECKS, k) && UNIT_FIELD_CHECKS[k](v);
  }

  function validateGroupOverrideField(k, v) {
    return Object.prototype.hasOwnProperty.call(GROUP_FIELD_CHECKS, k) && GROUP_FIELD_CHECKS[k](v);
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

  // Unit reads and writes. d = { ctx, course, dojo, unitStore, groupStore }.
  function unitSettingsApi(d) {
    var course = d.course;
    var dojo = d.dojo;
    var unitStore = d.unitStore;

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

    return {
      unitFieldKey: unitFieldKey, unitConfig: unitConfig, getUnitSettingsOverride: getUnitSettingsOverride,
      unitSettings: unitSettings, applyLadderScale: applyLadderScale, ladderForUnit: ladderForUnit,
      setUnitSetting: setUnitSetting
    };
  }

  // Ladder threshold and per-item drop. unit comes from unitSettingsApi.
  function ladderApi(d, unit) {
    var course = d.course;
    var dojo = d.dojo;

    function getUnitThreshold(unitId) {
      var courseThreshold = d.ctx.fn.learnedStage();
      var ladder = unit.ladderForUnit(unitId);
      if (!ladder || ladder.length === 0) return courseThreshold;
      var maxStage = ladder.length - 1;
      if (maxStage < courseThreshold) return maxStage;
      return courseThreshold;
    }

    function itemLadderFor(item) {
      return unit.applyLadderScale(dojo.call('ladderForUnit', { course: course, unitId: item.unit, itemType: item.type }), item.unit);
    }

    function dropForItem(item) {
      var override = unit.getUnitSettingsOverride(item.unit);
      if (override.dropOnWrong !== undefined) return override.dropOnWrong;
      return dojo.call('dropForUnit', { course: course, unitId: item.unit, itemType: item.type });
    }

    return { getUnitThreshold: getUnitThreshold, itemLadderFor: itemLadderFor, dropForItem: dropForItem };
  }

  function groupApi(d) {
    var groupStore = d.groupStore;
    var ctx = d.ctx;

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

    // True when the item's group has onlyTags on and the item carries none of the group's extraTags.
    function onlyTagsExcluded(item) {
      var gid = ctx.unitGroup[item.unit];
      var g = gid !== undefined ? ctx.groupById[gid] : null;
      var tags = g && g.extraTags || [];
      if (!tags.length || groupSettings(gid).onlyTags !== true) return false;
      return !(item.tags || []).some(function (t) { return tags.indexOf(t) >= 0; });
    }

    // Keeps the ids whose item is not onlyTags-excluded; unknown ids are kept.
    function onlyTagsKeep(ids) {
      return ids.filter(function (id) {
        var it = ctx.byId[id];
        return !it || !onlyTagsExcluded(it);
      });
    }

    return {
      groupFieldKey: groupFieldKey, groupSettings: groupSettings, setGroupSetting: setGroupSetting,
      onlyTagsExcluded: onlyTagsExcluded, onlyTagsKeep: onlyTagsKeep
    };
  }

  function create(ctx) {
    var d = {
      ctx: ctx,
      course: ctx.course,
      dojo: ctx.dojo,
      unitStore: overrideStore(ctx, 'unit', UNIT_OVERRIDE_FIELDS, validateUnitOverrideField),
      groupStore: overrideStore(ctx, 'group', GROUP_OVERRIDE_FIELDS, validateGroupOverrideField)
    };
    var unit = unitSettingsApi(d);
    return Object.assign({
      validateUnitOverrideField: validateUnitOverrideField, validateGroupOverrideField: validateGroupOverrideField,
      scaleLadder: scaleLadder
    }, unit, ladderApi(d, unit), groupApi(d));
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionOverrides = api;
})(typeof self !== 'undefined' ? self : this);
