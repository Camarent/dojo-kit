/*
 * ext/registry.js — plugin registry: hooks, plugin settings, and the register* functions.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExtRegistry = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var S = {
    markups: {}, active: null, scriptGuard: null, guard: null, detailFn: null, introFn: null, preTextFn: null, rankFn: null,
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

  function registerSetting(config) {
    if (!config || typeof config !== 'object') throw new Error('DojoExt.registerSetting: config object required');
    var key = config.key;
    if (typeof key !== 'string' || key === '') throw new Error('DojoExt.registerSetting: key required');
    if (!/^[a-z][a-z0-9_.-]*$/.test(key)) {
      throw new Error('DojoExt.registerSetting: key must match /^[a-z][a-z0-9_.-]*$/, got "' + key + '"');
    }
    var label = config.label;
    if (label === undefined) throw new Error('DojoExt.registerSetting: label required');
    if (typeof label !== 'string' && (typeof label !== 'object' || label === null || typeof label.en !== 'string')) {
      throw new Error('DojoExt.registerSetting: label must be a string or an object with a string en');
    }
    var options = config.options;
    if (!Array.isArray(options)) throw new Error('DojoExt.registerSetting: options array required');
    if (options.length === 0) throw new Error('DojoExt.registerSetting: options array must not be empty');
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      if (!opt || typeof opt !== 'object' || typeof opt.value === 'undefined') {
        throw new Error('DojoExt.registerSetting: each option must have a "value" property');
      }
    }
    var def = config.default;
    if (def === undefined) throw new Error('DojoExt.registerSetting: default value required');

    S.pluginSettings[key] = {
      label: label,
      options: options,
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

  var RUBY_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;

  // [{ text } | { base, reading }]; text without markup is one text segment.
  function rubyParse(str) {
    var out = [], last = 0, m;
    RUBY_RE.lastIndex = 0;
    while ((m = RUBY_RE.exec(str))) {
      if (m.index > last) out.push({ text: str.slice(last, m.index) });
      out.push({ base: m[1], reading: m[2] });
      last = RUBY_RE.lastIndex;
    }
    if (last < str.length) out.push({ text: str.slice(last) });
    return out;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var HAN_G = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2CEAF}]/gu;

  function hanOf(str) { return typeof str === 'string' ? (str.match(HAN_G) || []) : []; }

  function pathValue(item, path) {
    var v = item;
    var parts = String(path).split('.');
    for (var i = 0; i < parts.length; i++) {
      if (v === null || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, parts[i])) return undefined;
      v = v[parts[i]];
    }
    return v;
  }


  function dictAdd(dict, w, r) {
    if (typeof w !== 'string' || typeof r !== 'string' || !w || !r) return;
    if (hanOf(w).length < 2) return;
    if (!Object.prototype.hasOwnProperty.call(dict, w)) dict[w] = r;
    else if (dict[w] !== r) dict[w] = null;
  }

  // Word -> reading map from items: entries {w, r} at dotted paths from dictKeys (default meta.examples, meta.irregular) and {base|reading} in prompt/explanation. Only words of 2+ kanji with a single reading; ambiguous words are dropped.
  function buildRubyDict(items, dictKeys) {
    var dict = {};
    if (!Array.isArray(items)) return dict;
    var keys = dictKeys && Array.isArray(dictKeys) ? dictKeys : ['meta.examples', 'meta.irregular'];
    items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      keys.forEach(function (key) {
        var arr = pathValue(it, key);
        if (Array.isArray(arr)) arr.forEach(function (e) { if (e && typeof e === 'object') dictAdd(dict, e.w, e.r); });
      });
      [it.prompt, it.explanation].forEach(function (str) {
        if (typeof str !== 'string') return;
        rubyParse(str).forEach(function (g) { if (g.base != null) dictAdd(dict, g.base, g.reading); });
      });
    });
    Object.keys(dict).forEach(function (w) { if (dict[w] === null) delete dict[w]; });
    return dict;
  }

  function isHan(ch) { return !!ch && hanOf(ch).length === 1; }

  // Splits plain text into text/ruby segments, longest known word first; unknown kanji stay bare.
  function annotateText(str) {
    if (!S.rubyDict || typeof str !== 'string') return [{ text: str }];
    var out = [];
    var buf = '';
    var i = 0;
    var lastEnd = -1;
    function startsWord(j) {
      for (var l = Math.min(S.rubyDictMax, str.length - j); l > 0; l--) {
        if (Object.prototype.hasOwnProperty.call(S.rubyDict, str.substr(j, l))) return true;
      }
      return false;
    }
    while (i < str.length) {
      var hit = null;
      if (!(i > 0 && i !== lastEnd && isHan(str.charAt(i - 1)))) {
        for (var len = Math.min(S.rubyDictMax, str.length - i); len > 0; len--) {
          var w = str.substr(i, len);
          if (!Object.prototype.hasOwnProperty.call(S.rubyDict, w)) continue;
          var nx = i + len;
          if (nx < str.length && isHan(str.charAt(nx)) && !startsWord(nx)) continue;
          hit = w;
          break;
        }
      }
      if (hit) {
        if (buf) { out.push({ text: buf }); buf = ''; }
        out.push({ base: hit, reading: S.rubyDict[hit] });
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
    S.rubyDict = buildRubyDict(items, cfg.dictKeys);
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

  return {
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
    buildRubyDict: buildRubyDict,
    isHan: isHan,
    annotateText: annotateText,
    rubyHidden: rubyHidden,
    rubyRender: rubyRender,
    rubyPlain: rubyPlain
  };
});
