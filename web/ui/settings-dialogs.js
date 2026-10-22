/*
 * ui/settings-dialogs.js — unit and group settings dialog state and handlers
 * Globals expected: DojoExt.
 * create() returns { install(Cls) }; install copies the dialog methods onto Cls.prototype.
 */
(function (root) {
  'use strict';

  var DojoExt = root.DojoExt || {};

  function create() {
  class SettingsDialogs {
    // Course-resolved value (WASM unitConfig, no user overrides). ladderScale has no course level: 1 = unscaled.
    getCourseUnitValue(unitId, field) {
      var p = this.props;
      if (field === 'ladderScale') return 1;
      var resolved = p.engine.unitConfig(unitId);
      if (field === 'newPerDay') {
        return typeof resolved.newPerDay === 'number' ? resolved.newPerDay : p.engine.globalNewPerDay();
      }
      if (field === 'dropOnWrong') {
        // srsByType is per item type: a unit whose items share one type shows that type's drop.
        var types = {};
        p.content.items.forEach(function (it) { if (it.unit === unitId && it.status !== 'retired') types[it.type] = true; });
        var names = Object.keys(types);
        if (names.length === 1 && typeof resolved.dropByType[names[0]] === 'number') return resolved.dropByType[names[0]];
      }
      return resolved[field];
    }
    getEffectiveUnitSettings(unitId) {
      var p = this.props;
      var override = p.engine.unitSettings(unitId);
      var courseUnit = null;
      var units = p.course.units || [];
      for (var i = 0; i < units.length; i++) {
        if (units[i].id === unitId) {
          courseUnit = units[i];
          break;
        }
      }
      var effective = {
        newPerDay: override.newPerDay !== undefined ? override.newPerDay : this.getCourseUnitValue(unitId, 'newPerDay'),
        ladderScale: override.ladderScale !== undefined ? override.ladderScale : this.getCourseUnitValue(unitId, 'ladderScale'),
        dropOnWrong: override.dropOnWrong !== undefined ? override.dropOnWrong : this.getCourseUnitValue(unitId, 'dropOnWrong'),
        newOrder: override.newOrder !== undefined ? override.newOrder : this.getCourseUnitValue(unitId, 'newOrder')
      };
      return { effective: effective, override: override, courseUnit: courseUnit };
    }
    unitSettingsSummary(unitId) {
      var t = this.props.t;
      var eff = this.getEffectiveUnitSettings(unitId);
      var e = eff.effective;
      var course = {
        newPerDay: this.getCourseUnitValue(unitId, 'newPerDay'),
        ladderScale: this.getCourseUnitValue(unitId, 'ladderScale'),
        dropOnWrong: this.getCourseUnitValue(unitId, 'dropOnWrong'),
        newOrder: this.getCourseUnitValue(unitId, 'newOrder')
      };
      var parts = [];
      var paceKey = eff.override.ladderScale === undefined ? 'settings.unitSettings.ladderPace.option.asInCourse' : 'settings.unitSettings.pace.x' + e.ladderScale;
      var pace = t(paceKey);
      if (pace && e.ladderScale !== course.ladderScale) parts.push(pace);
      var drop = e.dropOnWrong <= 3 ? t('settings.unitSettings.drop.' + e.dropOnWrong) : t('settings.unitSettings.dropN', { n: e.dropOnWrong });
      if (drop && e.dropOnWrong !== course.dropOnWrong) parts.push(drop);
      if (e.newPerDay !== undefined && e.newPerDay !== course.newPerDay) parts.push(e.newPerDay + '/' + t('duration.day.short'));
      var order = t('settings.unitSettings.order.' + e.newOrder);
      if (order && e.newOrder !== course.newOrder) parts.push(order);
      if (parts.length === 0) return '';
      return parts.join(', ');
    }
    formatLadderPreview(ladder, t) {
      if (!ladder || ladder.length === 0) return '';
      var parts = [];
      for (var i = 1; i < ladder.length; i++) {
        parts.push(Math.round(ladder[i] / 86400000) + t('duration.day.short'));
      }
      return parts.join(', ');
    }
    getLadderPreview(unitId) {
      var p = this.props;
      return this.formatLadderPreview(p.engine.unitLadder(unitId), p.t);
    }
    openUnitDialog(unitId) {
      var result = this.getEffectiveUnitSettings(unitId);
      var effective = result.effective;
      var override = result.override;
      var courseUnit = result.courseUnit;
      var unit = courseUnit || { id: unitId, title: unitId };
      var courseDefaults = {
        newPerDay: this.getCourseUnitValue(unitId, 'newPerDay'),
        ladderScale: this.getCourseUnitValue(unitId, 'ladderScale'),
        dropOnWrong: this.getCourseUnitValue(unitId, 'dropOnWrong'),
        newOrder: this.getCourseUnitValue(unitId, 'newOrder')
      };
      this.setState({
        unitDialog: {
          initial: Object.assign({}, override),
          unitId: unitId,
          unitTitle: DojoExt.plain ? DojoExt.plain(unit.title) : unit.title,
          effective: effective,
          override: override,
          course: {
            newPerDay: courseDefaults.newPerDay !== undefined ? courseDefaults.newPerDay : undefined,
            ladderScale: courseDefaults.ladderScale,
            dropOnWrong: courseDefaults.dropOnWrong !== undefined ? courseDefaults.dropOnWrong : undefined,
            newOrder: courseDefaults.newOrder !== undefined ? courseDefaults.newOrder : undefined
          },
          ladderPreview: this.getLadderPreview(unitId)
        }
      });
    }
    closeUnitDialog(keep) {
      var d = this.state.unitDialog;
      if (d && !keep && d.initial) {
        var patch = {};
        ['newPerDay', 'ladderScale', 'dropOnWrong', 'newOrder'].forEach(function (f) { patch[f] = d.initial[f] !== undefined ? d.initial[f] : null; });
        var r = this.props.engine.setUnitSetting(d.unitId, patch);
        if (!r.error) { this.props.onDataChanged(); this.setState({ exportText: this.props.store.exportText() }); }
      }
      this.setState({ unitDialog: null });
    }
    setUnitSettingField(unitId, field, value) {
      var p = this.props;
      var patch = {};
      patch[field] = value;
      var result = p.engine.setUnitSetting(unitId, patch);
      if (result.error) {
        this.props.onNotice({ kind: 'bad', text: p.t('settings.unitSettings.error', { field: field, error: result.error }) });
        return;
      }
      this.props.onDataChanged();
      this.setState({
        exportText: p.store.exportText(),
        unitDialog: this.state.unitDialog ? Object.assign({}, this.state.unitDialog, {
          effective: this.getEffectiveUnitSettings(unitId).effective,
          override: p.engine.unitSettings(unitId),
          ladderPreview: this.getLadderPreview(unitId)
        }) : null
      });
    }
    resetUnitSettings(unitId) {
      var p = this.props;
      var result = p.engine.setUnitSetting(unitId, { newPerDay: null, ladderScale: null, dropOnWrong: null, newOrder: null });
      if (result.error) {
        this.props.onNotice({ kind: 'bad', text: p.t('settings.unitSettings.reset.error') });
        return;
      }
      this.props.onDataChanged();
      this.setState({
        exportText: p.store.exportText(),
        unitDialog: null
      });
    }
    // Group settings helpers
    getEffectiveGroupSettings(groupId) {
      var p = this.props;
      var courseGroups = p.course.groups || [];
      var courseGroup = null;
      for (var i = 0; i < courseGroups.length; i++) {
        if (courseGroups[i].id === groupId) {
          courseGroup = courseGroups[i];
          break;
        }
      }
      var override = p.engine.groupSettings ? p.engine.groupSettings(groupId) : {};
      var effective = {
        newPerDay: override.newPerDay !== undefined ? override.newPerDay : (courseGroup ? courseGroup.newPerDay : undefined),
        newOrder: override.newOrder !== undefined ? override.newOrder : (courseGroup ? courseGroup.newOrder : 'file'),
        onlyTags: override.onlyTags !== undefined ? override.onlyTags : (courseGroup ? courseGroup.onlyTags : undefined)
      };
      return { effective: effective, override: override, courseGroup: courseGroup };
    }
    groupSettingsSummary(groupId) {
      var t = this.props.t;
      var eff = this.getEffectiveGroupSettings(groupId);
      var e = eff.effective;
      var courseGroup = eff.courseGroup;
      var courseDefaults = {
        newPerDay: courseGroup ? courseGroup.newPerDay : undefined,
        newOrder: courseGroup ? courseGroup.newOrder : 'file',
        onlyTags: courseGroup ? courseGroup.onlyTags : undefined
      };
      var parts = [];
      if (e.newPerDay !== undefined && e.newPerDay !== courseDefaults.newPerDay) {
        parts.push(e.newPerDay + '/' + t('duration.day.short'));
      }
      var order = t('settings.unitSettings.order.' + (e.newOrder || 'file'));
      if (order && e.newOrder !== courseDefaults.newOrder) parts.push(order);
      if (e.onlyTags !== undefined && JSON.stringify(e.onlyTags) !== JSON.stringify(courseDefaults.onlyTags)) {
        parts.push(t('settings.groupSettings.onlyTags') + ': ' + e.onlyTags);
      }
      if (parts.length === 0) return '';
      return parts.join(', ');
    }
    openGroupDialog(groupId) {
      var result = this.getEffectiveGroupSettings(groupId);
      var effective = result.effective;
      var override = result.override;
      var courseGroup = result.courseGroup || { id: groupId, title: groupId };
      var courseDefaults = {
        newPerDay: courseGroup.newPerDay !== undefined ? courseGroup.newPerDay : undefined,
        newOrder: courseGroup.newOrder !== undefined ? courseGroup.newOrder : 'file',
        onlyTags: courseGroup.onlyTags !== undefined ? courseGroup.onlyTags : undefined
      };
      this.setState({
        groupDialog: {
          initial: Object.assign({}, override),
          groupId: groupId,
          groupTitle: DojoExt.plain ? DojoExt.plain(courseGroup.title) : courseGroup.title,
          effective: effective,
          override: override,
          course: courseDefaults,
          extraTags: courseGroup.extraTags || []
        }
      });
    }
    closeGroupDialog(keep) {
      var d = this.state.groupDialog;
      if (d && !keep && d.initial) {
        var patch = {};
        ['newPerDay', 'newOrder', 'onlyTags', 'extraRandom'].forEach(function (f) { patch[f] = d.initial[f] !== undefined ? d.initial[f] : null; });
        var r = this.props.engine.setGroupSetting(d.groupId, patch);
        if (!r.error) { this.props.onDataChanged(); this.setState({ exportText: this.props.store.exportText() }); }
      }
      this.setState({ groupDialog: null });
    }
    setGroupSettingField(groupId, field, value) {
      var p = this.props;
      var patch = {};
      patch[field] = value;
      var result = p.engine.setGroupSetting(groupId, patch);
      if (result.error) {
        this.props.onNotice({ kind: 'bad', text: p.t('settings.groupSettings.error', { field: field, error: result.error }) });
        return;
      }
      this.props.onDataChanged();
      this.setState({
        exportText: p.store.exportText(),
        groupDialog: this.state.groupDialog ? Object.assign({}, this.state.groupDialog, {
          effective: this.getEffectiveGroupSettings(groupId).effective,
          override: p.engine.groupSettings ? p.engine.groupSettings(groupId) : {}
        }) : null
      });
    }
    resetGroupSettings(groupId) {
      var p = this.props;
      var result = p.engine.setGroupSetting(groupId, { newPerDay: null, newOrder: null, onlyTags: null, extraRandom: null });
      if (result.error) {
        this.props.onNotice({ kind: 'bad', text: p.t('settings.groupSettings.reset.error') });
        return;
      }
      this.props.onDataChanged();
      this.setState({
        exportText: p.store.exportText(),
        groupDialog: null
      });
    }
    ladderScaleToValue(scale) {
      if (scale === 0.5) return '0.5';
      if (scale === 0.75) return '0.75';
      if (scale === 1) return '1';
      if (scale === 1.5) return '1.5';
      if (scale === 2) return '2';
      if (scale === 3) return '3';
      return String(scale);
    }
    ladderScaleFromValue(value) {
      if (value === '0.5') return 0.5;
      if (value === '0.75') return 0.75;
      if (value === '1') return 1;
      if (value === '1.5') return 1.5;
      if (value === '2') return 2;
      if (value === '3') return 3;
      return parseFloat(value) || 1;
    }
  }

    function install(Cls) {
      Object.getOwnPropertyNames(SettingsDialogs.prototype).forEach(function (name) {
        if (name !== 'constructor') Cls.prototype[name] = SettingsDialogs.prototype[name];
      });
    }

    return { install: install };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsDialogs = api;
})(typeof self !== 'undefined' ? self : this);
