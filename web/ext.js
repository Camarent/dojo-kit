/*
 * ext.js — DojoExt: registry for build-time course plugins. Global DojoExt (UMD, like types/registry.js).
 */
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
  function registerVoiceRank(fn) { return registry.registerVoiceRank(fn); }
  function registerSetting(config) { return registry.registerSetting(config); }
  function bindSettings(fn) { return registry.bindSettings(fn); }
  function getSetting(key) { return registry.getSetting(key); }
  function getRegisteredSettings() { return registry.getRegisteredSettings(); }

  function use(name) { return rubyApi.use(name); }
  function text(str, opts) { return rubyApi.text(str, opts); }
  function plain(str) { return rubyApi.plain(str); }
  function textAll(str) { return rubyApi.textAll(str); }
  function useRuby(cfg, items) { return rubyApi.useRuby(cfg, items); }
  function expectedTexts(item) { return readingsApi.expectedTexts(item); }
  function answerTexts(item) { return readingsApi.answerTexts(item); }
  function kanjiBreakdown(item, items, cfgOrLang) { return readingsApi.kanjiBreakdown(item, items, cfgOrLang); }
  function useInputScript(scripts, message) { return readingsApi.useInputScript(scripts, message); }

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  function beforeSubmit(item, input) {
    if (S.scriptGuard) {
      try { var sg = S.scriptGuard(clone(item), clone(input)); if (sg) return { message: sg.message }; }
      catch (e) { warn('inputScript failed', e); }
    }
    if (!S.guard) return null;
    try { var r = S.guard(clone(item), clone(input)); if (r && typeof r === 'object' && typeof r.message === 'string') return { message: r.message }; return null; }
    catch (e) { warn('beforeSubmit failed', e); return null; }
  }

  function detail(item, ctx) {
    if (!S.detailFn) return null;
    try { var c = Object.assign({}, ctx); if (ctx && ctx.items !== undefined) c.items = clone(ctx.items);
      if (ctx && ctx.records !== undefined) c.records = clone(ctx.records);
      var r = S.detailFn(clone(item), c); return r === undefined ? null : r; }
    catch (e) { warn('detail failed', e); return null; }
  }

  function intro(card, item, ctx) {
    if (!S.introFn) return null;
    try { var c = Object.assign({}, ctx); if (ctx && ctx.items !== undefined) c.items = clone(ctx.items);
      if (ctx && ctx.records !== undefined) c.records = clone(ctx.records);
      var r = S.introFn(clone(card), clone(item), c); return r === undefined ? null : r; }
    catch (e) { warn('intro failed', e); return null; }
  }

  function voiceRank(voice, role) {
    if (!S.rankFn) return 0;
    try { var r = S.rankFn(voice, role); return typeof r === 'number' && isFinite(r) ? r : 0; }
    catch (e) { warn('voiceRank failed', e); return 0; }
  }

  function reset() {
    S.introFn = null; S.rankFn = null; S.markups = {}; S.active = null;
    S.rubySkip = null; S.rubyDict = null; S.rubyDictMax = 0; S.guard = null;
    S.scriptGuard = null; S.detailFn = null; S.pluginSettings = {};
    S.settingsAccessor = null; S.settingsBound = false;
  }

  return {
    registerMarkup: registerMarkup, registerBeforeSubmit: registerBeforeSubmit,
    registerDetail: registerDetail, registerIntro: registerIntro, registerVoiceRank: registerVoiceRank,
    registerSetting: registerSetting, bindSettings: bindSettings, getSetting: getSetting,
    getRegisteredSettings: getRegisteredSettings, use: use, useInputScript: useInputScript,
    useRuby: useRuby, text: text, textAll: textAll, plain: plain, beforeSubmit: beforeSubmit,
    detail: detail, intro: intro, voiceRank: voiceRank, reset: reset, kanjiBreakdown: kanjiBreakdown
  };
});
