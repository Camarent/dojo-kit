/*
 * ext/registry.js — plugin registry: hooks, plugin settings, and the register* functions.
 */
(function (root) {
  'use strict';

  var S = {
    markups: {}, active: null, scriptGuard: null, guard: null, detailFn: null, introFn: null, preTextFn: null, rankFn: null, feedbackRowsFn: null, storageProvider: null,
    pluginSettings: {}, settingsAccessor: null, settingsBound: false
  };

  function warn(msg, e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('DojoExt: ' + msg, e || '');
  }

  function registerMarkup(name, def) {
    if (typeof name !== 'string' || name === '') throw new Error('DojoExt.registerMarkup: name required');
    if (!def || typeof def.render !== 'function' || typeof def.plain !== 'function') {
      throw new Error('DojoExt.registerMarkup: render and plain functions required');
    }
    S.markups[name] = def;
  }

  function registerBeforeSubmit(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerBeforeSubmit: function required');
    S.guard = fn;
  }

  function registerDetail(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerDetail: function required');
    S.detailFn = fn;
  }

  function registerIntro(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerIntro: function required');
    S.introFn = fn;
  }

  function registerPreAnswerText(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerPreAnswerText: function required');
    S.preTextFn = fn;
  }

  function registerVoiceRank(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerVoiceRank: function required');
    S.rankFn = fn;
  }

  // fn(item, ctx) returns an array of feedback rows ({ ch, meaning, on, kun }) or null.
  // opts.fallback: a module default, used when the plugin hook is absent or yields null; reset() keeps it.
  // opts.aliases: { field: [legacyName, ...] } legacy row field names read when the canonical field is absent
  // (applies to every hook's rows; module-level, kept by reset()).
  // opts.label: { lang: text } feedback label replacing the core session.fbLabel text (module-level, kept by reset()).
  var fallbackRowsFn = null;
  var rowLabel = null;
  var rowAliases = {};
  function registerFeedbackRows(fn, opts) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerFeedbackRows: function required');
    if (opts && opts.aliases) Object.keys(opts.aliases).forEach(function (k) { rowAliases[k] = [].concat(opts.aliases[k]); });
    if (opts && opts.label && typeof opts.label === 'object') rowLabel = opts.label;
    if (opts && opts.fallback) fallbackRowsFn = fn;
    else S.feedbackRowsFn = fn;
  }

  // Returns a copy: the plugin's row may be frozen or shared, so it is never written to.
  function applyAliases(row) {
    if (!row || typeof row !== 'object') return row;
    var out = Object.assign({}, row);
    Object.keys(rowAliases).forEach(function (field) {
      if (out[field] !== undefined) return;
      for (var i = 0; i < rowAliases[field].length; i++) {
        var v = row[rowAliases[field][i]];
        if (v !== undefined) { out[field] = v; return; }
      }
    });
    return out;
  }

  function guardedRows(fn, item, ctx) {
    try { var r = fn(item, ctx); return Array.isArray(r) ? r.map(applyAliases) : null; }
    catch (e) { warn('feedbackRows failed', e); return null; }
  }

  // Label map registered with opts.label, or null.
  function feedbackLabel() { return rowLabel; }

  // Guarded like the other hooks: a throwing or null plugin hook falls back to the module default.
  function feedbackRows(item, ctx) {
    var r = S.feedbackRowsFn ? guardedRows(S.feedbackRowsFn, item, ctx) : null;
    if (r || !fallbackRowsFn) return r;
    return guardedRows(fallbackRowsFn, item, ctx);
  }

  // Storage provider for the progress document (openRef); one provider, a second call replaces the first.
  function registerStorage(provider) {
    if (!provider || typeof provider.openRef !== 'function') throw new Error('DojoExt.registerStorage: provider with openRef function required');
    if (S.storageProvider) warn('registerStorage: replacing the storage provider already registered');
    S.storageProvider = provider;
  }

  function getStorageProvider() { return S.storageProvider; }

  function checkSettingKey(key) {
    if (typeof key !== 'string' || key === '') throw new Error('DojoExt.registerSetting: key required');
    if (!/^[a-z][a-z0-9_.-]*$/.test(key)) {
      throw new Error('DojoExt.registerSetting: key must match /^[a-z][a-z0-9_.-]*$/, got "' + key + '"');
    }
  }

  function checkSettingLabel(label) {
    if (label === undefined) throw new Error('DojoExt.registerSetting: label required');
    if (typeof label !== 'string' && (typeof label !== 'object' || label === null || typeof label.en !== 'string')) {
      throw new Error('DojoExt.registerSetting: label must be a string or an object with a string en');
    }
  }

  function checkSettingOptions(options) {
    if (!Array.isArray(options)) throw new Error('DojoExt.registerSetting: options array required');
    if (options.length === 0) throw new Error('DojoExt.registerSetting: options array must not be empty');
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      if (!opt || typeof opt !== 'object' || typeof opt.value === 'undefined') {
        throw new Error('DojoExt.registerSetting: each option must have a "value" property');
      }
    }
  }

  function registerSetting(config) {
    if (!config || typeof config !== 'object') throw new Error('DojoExt.registerSetting: config object required');
    checkSettingKey(config.key);
    checkSettingLabel(config.label);
    checkSettingOptions(config.options);
    var def = config.default;
    if (def === undefined) throw new Error('DojoExt.registerSetting: default value required');

    S.pluginSettings[config.key] = {
      label: config.label,
      options: config.options,
      default: def
    };
  }

  function bindSettings(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.bindSettings: function required');
    S.settingsAccessor = fn;
    S.settingsBound = true;
  }

  function getSetting(key) {
    if (!Object.prototype.hasOwnProperty.call(S.pluginSettings, key)) return undefined;
    var setting = S.pluginSettings[key];

    // If bound and accessor returns a valid value, use it
    if (S.settingsBound && S.settingsAccessor) {
      try {
        // Use the plugin-prefixed key
        var stored = S.settingsAccessor('plugin:' + key);
        if (stored !== undefined && isValidOptionValue(setting, stored)) {
          return stored;
        }
      } catch (e) {
        warn('getSetting accessor failed', e);
      }
    }

    // Return default
    return setting.default;
  }

  function isValidOptionValue(setting, value) {
    for (var i = 0; i < setting.options.length; i++) {
      if (setting.options[i].value === value) return true;
    }
    return false;
  }

  function getRegisteredSettings() {
    return Object.keys(S.pluginSettings).map(function (key) {
      return Object.assign({ key: key }, S.pluginSettings[key]);
    });
  }

  // Markups that ship with modules (e.g. ruby); reset() keeps them, unlike registerMarkup ones.
  var builtinMarkups = {};

  function registerBuiltinMarkup(name, def) {
    if (typeof name !== 'string' || name === '') throw new Error('DojoExt.registerBuiltinMarkup: name required');
    if (!def || typeof def.render !== 'function' || typeof def.plain !== 'function') {
      throw new Error('DojoExt.registerBuiltinMarkup: render and plain functions required');
    }
    builtinMarkups[name] = def;
  }

  // Module state cleaners run by DojoExt.reset().
  var resetFns = [];
  function onReset(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.onReset: function required');
    resetFns.push(fn);
  }
  function runResets() { resetFns.forEach(function (fn) { fn(); }); }

  // Course hooks run by DojoExt.runCourse(course, content) when a course loads.
  var courseFns = [];
  function onCourse(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.onCourse: function required');
    courseFns.push(fn);
  }
  function runCourse(course, content) { courseFns.forEach(function (fn) { fn(course, content); }); }


  var api = {
    state: S,
    builtinMarkups: builtinMarkups,
    registerMarkup: registerMarkup,
    registerBeforeSubmit: registerBeforeSubmit,
    registerDetail: registerDetail,
    registerIntro: registerIntro,
    registerPreAnswerText: registerPreAnswerText,
    registerVoiceRank: registerVoiceRank,
    registerFeedbackRows: registerFeedbackRows,
    feedbackRows: feedbackRows, feedbackLabel: feedbackLabel,
    registerStorage: registerStorage,
    getStorageProvider: getStorageProvider,
    registerSetting: registerSetting,
    bindSettings: bindSettings,
    getSetting: getSetting,
    getRegisteredSettings: getRegisteredSettings,
    registerBuiltinMarkup: registerBuiltinMarkup,
    onReset: onReset,
    runResets: runResets,
    onCourse: onCourse,
    runCourse: runCourse,
    warn: warn
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExtRegistry = api;
})(typeof self !== 'undefined' ? self : this);
