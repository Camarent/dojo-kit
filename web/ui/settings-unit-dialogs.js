/*
 * ui/settings-unit-dialogs.js — unit and group settings dialog views (SettingsScreen).
 * Globals expected: preact, htm, DojoCommon.
 * create() returns { unitDialogView, groupDialogView } used by ui/settings-sections.js.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var Stepper = DojoCommon.Stepper;

  var PACE_LABEL_KEYS = { '0.5': 'muchDenser', '0.75': 'denser', '1': 'asInCourse', '1.5': 'longer', '2': 'muchLonger', '3': 'x3' };

  // Shared shape of a labelled dialog field. o: {id, testid, label, hint, value, onChange, options, after}.
  function selectField(o) {
    return html`<div class="group">
              <label for=${o.id} class="legend-like">${o.label}</label>
              <p class="muted small">${o.hint}</p>
              <select id=${o.id} class="field" data-testid=${o.testid} value=${o.value} onChange=${o.onChange}>${o.options}</select>
              ${o.after || null}
            </div>`;
  }

  function unitNewPerDayGroup(d, t, self) {
    return html`<div class="group">
              <label class="legend-like" for="unit-newperday-stepper">${t('settings.unitSettings.newPerDay')}</label>
              <p class="muted small">${t('settings.unitSettings.newPerDay.hint')}</p>
              <${Stepper} testid="unit-newperday" id="unit-newperday-stepper" label=${t('settings.unitSettings.newPerDay')}
                value=${d.effective.newPerDay} min=${0} max=${50} step=${1}
                decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')}
                onChange=${function (v) { self.setUnitSettingField(d.unitId, 'newPerDay', v === d.course.newPerDay ? null : v); }} />
            </div>`;
  }

  function unitLadderPaceGroup(d, t, self) {
    var options = ['0.5', '0.75', '1', '1.5', '2', '3'].map(function (v) {
      return html`<option key=${v} value=${v}>${t('settings.unitSettings.ladderPace.option.' + PACE_LABEL_KEYS[v])}</option>`;
    });
    var onChange = function (e) {
      var value = self.ladderScaleFromValue(e.target.value);
      self.setUnitSettingField(d.unitId, 'ladderScale', value === d.course.ladderScale ? null : value);
    };
    return selectField({ id: 'ladder-pace-' + d.unitId, testid: 'unit-ladder-pace', label: t('settings.unitSettings.ladderPace'),
      hint: t('settings.unitSettings.ladderPace.hint'), value: self.ladderScaleToValue(d.effective.ladderScale), onChange: onChange, options: options,
      after: html`<p class="muted small" data-testid="ladder-preview">${t('settings.unitSettings.ladderPreview', { ladder: d.ladderPreview })}</p>` });
  }

  function unitOnWrongGroup(d, t, self) {
    var options = [0, 1, 2, 3].concat(d.effective.dropOnWrong > 3 ? [d.effective.dropOnWrong] : []).map(function (v) {
      return html`<option key=${v} value=${v}>${v > 3 ? t('settings.unitSettings.dropN', { n: v }) : t('settings.unitSettings.onWrong.option.' + (v === 0 ? 'keep' : 'drop' + v))}</option>`;
    });
    var onChange = function (e) {
      var value = parseInt(e.target.value, 10);
      self.setUnitSettingField(d.unitId, 'dropOnWrong', value === d.course.dropOnWrong ? null : value);
    };
    return selectField({ id: 'on-wrong-' + d.unitId, testid: 'unit-on-wrong', label: t('settings.unitSettings.onWrong'),
      hint: t('settings.unitSettings.onWrong.hint'), value: String(d.effective.dropOnWrong), onChange: onChange, options: options });
  }

  function unitNewOrderGroup(d, t, self) {
    var options = ['file', 'random'].map(function (v) {
      return html`<option key=${v} value=${v}>${t('settings.unitSettings.newOrder.option.' + v)}</option>`;
    });
    var onChange = function (e) {
      var value = e.target.value;
      self.setUnitSettingField(d.unitId, 'newOrder', value === d.course.newOrder ? null : value);
    };
    return selectField({ id: 'new-order-' + d.unitId, testid: 'unit-new-order', label: t('settings.unitSettings.newOrder'),
      hint: t('settings.unitSettings.newOrder.hint'), value: d.effective.newOrder, onChange: onChange, options: options });
  }

  function unitDialogView(s, t, self) {
    var d = s.unitDialog;
    return d ? html`<div class="overlay" data-testid="unit-settings-dialog">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="unit-settings-dialog-title" tabIndex="-1">
            <h2 id="unit-settings-dialog-title" data-testid="unit-settings-dialog-title">${t('settings.unitSettings.dialogTitle', { title: d.unitTitle })}</h2>
            ${unitNewPerDayGroup(d, t, self)}
            ${unitLadderPaceGroup(d, t, self)}
            ${unitOnWrongGroup(d, t, self)}
            ${unitNewOrderGroup(d, t, self)}
            <div class="row end">
              <button type="button" class="btn" data-testid="btn-unit-reset-cancel" onClick=${function () { self.closeUnitDialog(); }}>${t('cancel')}</button>
              <button type="button" class="btn primary" data-testid="btn-unit-save" onClick=${function () { self.closeUnitDialog(true); }}>${t('save')}</button>
              <button type="button" class="btn danger" data-testid="btn-unit-reset"
                disabled=${Object.keys(d.override).length === 0}
                onClick=${function () { self.resetUnitSettings(d.unitId); }}>${t('settings.unitSettings.reset')}</button>
            </div>
          </div>
        </div>` : null;
  }

  function groupDialogView(s, t, self) {
    var g = s.groupDialog;
    var newOrderOptions = ['file', 'random'].map(function (v) {
      return html`<option key=${v} value=${v}>${t('settings.unitSettings.newOrder.option.' + v)}</option>`;
    });
    var onlyTagsOptions = [html`<option value="default">${t('settings.unitSettings.noOverride')}</option>`, html`<option value="true">${t('session.known')}</option>`, html`<option value="false">${t('session.dontKnow')}</option>`];
    return g ? html`<div class="overlay" data-testid="group-settings-dialog">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="group-settings-dialog-title" tabIndex="-1">
            <h2 id="group-settings-dialog-title" data-testid="group-settings-dialog-title">${t('settings.groupSettings.dialogTitle', { title: g.groupTitle })}</h2>
            <div class="group">
              <label class="legend-like" for="group-newperday-stepper">${t('settings.groupSettings.newPerDay')}</label>
              <p class="muted small">${t('settings.groupSettings.newPerDay.hint')}</p>
              <${Stepper} testid="group-newperday" id="group-newperday-stepper" label=${t('settings.groupSettings.newPerDay')}
                value=${g.effective.newPerDay !== undefined ? g.effective.newPerDay : 0} min=${0} max=${50} step=${1}
                decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')}
                onChange=${function (v) { self.setGroupSettingField(g.groupId, 'newPerDay', v === g.course.newPerDay ? null : v); }} />
            </div>
            ${selectField({ id: 'group-new-order-' + g.groupId, testid: 'group-new-order', label: t('settings.groupSettings.newOrder'),
              hint: t('settings.groupSettings.newOrder.hint'), value: g.effective.newOrder || 'file', options: newOrderOptions,
              onChange: function (e) {
                var value = e.target.value;
                self.setGroupSettingField(g.groupId, 'newOrder', value === g.course.newOrder ? null : value);
              } })}
            ${g.extraTags && g.extraTags.length > 0 ? selectField({ id: 'group-onlyTags-' + g.groupId, testid: 'group-onlyTags', label: t('settings.groupSettings.onlyTags'),
              hint: t('settings.groupSettings.onlyTags.hint'), value: g.effective.onlyTags !== undefined ? (g.effective.onlyTags === true ? 'true' : 'false') : 'default', options: onlyTagsOptions,
              onChange: function (e) {
                var value = e.target.value === 'true' ? true : e.target.value === 'false' ? false : null;
                self.setGroupSettingField(g.groupId, 'onlyTags', value === g.course.onlyTags ? null : value);
              } }) : null}
            <div class="row end">
              <button type="button" class="btn" data-testid="btn-group-reset-cancel" onClick=${function () { self.closeGroupDialog(); }}>${t('cancel')}</button>
              <button type="button" class="btn primary" data-testid="btn-group-save" onClick=${function () { self.closeGroupDialog(true); }}>${t('save')}</button>
              <button type="button" class="btn danger" data-testid="btn-group-reset"
                disabled=${Object.keys(g.override).length === 0}
                onClick=${function () { self.resetGroupSettings(g.groupId); }}>${t('settings.groupSettings.reset')}</button>
            </div>
          </div>
        </div>` : null;
  }

  function create() {
    return { unitDialogView: unitDialogView, groupDialogView: groupDialogView };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsUnitDialogs = api;
})(typeof self !== 'undefined' ? self : this);
