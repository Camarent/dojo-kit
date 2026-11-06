/*
 * ext.js — DojoExt: registry for build-time course plugins. Global DojoExt (UMD, like types/registry.js).
 */
function extClone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

// Hooks that can veto or decorate an answer or a detail view; each call is guarded so a plugin cannot break the app.
function extHooks(S, warn) {
  function beforeSubmit(item, input) {
    if (S.scriptGuard) {
      try { var sg = S.scriptGuard(extClone(item), extClone(input)); if (sg) return { message: sg.message }; }
      catch (e) { warn('inputScript failed', e); }
    }
    if (!S.guard) return null;
    try { var r = S.guard(extClone(item), extClone(input)); if (r && typeof r === 'object' && typeof r.message === 'string') return { message: r.message }; return null; }
    catch (e) { warn('beforeSubmit failed', e); return null; }
  }

  function detail(item, ctx) {
    if (!S.detailFn) return null;
    try { var c = Object.assign({}, ctx); if (ctx && ctx.items !== undefined) c.items = extClone(ctx.items);
      if (ctx && ctx.records !== undefined) c.records = extClone(ctx.records);
      var r = S.detailFn(extClone(item), c); return r === undefined ? null : r; }
    catch (e) { warn('detail failed', e); return null; }
  }

  function intro(card, item, ctx) {
    if (!S.introFn) return null;
    try { var c = Object.assign({}, ctx); if (ctx && ctx.items !== undefined) c.items = extClone(ctx.items);
      if (ctx && ctx.records !== undefined) c.records = extClone(ctx.records);
      var r = S.introFn(extClone(card), extClone(item), c); return r === undefined ? null : r; }
    catch (e) { warn('intro failed', e); return null; }
  }

  return { beforeSubmit: beforeSubmit, detail: detail, intro: intro };
}

// Text shown before the answer, voice ranking and state reset.
function extRenderHooks(S, warn) {
  // Text of item.explanation shown before the answer (inline intro); the plugin hook may drop answer-revealing parts.
  function preAnswerText(item, text) {
    if (!S.preTextFn) return text;
    try { var r = S.preTextFn(extClone(item), text); return typeof r === 'string' ? r : text; }
    catch (e) { warn('preAnswerText failed', e); return text; }
  }

  function voiceRank(voice, role) {
    if (!S.rankFn) return 0;
    try { var r = S.rankFn(voice, role); return typeof r === 'number' && isFinite(r) ? r : 0; }
    catch (e) { warn('voiceRank failed', e); return 0; }
  }

  function reset() {
    S.introFn = null; S.preTextFn = null; S.rankFn = null; S.markups = {}; S.active = null;
    S.rubySkip = null; S.rubyDict = null; S.rubyDictMax = 0; S.guard = null;
    S.scriptGuard = null; S.detailFn = null; S.feedbackRowsFn = null; S.pluginSettings = {}; S.storageProvider = null;
    S.settingsAccessor = null; S.settingsBound = false;
  }

  return { preAnswerText: preAnswerText, voiceRank: voiceRank, reset: reset };
}

(function (root, factory) {
  'use strict';
  var DojoExtRegistry = root.DojoExtRegistry || (typeof require !== 'undefined' ? require('./ext/registry.js') : null);
  var DojoExtRuby = root.DojoExtRuby || (typeof require !== 'undefined' ? require('./ext/ruby.js') : null);
  var DojoExtReadings = root.DojoExtReadings || (typeof require !== 'undefined' ? require('./ext/readings.js') : null);
  var api = factory(DojoExtRegistry, DojoExtRuby, DojoExtReadings);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExt = api;
})(typeof self !== 'undefined' ? self : this, function (registry, rubyApi, readingsApi) {
  'use strict';
  var S = registry.state; var warn = registry.warn;

  function registerMarkup(name, def) { return registry.registerMarkup(name, def); }
  function registerBeforeSubmit(fn) { return registry.registerBeforeSubmit(fn); }
  function registerDetail(fn) { return registry.registerDetail(fn); }
  function registerIntro(fn) { return registry.registerIntro(fn); }
  function registerPreAnswerText(fn) { return registry.registerPreAnswerText(fn); }
  function registerVoiceRank(fn) { return registry.registerVoiceRank(fn); }
  function registerFeedbackRows(fn) { return registry.registerFeedbackRows(fn); }
  function registerStorage(provider) { return registry.registerStorage(provider); }
  function getStorageProvider() { return registry.getStorageProvider(); }
  function registerSetting(config) { return registry.registerSetting(config); }
  function bindSettings(fn) { return registry.bindSettings(fn); }
  function getSetting(key) { return registry.getSetting(key); }
  function getRegisteredSettings() { return registry.getRegisteredSettings(); }

  function use(name) { return rubyApi.use(name); }
  function text(str, opts) { return rubyApi.text(str, opts); }
  function plain(str) { return rubyApi.plain(str); }
  function textAll(str) { return rubyApi.textAll(str); }
  function useRuby(cfg, items) { return rubyApi.useRuby(cfg, items); }
  function kanjiBreakdown(item, items, cfgOrLang) { return readingsApi.kanjiBreakdown(item, items, cfgOrLang); }
  function useInputScript(scripts, message) { return readingsApi.useInputScript(scripts, message); }

  var hooks = extHooks(S, warn);
  var render = extRenderHooks(S, warn);

  var api = {
    registerMarkup: registerMarkup, registerBeforeSubmit: registerBeforeSubmit,
    registerDetail: registerDetail, registerIntro: registerIntro, registerPreAnswerText: registerPreAnswerText, preAnswerText: render.preAnswerText, registerVoiceRank: registerVoiceRank,
    registerFeedbackRows: registerFeedbackRows, feedbackRows: function (item, ctx) { return registry.feedbackRows(item, ctx); },
    registerStorage: registerStorage, getStorageProvider: getStorageProvider,
    registerSetting: registerSetting, bindSettings: bindSettings, getSetting: getSetting,
    getRegisteredSettings: getRegisteredSettings, use: use, useInputScript: useInputScript,
    useRuby: useRuby, text: text, textAll: textAll, plain: plain, beforeSubmit: hooks.beforeSubmit,
    detail: hooks.detail, intro: hooks.intro, voiceRank: render.voiceRank, reset: render.reset, kanjiBreakdown: kanjiBreakdown,
    provide: provide
  };

  // Plugin extension point: adds fn as DojoExt[name]. Core names and earlier provides are refused (warn), the first one wins.
  function provide(name, fn) {
    if (typeof name !== 'string' || name === '') throw new Error('DojoExt.provide: name required');
    if (typeof fn !== 'function') throw new Error('DojoExt.provide: function required');
    if (name === '__proto__' || name in Object.prototype || Object.prototype.hasOwnProperty.call(api, name)) { warn('provide: "' + name + '" is taken, keeping the first'); return false; }
    api[name] = fn;
    return true;
  }

  return api;
});
