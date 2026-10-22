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
  var S = registry.state; var builtinMarkups = registry.builtinMarkups;
  var warn = registry.warn; var hanOf = registry.hanOf; var pathValue = registry.pathValue;

  function registerMarkup(name, def) { return registry.registerMarkup(name, def); }
  function registerBeforeSubmit(fn) { return registry.registerBeforeSubmit(fn); }
  function registerDetail(fn) { return registry.registerDetail(fn); }
  function registerIntro(fn) { return registry.registerIntro(fn); }
  function registerVoiceRank(fn) { return registry.registerVoiceRank(fn); }
  function registerSetting(config) { return registry.registerSetting(config); }
  function bindSettings(fn) { return registry.bindSettings(fn); }
  function getSetting(key) { return registry.getSetting(key); }
  function getRegisteredSettings() { return registry.getRegisteredSettings(); }

  function use(name) {
    if (rubyApi) return rubyApi.use(name);
    S.active = null;
    if (name === undefined || name === null || name === '') return false;
    if (!Object.prototype.hasOwnProperty.call(S.markups, name) && Object.prototype.hasOwnProperty.call(builtinMarkups, name)) { S.active = builtinMarkups[name]; return true; }
    if (!Object.prototype.hasOwnProperty.call(S.markups, name)) { warn('markup "' + name + '" is not registered; using plain text'); return false; }
    S.active = S.markups[name]; return true;
  }

  function keyed(out) {
    if (!Array.isArray(out) || typeof preact === 'undefined' || !preact.cloneElement) return out;
    return out.map(function (c, i) {
      return c && typeof c === 'object' && c.props && (c.key === undefined || c.key === null) ? preact.cloneElement(c, { key: 'm' + i }) : c;
    });
  }

  function text(str, opts) {
    if (rubyApi) return rubyApi.text(str, opts);
    if (!S.active || typeof str !== 'string') return str;
    try { return keyed(S.active.render(str, typeof preact !== 'undefined' ? preact.h : undefined, opts)); }
    catch (e) { warn('markup render failed', e); return str; }
  }

  function plain(str) {
    if (rubyApi) return rubyApi.plain(str);
    if (!S.active || typeof str !== 'string') return str;
    try { var out = S.active.plain(str); return typeof out === 'string' ? out : str; }
    catch (e) { warn('markup plain failed', e); return str; }
  }

  function textAll(str) {
    if (rubyApi) return rubyApi.textAll(str);
    return text(str, { all: true });
  }

  function useRuby(cfg, items) {
    if (rubyApi) return rubyApi.useRuby(cfg, items);
    return registry.useRuby(cfg, items);
  }

  function expectedTexts(item) {
    if (readingsApi) return readingsApi.expectedTexts(item);
    var out = [];
    if (!item) return out;
    if (item.type === 'gap' && Array.isArray(item.answers)) out = item.answers.slice();
    else if (item.type === 'cloze' && Array.isArray(item.parts)) item.parts.forEach(function (p) { if (Array.isArray(p)) out = out.concat(p); });
    return out.filter(function (x) { return typeof x === 'string'; });
  }

  function answerTexts(item) {
    if (readingsApi) return readingsApi.answerTexts(item);
    var out = [];
    if (!item || item.type !== 'choice' || !Array.isArray(item.options)) return out;
    (Array.isArray(item.answer) ? item.answer : [item.answer]).forEach(function (a) { if (typeof item.options[a] === 'string') out.push(item.options[a]); });
    return out;
  }

  function kanjiBreakdown(item, items, cfgOrLang) {
    if (readingsApi) return readingsApi.kanjiBreakdown(item, items, cfgOrLang);
    if (!item) return [];
    var promptText = typeof item.prompt === 'string' ? plain(item.prompt) : '';
    var promptHan = hanOf(promptText);
    if (promptHan.length < 2) return [];
    var text = promptText;
    expectedTexts(item).forEach(function (t) { text += plain(t); });
    answerTexts(item).forEach(function (t) { text += plain(t); });
    var han = hanOf(text);
    var index = {};
    if (Array.isArray(items)) {
      var useConfig = typeof cfgOrLang === 'object' && cfgOrLang !== null;
      var keyPath = useConfig && cfgOrLang.key ? cfgOrLang.key : 'meta.kanji';
      var meaningPath = useConfig && cfgOrLang.meaning ? cfgOrLang.meaning : null;
      var readingsPaths = useConfig && Array.isArray(cfgOrLang.readings) ? cfgOrLang.readings : [];
      var ownKanji = pathValue(item, keyPath);
      items.forEach(function (it) {
        if (!it || typeof it !== 'object') return;
        var kanjiChar = pathValue(it, keyPath);
        if (typeof kanjiChar !== 'string' || kanjiChar.length !== 1) return;
        if (Object.prototype.hasOwnProperty.call(index, kanjiChar)) return;
        var meaning = useConfig && meaningPath ? pathValue(it, meaningPath) : (typeof cfgOrLang === 'string' ? (it.meta ? it.meta[cfgOrLang] : undefined) : undefined);
        if (typeof meaning !== 'string' || meaning.length === 0) return;
        var on = readingsPaths.length >= 1 ? pathValue(it, readingsPaths[0]) : undefined;
        var kun = readingsPaths.length >= 2 ? pathValue(it, readingsPaths[1]) : undefined;
        if (on !== undefined && (on === null || !Array.isArray(on))) on = undefined;
        if (kun !== undefined && (kun === null || !Array.isArray(kun))) kun = undefined;
        index[kanjiChar] = { kanji: kanjiChar, meaning: meaning, on: on, kun: kun };
      });
    }
    var seen = {}; var result = [];
    if (typeof ownKanji !== 'string' || ownKanji.length !== 1) ownKanji = null;
    han.forEach(function (c) { if (seen[c] || !Object.prototype.hasOwnProperty.call(index, c)) return; seen[c] = true; result.push(index[c]); });
    if (result.length === 0) return [];
    if (result.length === 1 && ownKanji && result[0].kanji === ownKanji) return [];
    return result.slice(0, 12);
  }

  function useInputScript(scripts, message) {
    if (readingsApi) return readingsApi.useInputScript(scripts, message);
    var SCRIPTS = {
      han: /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2CEAF}]/u, hiragana: /[\u3040-\u309f]/, katakana: /[\u30a0-\u30ff\uff65-\uff9f]/,
      cyrillic: /[\u0400-\u04ff]/, greek: /[\u0370-\u03ff\u1f00-\u1fff]/, arabic: /[\u0600-\u06ff\u0750-\u077f]/,
      hebrew: /[\u0590-\u05ff]/, hangul: /[\uac00-\ud7af\u1100-\u11ff]/, devanagari: /[\u0900-\u097f]/, thai: /[\u0e00-\u0e7f]/
    };
    var LATIN_RE = /[A-Za-z]/;
    function scriptNames(list) {
      var out = [];
      (Array.isArray(list) ? list : []).forEach(function (n) {
        if (n === 'non-latin') Object.keys(SCRIPTS).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
        else if (Object.prototype.hasOwnProperty.call(SCRIPTS, n) && out.indexOf(n) < 0) out.push(n);
      }); return out;
    }
    function inputText(input) {
      if (typeof input === 'string') return input; if (!input || typeof input !== 'object') return '';
      var parts = []; if (typeof input.text === 'string') parts.push(input.text);
      if (Array.isArray(input.inputs)) input.inputs.forEach(function (x) { if (typeof x === 'string') parts.push(x); });
      return parts.join('\n');
    }
    var names = scriptNames(scripts);
    if (names.length === 0) { S.scriptGuard = null; return false; }
    S.scriptGuard = function (item, input) {
      var exp = expectedTexts(item);
      var inScript = exp.some(function (a) { return names.some(function (n) { return SCRIPTS[n].test(a); }); });
      if (inScript && LATIN_RE.test(inputText(input))) return { message: String(message || '') };
      return null;
    };
    return true;
  }

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
