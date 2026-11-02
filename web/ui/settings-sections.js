/*
 * ui/settings-sections.js — SettingsScreen section views, renderPluginSettings
 * Globals expected: preact, htm, DojoExt, DojoI18n, DojoCommon.
 * create() returns the section view functions used by ui/settings.js and renderPluginSettings.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};
  var DojoI18n = root.DojoI18n || (typeof require !== 'undefined' ? require('./i18n.js') : null) || {};
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var renderText = DojoCommon.renderText;
  var Stepper = DojoCommon.Stepper;

  var PACE_LABEL_KEYS = { '0.5': 'muchDenser', '0.75': 'denser', '1': 'asInCourse', '1.5': 'longer', '2': 'muchLonger', '3': 'x3' };

  function resolveLabel(label, lang) {
    if (typeof label === 'string') return label;
    if (label && typeof label === 'object') {
      if (typeof label[lang] === 'string') return label[lang];
      if (typeof label[DojoI18n.primaryTag(lang)] === 'string') return label[DojoI18n.primaryTag(lang)];
      if (typeof label.en === 'string') return label.en;
    }
    return '';
  }

  function renderPluginSettings(p, self) {
    var registeredSettings = DojoExt.getRegisteredSettings ? DojoExt.getRegisteredSettings() : [];
    if (registeredSettings.length === 0) return null;

    var t = p.t;
    var doc = p.store.doc;
    var lang = p.lang || (p.course && p.course.uiLanguage) || 'en';

    return html`<section class="group" data-testid="plugin-settings">
      <h2>${t('settings.plugins')}</h2>
      ${registeredSettings.map(function (setting) {
        var currentValue = doc.settings && doc.settings['plugin:' + setting.key];
        var effectiveValue = setting.default;
        setting.options.forEach(function (o) { if (o.value === currentValue) effectiveValue = currentValue; });
        var selId = 'plugin-setting-' + setting.key;
        var label = resolveLabel(setting.label, lang);
        return html`<div class="setting-row" key=${setting.key} data-testid="plugin-setting-${setting.key}">
          <label for=${selId}>${label}</label>
          <select class="field" id=${selId} data-testid="select-${setting.key}" value=${effectiveValue}
            onChange=${function (e) {
              var raw = e.target.value;
              var match = setting.options.filter(function (o) { return String(o.value) === raw; })[0];
              if (match) self.setSetting('plugin:' + setting.key, match.value);
            }}>
            ${setting.options.map(function (opt) {
              var optLabel = resolveLabel(opt.label || opt.value, lang);
              return html`<option key=${opt.value} value=${opt.value}>${optLabel}</option>`;
            })}
          </select>
        </div>`;
      })}
    </section>`;
  }

  function sectionNewPerDay(p, t, self) {
    var perDay = p.store.doc.settings && typeof p.store.doc.settings.newPerDay === 'number' ? p.store.doc.settings.newPerDay : p.engine.globalNewPerDay();
    return html`<section class="group">
          <h2>${t('settings.newperday')}</h2>
          <p class="muted">${t(p.course && p.course.groups && p.course.groups.length ? 'settings.newperday.hintGroups' : 'settings.newperday.hint')}</p>
          <${Stepper} testid="newperday" label=${t('settings.newperday')} value=${perDay} min=${0} max=${50} step=${1}
            decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')} onChange=${function (v) { self.setNewPerDay(v); }} />
        </section>`;
  }

  function sectionTheme(p, t, self) {
    var doc = p.store.doc;
    var theme = doc.settings && doc.settings.theme ? doc.settings.theme : 'auto';
    return html`<section class="group">
          <h2><label for="theme-select">${t('settings.theme')}</label></h2>
          <p class="muted">${t('settings.theme.hint')}</p>
          <select id="theme-select" class="field" data-testid="theme-select" value=${theme}
            onChange=${function (e) { self.setTheme(e.target.value); }}>
            ${['auto', 'light', 'dark'].map(function (v) {
              return html`<option key=${v} value=${v} selected=${theme === v}>${t('settings.theme.' + v)}</option>`;
            })}
          </select>
        </section>`;
  }

  function sectionExamDate(p, t, self) {
    var doc = p.store.doc;
    var examDate = doc.settings && doc.settings.examDate ? doc.settings.examDate : '';
    return html`<section class="group">
          <h2><label for="exam-date">${t('settings.examDate')}</label></h2>
          <p class="muted">${t('settings.examDate.hint')}</p>
          <input id="exam-date" type="date" class="field" data-testid="exam-date" value=${examDate}
            onChange=${function (e) { self.setSetting('examDate', e.target.value || ''); }} />
        </section>`;
  }

  // One row of a units/groups override list. o: {t, self, kind ('unit'|'group'), item, summary, hasOverride, open (self method name)}.
  function settingsRow(o) {
    var t = o.t;
    var prefix = o.kind + '-settings';
    var item = o.item;
    return html`<li key=${item.id} class="unit-settings-row" data-testid=${prefix + '-row-' + item.id}>
                <button type="button" class="btn unit-settings-btn" data-testid=${'btn-' + prefix + '-' + item.id}
                  onClick=${function () { o.self[o.open](item.id); }}>
                  <span class="unit-settings-title">${renderText(item.title)}</span>
                  ${o.summary ? html`<span class="muted small unit-settings-summary" data-testid=${prefix + '-summary-' + item.id}>${o.summary}</span>` : null}
                  ${o.hasOverride ? html`<span class="unit-settings-override" data-testid=${'override-marker-' + item.id} aria-label=${t('settings.unitSettings.overrideMarker')} title=${t('settings.unitSettings.overrideMarker')}>${t('settings.unitSettings.overrideMarker')}</span>` : null}
                </button>
              </li>`;
  }

  function sectionUnits(p, t, self) {
    return p.engine ? html`<section class="group" data-testid="unit-settings">
          <h2>${t('settings.unitSettings')}</h2>
          <p class="muted">${t('settings.unitSettings.hint')}</p>
          <ul class="unit-settings-list" data-testid="unit-settings-list">
            ${(p.course.units || []).map(function (unit) {
              var hasOverride = Object.keys(p.engine.unitSettings(unit.id)).length > 0;
              return settingsRow({ t: t, self: self, kind: 'unit', item: unit, summary: self.unitSettingsSummary(unit.id), hasOverride: hasOverride, open: 'openUnitDialog' });
            })}
          </ul>
        </section>` : null;
  }

  function sectionGroups(p, t, self) {
    return (p.course.groups || []).length > 0 && p.engine && p.engine.setGroupSetting ? html`<section class="group" data-testid="group-settings">
          <h2>${t('settings.groupSettings')}</h2>
          <p class="muted">${t('settings.groupSettings.hint')}</p>
          <ul class="unit-settings-list" data-testid="group-settings-list">
            ${(p.course.groups || []).map(function (group) {
              var override = p.engine.groupSettings ? p.engine.groupSettings(group.id) : {};
              return settingsRow({ t: t, self: self, kind: 'group', item: group, summary: self.groupSettingsSummary(group.id), hasOverride: Object.keys(override).length > 0, open: 'openGroupDialog' });
            })}
          </ul>
        </section>` : null;
  }

  function sectionPlacement(p, t) {
    return p.course.placement !== undefined ? html`<section class="group">
          <h2>${t('home.placement')}</h2>
          <p class="muted">${t('placement.intro')}</p>
          <button type="button" class="btn" data-testid="btn-settings-placement" onClick=${function () { p.onPlacement(); }}>${t('home.placement')}</button>
        </section>` : null;
  }

  function sectionExport(s, t, self) {
    return html`<section class="group">
          <h2>${t('settings.export')}</h2>
          <p class="muted">${t('settings.export.hint')}</p>
          <textarea class="field mono" readOnly rows="5" data-testid="export-text" aria-label=${t('settings.export')} value=${s.exportText}
            ref=${function (el) { self.exportArea = el; }} onFocus=${function (e) { e.target.select(); }}></textarea>
          <div class="row">
            <button type="button" class="btn" data-testid="btn-copy" onClick=${function () { self.copy(); }}>${t('settings.copy')}</button>
            ${s.copied ? html`<span class="muted" role="status" data-testid="copy-msg">${s.copied === 'ok' ? t('settings.copied') : t('settings.copy.manual')}</span>` : null}
          </div>
        </section>`;
  }

  function sectionImport(s, t, self) {
    return html`<section class="group">
          <h2>${t('settings.import')}</h2>
          <p class="muted">${t('settings.import.hint')}</p>
          <textarea class="field mono" rows="4" data-testid="import-text" aria-label=${t('settings.import')} value=${s.importText}
            autocomplete="off" spellcheck=${false} onInput=${function (e) { self.setState({ importText: e.target.value, importMsg: null }); }}></textarea>
          <div class="row">
            <button type="button" class="btn" disabled=${s.importText.trim() === ''} data-testid="btn-import" onClick=${function () { self.doImport(); }}>${t('settings.import.btn')}</button>
            ${s.importMsg ? html`<span class=${s.importMsg.kind} role="status" data-testid="import-msg">${s.importMsg.text}</span>` : null}
          </div>
        </section>`;
  }

  function sectionReset(s, t, self) {
    return html`<section class="group">
          <h2>${t('settings.reset')}</h2>
          <p class="muted">${t('settings.reset.hint')}</p>
          ${s.resetStep === 0 ? html`<div class="row"><button type="button" class="btn danger" data-testid="btn-reset"
            onClick=${function () { self.setState({ resetStep: 1, resetDone: false }); }}>${t('settings.reset.btn')}</button>
            ${s.resetDone ? html`<span class="good" role="status" data-testid="reset-msg">${t('settings.reset.done')}</span>` : null}</div>` : html`<div class="confirm-box" data-testid="reset-confirm">
            <p><b>${t('settings.reset.sure')}</b></p>
            <div class="row">
              <button type="button" class="btn" data-testid="btn-reset-cancel" onClick=${function () { self.setState({ resetStep: 0 }); }}>${t('cancel')}</button>
              <button type="button" class="btn danger" data-testid="btn-reset-confirm" onClick=${function () { self.doReset(); }}>${t('settings.reset.confirm')}</button>
            </div></div>`}
        </section>`;
  }

  function sectionAbout(p, t) {
    var retired = p.content.items.filter(function (it) { return !DojoCommon.isActive(it); }).length;
    return html`<section class="group" data-testid="about">
          <h2>${t('settings.about')}</h2>
          <dl class="about">
            <dt>${t('about.course')}</dt><dd>${p.course.title}</dd>
            <dt>${t('about.version')}</dt><dd class="mono" data-testid="about-version">${p.content.version || '-'}</dd>
            <dt>${t('about.items')}</dt><dd>${t('about.items.value', { total: p.content.items.length, retired: retired })}</dd>
            <dt>${t('about.status')}</dt><dd>${t('status.' + p.status)}</dd>
          </dl>
        </section>`;
  }

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
    return {
      renderPluginSettings: renderPluginSettings, sectionNewPerDay: sectionNewPerDay, sectionTheme: sectionTheme,
      sectionExamDate: sectionExamDate, sectionUnits: sectionUnits, sectionGroups: sectionGroups,
      sectionPlacement: sectionPlacement, sectionExport: sectionExport, sectionImport: sectionImport,
      sectionReset: sectionReset, sectionAbout: sectionAbout, unitDialogView: unitDialogView, groupDialogView: groupDialogView
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsSections = api;
})(typeof self !== 'undefined' ? self : this);
