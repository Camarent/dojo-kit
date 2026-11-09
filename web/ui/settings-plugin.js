/*
 * ui/settings-plugin.js — renderPluginSettings: one select per plugin setting registered through DojoExt.
 * Globals expected: preact, htm, DojoExt, DojoI18n. create() returns { renderPluginSettings }.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};
  var DojoI18n = root.DojoI18n || (typeof require !== 'undefined' ? require('./i18n.js') : null) || {};

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

  function create() {
    return { renderPluginSettings: renderPluginSettings };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsPlugin = api;
})(typeof self !== 'undefined' ? self : this);
