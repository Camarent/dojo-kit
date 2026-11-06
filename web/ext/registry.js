/*
 * ext/registry.js — plugin registry: hooks, plugin settings, and the register* functions.
 */
(function (root) {
  'use strict';

  var S = {
    markups: {}, active: null, scriptGuard: null, guard: null, detailFn: null, introFn: null, preTextFn: null, rankFn: null, feedbackRowsFn: null, storageProvider: null,
    rubySkip: null, rubyDict: null, rubyDictMax: 0,
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

  // fn(item, ctx) returns an array of kanji rows ({ kanji, meaning, on, kun }) that replaces the built-in breakdown, or null.
  function registerFeedbackRows(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerFeedbackRows: function required');
    S.feedbackRowsFn = fn;
  }

  // Guarded like the other hooks: a throwing plugin yields null, so the built-in breakdown is used.
  function feedbackRows(item, ctx) {
    if (!S.feedbackRowsFn) return null;
    try { var r = S.feedbackRowsFn(item, ctx); return Array.isArray(r) ? r : null; }
    catch (e) { warn('feedbackRows failed', e); return null; }
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

  var RD = root.DojoRubyDict || (typeof require !== 'undefined' ? require('./ruby-dict.js') : null);
  var RUBY_RE = RD.RUBY_RE, rubyParse = RD.rubyParse, HAN_G = RD.HAN_G, hanOf = RD.hanOf, isHan = RD.isHan;
  var pathValue = RD.pathValue, dictAdd = RD.dictAdd, buildRubyDict = RD.buildRubyDict;

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function startsWordAt(str, j) {
    for (var l = Math.min(S.rubyDictMax, str.length - j); l > 0; l--) {
      if (Object.prototype.hasOwnProperty.call(S.rubyDict, str.substr(j, l))) return true;
    }
    return false;
  }

  // Longest known word starting at i, or null. A word followed by a kanji that starts no known word is skipped.
  function longestWordAt(str, i) {
    for (var len = Math.min(S.rubyDictMax, str.length - i); len > 0; len--) {
      var w = str.substr(i, len);
      if (!Object.prototype.hasOwnProperty.call(S.rubyDict, w)) continue;
      var nx = i + len;
      if (nx < str.length && isHan(str.charAt(nx)) && !startsWordAt(str, nx)) continue;
      return w;
    }
    return null;
  }

  // Aligns a word with okurigana to its reading so only kanji runs carry ruby: 飲み物/のみもの -> {飲|の}み{物|もの}. Whole word on failed alignment.
  function splitRuby(base, reading) {
    var runs = base.match(/[一-鿿㐀-䶿\u{20000}-\u{2CEAF}]+|[^一-鿿㐀-䶿\u{20000}-\u{2CEAF}]+/gu) || [];
    if (runs.length < 2) return [{ base: base, reading: reading }];
    var out = [];
    var pos = 0;
    for (var k = 0; k < runs.length; k++) {
      var run = runs[k];
      if (!isHan(run.charAt(0))) {
        if (reading.substr(pos, run.length) !== run) return [{ base: base, reading: reading }];
        out.push({ text: run });
        pos += run.length;
        continue;
      }
      var nextKana = k + 1 < runs.length ? runs[k + 1] : null;
      var end = nextKana === null ? reading.length : reading.indexOf(nextKana, pos + 1);
      if (end < 0 || end <= pos) return [{ base: base, reading: reading }];
      out.push({ base: run, reading: reading.slice(pos, end) });
      pos = end;
    }
    return pos === reading.length ? out : [{ base: base, reading: reading }];
  }

  // Splits plain text into text/ruby segments, longest known word first; unknown kanji stay bare.
  function annotateText(str) {
    if (!S.rubyDict || typeof str !== 'string') return [{ text: str }];
    var out = [];
    var buf = '';
    var i = 0;
    var lastEnd = -1;
    while (i < str.length) {
      var hit = i > 0 && i !== lastEnd && isHan(str.charAt(i - 1)) ? null : longestWordAt(str, i);
      if (hit) {
        if (buf) { out.push({ text: buf }); buf = ''; }
        splitRuby(hit, S.rubyDict[hit]).forEach(function (x) { out.push(x); });
        i += hit.length;
        lastEnd = i;
      } else {
        buf += str.charAt(i);
        i++;
      }
    }
    if (buf) out.push({ text: buf });
    return out;
  }

  function useRuby(cfg, items) {
    S.rubySkip = null;
    S.rubyDict = null;
    S.rubyDictMax = 0;
    if (!cfg || typeof cfg !== 'object') return false;
    S.rubyDict = buildRubyDict(items, cfg.dictKeys, cfg.dict);
    Object.keys(S.rubyDict).forEach(function (w) { if (w.length > S.rubyDictMax) S.rubyDictMax = w.length; });
    var set = {};
    var n = 0;
    hanOf(cfg.skip).forEach(function (c) { set[c] = true; n++; });
    if (typeof cfg.skipTag === 'string' && Array.isArray(items)) {
      var key = typeof cfg.skipKey === 'string' && cfg.skipKey ? cfg.skipKey : 'meta.kanji';
      items.forEach(function (it) {
        if (!it || !Array.isArray(it.tags) || it.tags.indexOf(cfg.skipTag) < 0) return;
        hanOf(pathValue(it, key)).forEach(function (c) { set[c] = true; n++; });
      });
    }
    S.rubySkip = n ? set : null;
    return !!S.rubySkip;
  }

  function rubyHidden(base) {
    if (!S.rubySkip) return false;
    var han = hanOf(base);
    return han.length > 0 && han.every(function (c) { return S.rubySkip[c] === true; });
  }

  function rubyRender(str, h, opts) {
    if (typeof str !== 'string') return str;
    var all = opts && opts.all;
    var annotate = opts && opts.annotate;
    var hide = opts && opts.hide;
    var segs = rubyParse(str);
    if ((all || annotate) && S.rubyDict) {
      var expanded = [];
      segs.forEach(function (g) {
        if (g.text != null) annotateText(g.text).forEach(function (x) { expanded.push(x); });
        else expanded.push(g);
      });
      segs = expanded;
    }
    function shouldHide(g) {
      if (!g.reading || typeof g.reading !== 'string') return false;
      if (hide && Array.isArray(hide) && hide.indexOf(g.reading) >= 0) return true;
      return false;
    }
    if (h) {
      return segs.map(function (g) {
        if (g.text != null) return h('span', null, g.text);
        if (all || (!rubyHidden(g.base) && !shouldHide(g))) return h('ruby', null, h('span', null, g.base), h('rt', null, g.reading));
        return h('span', null, g.base);
      });
    }
    return segs.map(function (g) {
      if (g.text != null) return escHtml(g.text);
      if (all || (!rubyHidden(g.base) && !shouldHide(g))) return '<ruby>' + escHtml(g.base) + '<rt>' + escHtml(g.reading) + '</rt></ruby>';
      return escHtml(g.base);
    }).join('');
  }

  function rubyPlain(str) {
    return typeof str === 'string' ? str.replace(RUBY_RE, '$1') : str;
  }

  var builtinMarkups = { ruby: { render: rubyRender, plain: rubyPlain, parse: rubyParse } };

  var api = {
    state: S,
    builtinMarkups: builtinMarkups,
    RUBY_RE: RUBY_RE,
    HAN_G: HAN_G,
    registerMarkup: registerMarkup,
    registerBeforeSubmit: registerBeforeSubmit,
    registerDetail: registerDetail,
    registerIntro: registerIntro,
    registerPreAnswerText: registerPreAnswerText,
    registerVoiceRank: registerVoiceRank,
    registerFeedbackRows: registerFeedbackRows,
    feedbackRows: feedbackRows,
    registerStorage: registerStorage,
    getStorageProvider: getStorageProvider,
    registerSetting: registerSetting,
    bindSettings: bindSettings,
    getSetting: getSetting,
    getRegisteredSettings: getRegisteredSettings,
    useRuby: useRuby,
    warn: warn,
    rubyParse: rubyParse,
    escHtml: escHtml,
    hanOf: hanOf,
    pathValue: pathValue,
    dictAdd: dictAdd,
    isHan: isHan,
    annotateText: annotateText,
    rubyHidden: rubyHidden,
    rubyRender: rubyRender,
    rubyPlain: rubyPlain
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExtRegistry = api;
})(typeof self !== 'undefined' ? self : this);
