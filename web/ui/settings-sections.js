/*
 * ui/settings-sections.js — SettingsScreen section views
 * Globals expected: preact, htm, DojoCommon.
 * create() returns the section view functions used by ui/settings.js.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};
  var renderText = DojoCommon.renderText;
  var Stepper = DojoCommon.Stepper;

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

  // Shown when neither the save nor the course block sets a value; mirrors the core defaults (crates/dojo-core/src/session/config.rs).
  var SESSION_CORE_DEFAULTS = { sessionMode: 'auto', sessionCap: 0, dailyMinutes: 30, sessionMax: 60, reviewDays: 3, perUnitMax: 1, repeatMax: 1, knownDistinct: 1, sessionMix: ['weak', 'new', 'due'] };
  var SESSION_STEPPERS = [
    { name: 'sessionCap', min: 0, max: 500, label: 'settings.session.cap' },
    { name: 'dailyMinutes', min: 0, max: 600, label: 'settings.session.dailyMinutes' },
    { name: 'sessionMax', min: 0, max: 500, label: 'settings.session.sessionMax' },
    { name: 'reviewDays', min: 0, max: 365, label: 'settings.session.reviewDays' },
    { name: 'perUnitMax', min: 0, max: 20, label: 'settings.session.perUnitMax' },
    { name: 'repeatMax', min: 0, max: 20, label: 'settings.session.repeatMax' },
    { name: 'knownDistinct', min: 1, max: 20, label: 'settings.session.knownDistinct' },
  ];

  function sectionSession(p, t, self) {
    var saved = p.engine && p.engine.sessionOverrides ? p.engine.sessionOverrides() : {};
    var course = p.course.session || {};
    function current(name) {
      var key = 'session:' + name;
      if (Object.prototype.hasOwnProperty.call(saved, key)) return saved[key];
      return Object.prototype.hasOwnProperty.call(course, name) ? course[name] : SESSION_CORE_DEFAULTS[name];
    }
    var mode = current('sessionMode');
    var mix = current('sessionMix');
    // The mix select picks the kind that comes first; the other two keep the default order.
    function setMixFirst(kind) {
      self.setSetting('session:sessionMix', [kind].concat(SESSION_CORE_DEFAULTS.sessionMix.filter(function (k) { return k !== kind; })));
    }
    return html`<section class="group" data-testid="session-settings">
          <h2>${t('settings.session')}</h2>
          <p class="muted">${t('settings.session.hint')}</p>
          <label for="session-mode">${t('settings.session.mode')}</label>
          <select id="session-mode" class="field" data-testid="session-mode" value=${mode}
            onChange=${function (e) { self.setSetting('session:sessionMode', e.target.value); }}>
            <option value="auto" selected=${mode === 'auto'}>${t('settings.session.mode.auto')}</option>
            <option value="manual" selected=${mode === 'manual'}>${t('settings.session.mode.manual')}</option>
          </select>
          ${SESSION_STEPPERS.map(function (s) {
            return html`<${Stepper} key=${s.name} testid=${'session-' + s.name} label=${t(s.label)} value=${current(s.name)}
              min=${s.min} max=${s.max} step=${1} decLabel=${t('stepper.dec')} incLabel=${t('stepper.inc')}
              onChange=${function (v) { self.setSetting('session:' + s.name, v); }} />`;
          })}
          <label for="session-mix">${t('settings.session.mix')}</label>
          <select id="session-mix" class="field" data-testid="session-mix" value=${mix[0]}
            onChange=${function (e) { setMixFirst(e.target.value); }}>
            <option value="weak" selected=${mix[0] === 'weak'}>${t('settings.session.mix.weak')}</option>
            <option value="new" selected=${mix[0] === 'new'}>${t('settings.session.mix.new')}</option>
            <option value="due" selected=${mix[0] === 'due'}>${t('settings.session.mix.due')}</option>
          </select>
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

  var dialogsMod = root.DojoSettingsUnitDialogs || (typeof require !== 'undefined' ? require('./settings-unit-dialogs.js') : null);
  var dialogViews = dialogsMod.create();

  var topicsMod = root.DojoSettingsTopics || (typeof require !== 'undefined' ? require('./settings-topics.js') : null);
  var renderTopicsSettings = topicsMod ? topicsMod.create().renderTopicsSettings : null;
  function sectionTopics(p, self) { return renderTopicsSettings ? renderTopicsSettings(p, self) : null; }

  function create() {
    return {
      sectionNewPerDay: sectionNewPerDay, sectionTheme: sectionTheme, sectionTopics: sectionTopics,
      sectionExamDate: sectionExamDate, sectionSession: sectionSession, sectionUnits: sectionUnits, sectionGroups: sectionGroups,
      sectionPlacement: sectionPlacement, sectionExport: sectionExport, sectionImport: sectionImport,
      sectionReset: sectionReset, sectionAbout: sectionAbout, unitDialogView: dialogViews.unitDialogView, groupDialogView: dialogViews.groupDialogView
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsSections = api;
})(typeof self !== 'undefined' ? self : this);
