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

  function create() {
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
          <p class="muted">${t('settings.newperday.hint')}</p>
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

  function sectionUnits(p, t, self) {
    return p.engine ? html`<section class="group" data-testid="unit-settings">
          <h2>${t('settings.unitSettings')}</h2>
          <p class="muted">${t('settings.unitSettings.hint')}</p>
          <ul class="unit-settings-list" data-testid="unit-settings-list">
            ${(p.course.units || []).map(function (unit) {
              var override = p.engine.unitSettings(unit.id);
              var hasOverride = Object.keys(override).length > 0;
              var summary = self.unitSettingsSummary(unit.id);
              return html`<li key=${unit.id} class="unit-settings-row" data-testid=${'unit-settings-row-' + unit.id}>
                <button type="button" class="btn unit-settings-btn" data-testid=${'btn-unit-settings-' + unit.id}
                  onClick=${function () { self.openUnitDialog(unit.id); }}>
                  <span class="unit-settings-title">${renderText(unit.title)}</span>
                  ${summary ? html`<span class="muted small unit-settings-summary" data-testid=${'unit-settings-summary-' + unit.id}>${summary}</span>` : null}
                  ${hasOverride ? html`<span class="unit-settings-override" data-testid=${'override-marker-' + unit.id} aria-label=${t('settings.unitSettings.overrideMarker')} title=${t('settings.unitSettings.overrideMarker')}>${t('settings.unitSettings.overrideMarker')}</span>` : null}
                </button>
              </li>`;
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
              var hasOverride = Object.keys(override).length > 0;
              var summary = self.groupSettingsSummary(group.id);
              return html`<li key=${group.id} class="unit-settings-row" data-testid=${'group-settings-row-' + group.id}>
                <button type="button" class="btn unit-settings-btn" data-testid=${'btn-group-settings-' + group.id}
                  onClick=${function () { self.openGroupDialog(group.id); }}>
                  <span class="unit-settings-title">${renderText(group.title)}</span>
                  ${summary ? html`<span class="muted small unit-settings-summary" data-testid=${'group-settings-summary-' + group.id}>${summary}</span>` : null}
                  ${hasOverride ? html`<span class="unit-settings-override" data-testid=${'override-marker-' + group.id} aria-label=${t('settings.unitSettings.overrideMarker')} title=${t('settings.unitSettings.overrideMarker')}>${t('settings.unitSettings.overrideMarker')}</span>` : null}
                </button>
              </li>`;
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
    var retired = p.content.items.filter(function (it) { return it.status === 'retired'; }).length;
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

  function unitDialogView(s, t, self) {
    return s.unitDialog ? html`<div class="overlay" data-testid="unit-settings-dialog">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="unit-settings-dialog-title" tabIndex="-1">
            <h2 id="unit-settings-dialog-title" data-testid="unit-settings-dialog-title">${t('settings.unitSettings.dialogTitle', { title: s.unitDialog.unitTitle })}</h2>
            <div class="group">
              <label class="legend-like" for="unit-newperday-stepper">${t('settings.unitSettings.newPerDay')}</label>
              <p class="muted small">${t('settings.unitSettings.newPerDay.hint')}</p>
              <${Stepper} testid="unit-newperday" id="unit-newperday-stepper" label=${t('settings.unitSettings.newPerDay')} 
                value=${s.unitDialog.effective.newPerDay} min=${0} max=${50} step=${1}
                decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')} 
                onChange=${function (v) { self.setUnitSettingField(s.unitDialog.unitId, 'newPerDay', v === s.unitDialog.course.newPerDay ? null : v); }} />
            </div>
            <div class="group">
              <label for=${'ladder-pace-' + s.unitDialog.unitId} class="legend-like">${t('settings.unitSettings.ladderPace')}</label>
              <p class="muted small">${t('settings.unitSettings.ladderPace.hint')}</p>
              <select id=${'ladder-pace-' + s.unitDialog.unitId} class="field" data-testid="unit-ladder-pace"
                value=${self.ladderScaleToValue(s.unitDialog.effective.ladderScale)}
                onChange=${function (e) { 
                  var value = self.ladderScaleFromValue(e.target.value);
                  self.setUnitSettingField(s.unitDialog.unitId, 'ladderScale', value === s.unitDialog.course.ladderScale ? null : value); 
                }}>
                ${['0.5', '0.75', '1', '1.5', '2', '3'].map(function (v) {
                  var labelKey = 'settings.unitSettings.ladderPace.option.';
                  if (v === '0.5') labelKey += 'muchDenser';
                  else if (v === '0.75') labelKey += 'denser';
                  else if (v === '1') labelKey += 'asInCourse';
                  else if (v === '1.5') labelKey += 'longer';
                  else if (v === '2') labelKey += 'muchLonger';
                  else if (v === '3') labelKey += 'x3';
                  return html`<option key=${v} value=${v}>${t(labelKey)}</option>`;
                })}
              </select>
              <p class="muted small" data-testid="ladder-preview">${t('settings.unitSettings.ladderPreview', { ladder: s.unitDialog.ladderPreview })}</p>
            </div>
            <div class="group">
              <label for=${'on-wrong-' + s.unitDialog.unitId} class="legend-like">${t('settings.unitSettings.onWrong')}</label>
              <p class="muted small">${t('settings.unitSettings.onWrong.hint')}</p>
              <select id=${'on-wrong-' + s.unitDialog.unitId} class="field" data-testid="unit-on-wrong"
                value=${String(s.unitDialog.effective.dropOnWrong)}
                onChange=${function (e) { 
                  var value = parseInt(e.target.value, 10);
                  self.setUnitSettingField(s.unitDialog.unitId, 'dropOnWrong', value === s.unitDialog.course.dropOnWrong ? null : value); 
                }}>
                ${[0, 1, 2, 3].concat(s.unitDialog.effective.dropOnWrong > 3 ? [s.unitDialog.effective.dropOnWrong] : []).map(function (v) {
                  var labelKey = 'settings.unitSettings.onWrong.option.';
                  if (v === 0) labelKey += 'keep';
                  else labelKey += 'drop' + v;
                  return html`<option key=${v} value=${v}>${v > 3 ? t('settings.unitSettings.dropN', { n: v }) : t(labelKey)}</option>`;
                })}
              </select>
            </div>
            <div class="group">
              <label for=${'new-order-' + s.unitDialog.unitId} class="legend-like">${t('settings.unitSettings.newOrder')}</label>
              <p class="muted small">${t('settings.unitSettings.newOrder.hint')}</p>
              <select id=${'new-order-' + s.unitDialog.unitId} class="field" data-testid="unit-new-order"
                value=${s.unitDialog.effective.newOrder}
                onChange=${function (e) { 
                  var value = e.target.value;
                  self.setUnitSettingField(s.unitDialog.unitId, 'newOrder', value === s.unitDialog.course.newOrder ? null : value); 
                }}>
                ${['file', 'random'].map(function (v) {
                  return html`<option key=${v} value=${v}>${t('settings.unitSettings.newOrder.option.' + v)}</option>`;
                })}
              </select>
            </div>
            <div class="row end">
              <button type="button" class="btn" data-testid="btn-unit-reset-cancel" onClick=${function () { self.closeUnitDialog(); }}>${t('cancel')}</button>
              <button type="button" class="btn primary" data-testid="btn-unit-save" onClick=${function () { self.closeUnitDialog(true); }}>${t('save')}</button>
              <button type="button" class="btn danger" data-testid="btn-unit-reset" 
                disabled=${Object.keys(s.unitDialog.override).length === 0}
                onClick=${function () { self.resetUnitSettings(s.unitDialog.unitId); }}>${t('settings.unitSettings.reset')}</button>
            </div>
          </div>
        </div>` : null;
  }

  function groupDialogView(s, t, self) {
    return s.groupDialog ? html`<div class="overlay" data-testid="group-settings-dialog">
          <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="group-settings-dialog-title" tabIndex="-1">
            <h2 id="group-settings-dialog-title" data-testid="group-settings-dialog-title">${t('settings.groupSettings.dialogTitle', { title: s.groupDialog.groupTitle })}</h2>
            <div class="group">
              <label class="legend-like" for="group-newperday-stepper">${t('settings.groupSettings.newPerDay')}</label>
              <p class="muted small">${t('settings.groupSettings.newPerDay.hint')}</p>
              <${Stepper} testid="group-newperday" id="group-newperday-stepper" label=${t('settings.groupSettings.newPerDay')} 
                value=${s.groupDialog.effective.newPerDay !== undefined ? s.groupDialog.effective.newPerDay : 0} min=${0} max=${50} step=${1}
                decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')} 
                onChange=${function (v) { self.setGroupSettingField(s.groupDialog.groupId, 'newPerDay', v === s.groupDialog.course.newPerDay ? null : v); }} />
            </div>
            <div class="group">
              <label for=${'group-new-order-' + s.groupDialog.groupId} class="legend-like">${t('settings.groupSettings.newOrder')}</label>
              <p class="muted small">${t('settings.groupSettings.newOrder.hint')}</p>
              <select id=${'group-new-order-' + s.groupDialog.groupId} class="field" data-testid="group-new-order"
                value=${s.groupDialog.effective.newOrder || 'file'}
                onChange=${function (e) { 
                  var value = e.target.value;
                  self.setGroupSettingField(s.groupDialog.groupId, 'newOrder', value === s.groupDialog.course.newOrder ? null : value); 
                }}>
                ${['file', 'random'].map(function (v) {
                  return html`<option key=${v} value=${v}>${t('settings.unitSettings.newOrder.option.' + v)}</option>`;
                })}
              </select>
            </div>
            ${s.groupDialog.extraTags && s.groupDialog.extraTags.length > 0 ? html`<div class="group">
              <label for=${'group-onlyTags-' + s.groupDialog.groupId} class="legend-like">${t('settings.groupSettings.onlyTags')}</label>
              <p class="muted small">${t('settings.groupSettings.onlyTags.hint')}</p>
              <select id=${'group-onlyTags-' + s.groupDialog.groupId} class="field" data-testid="group-onlyTags"
                value=${s.groupDialog.effective.onlyTags !== undefined ? (s.groupDialog.effective.onlyTags === true ? 'true' : 'false') : 'default'}
                onChange=${function (e) { 
                  var value = e.target.value === 'true' ? true : e.target.value === 'false' ? false : null;
                  self.setGroupSettingField(s.groupDialog.groupId, 'onlyTags', value === s.groupDialog.course.onlyTags ? null : value); 
                }}>
                <option value="default">${t('settings.unitSettings.noOverride')}</option>
                <option value="true">${t('session.known')}</option>
                <option value="false">${t('session.dontKnow')}</option>
              </select>
            </div>` : null}
            <div class="row end">
              <button type="button" class="btn" data-testid="btn-group-reset-cancel" onClick=${function () { self.closeGroupDialog(); }}>${t('cancel')}</button>
              <button type="button" class="btn primary" data-testid="btn-group-save" onClick=${function () { self.closeGroupDialog(true); }}>${t('save')}</button>
              <button type="button" class="btn danger" data-testid="btn-group-reset" 
                disabled=${Object.keys(s.groupDialog.override).length === 0}
                onClick=${function () { self.resetGroupSettings(s.groupDialog.groupId); }}>${t('settings.groupSettings.reset')}</button>
            </div>
          </div>
        </div>` : null;
  }

    return { renderPluginSettings: renderPluginSettings, sectionNewPerDay: sectionNewPerDay, sectionTheme: sectionTheme, sectionExamDate: sectionExamDate, sectionUnits: sectionUnits, sectionGroups: sectionGroups, sectionPlacement: sectionPlacement, sectionExport: sectionExport, sectionImport: sectionImport, sectionReset: sectionReset, sectionAbout: sectionAbout, unitDialogView: unitDialogView, groupDialogView: groupDialogView };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsSections = api;
})(typeof self !== 'undefined' ? self : this);
