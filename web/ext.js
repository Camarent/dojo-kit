/*
 * ext.js — DojoExt: registry for build-time course plugins. Global DojoExt (UMD, like types/registry.js).
 * Hooks never grade, schedule or write progress.
 *   registerMarkup(name, { render(text, h) -> vnode, plain(text) -> string })
 *   registerBeforeSubmit(fn(item, input) -> null | { message })
 *   registerDetail(fn(item, ctx: { items, records, t, h }) -> vnode | null)
 *   registerIntro(fn(intro, item, ctx: { items, records, t, h }) -> vnode | null)  // intro card body; null = default title + text
 *   registerVoiceRank(fn(voice, role) -> number)  // higher ranks first among speech voices for a role
 *   registerSetting({ key, label, options: [{value, label}], default })
 *   bindSettings(fn)  // called by app to bind getSetting to the store
 *   use(name)    selects the markup named by course.markup (registered first, then built-in "ruby" = {base|reading}); unknown name warns and keeps plain text
 *   useInputScript(scripts, message)  course.inputScript guard: scripts = array of script names ("non-latin", "han", "hiragana", "katakana", "cyrillic", "greek", "arabic", "hebrew", "hangul", "devanagari", "thai"); message = string shown on block. Block-only; runs before the plugin guard.
 *   useRuby(cfg, items)  course.ruby = { skip?, skipTag?, skipKey? }: Han characters of skip plus those of the string at item path skipKey (default "meta.kanji") of items tagged skipTag form the skip set; built-in ruby {base|reading} whose Han characters are all in the set renders as bare base
 *   text(str[, {all, annotate, hide}])  vnode from the active markup, or str unchanged when none is active; all/annotate also annotate plain known words from the item reading dictionary (annotate hides skip-set kanji); hide: array of strings, segments whose reading is in hide render as bare base
 *   plain(str)   text for search/TTS; str unchanged when none is active
 *   getSetting(key) returns the stored value or registered default
 *   beforeSubmit(item, input) -> null | { message } (block); never changes the graded input
 *   detail(item, ctx) -> vnode | null; hook gets deep clones of item, ctx.items, ctx.records; errors yield null
 *   intro(intro, item, ctx) -> vnode | null; hook gets deep clones of intro, item, ctx.items, ctx.records; errors yield null
 *   voiceRank(voice, role) -> number; 0 when no hook is registered or it throws or returns a non-finite value
 *   reset()      clears every hook
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExt = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var markups = {};
  var active = null;
  var scriptGuard = null;
  var guard = null;
  var detailFn = null;
  var introFn = null;
  var rankFn = null;
  var pluginSettings = {};
  var settingsAccessor = null;
  var settingsBound = false;

  function warn(msg, e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('DojoExt: ' + msg, e || '');
  }

  function registerMarkup(name, def) {
    if (typeof name !== 'string' || name === '') throw new Error('DojoExt.registerMarkup: name required');
    if (!def || typeof def.render !== 'function' || typeof def.plain !== 'function') {
      throw new Error('DojoExt.registerMarkup: render and plain functions required');
    }
    markups[name] = def;
  }

  function registerBeforeSubmit(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerBeforeSubmit: function required');
    guard = fn;
  }

  function registerDetail(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerDetail: function required');
    detailFn = fn;
  }

  function registerIntro(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerIntro: function required');
    introFn = fn;
  }

  function registerVoiceRank(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.registerVoiceRank: function required');
    rankFn = fn;
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

    pluginSettings[key] = {
      label: label,
      options: options,
      default: def
    };
  }

  function bindSettings(fn) {
    if (typeof fn !== 'function') throw new Error('DojoExt.bindSettings: function required');
    settingsAccessor = fn;
    settingsBound = true;
  }

  function getSetting(key) {
    if (!Object.prototype.hasOwnProperty.call(pluginSettings, key)) return undefined;
    var setting = pluginSettings[key];

    // If bound and accessor returns a valid value, use it
    if (settingsBound && settingsAccessor) {
      try {
        // Use the plugin-prefixed key
        var stored = settingsAccessor('plugin:' + key);
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
    return Object.keys(pluginSettings).map(function (key) {
      return Object.assign({ key: key }, pluginSettings[key]);
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

  var rubySkip = null;
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

  var rubyDict = null;
  var rubyDictMax = 0;

  function dictAdd(dict, w, r) {
    if (typeof w !== 'string' || typeof r !== 'string' || !w || !r) return;
    if (hanOf(w).length < 2) return;
    if (!Object.prototype.hasOwnProperty.call(dict, w)) dict[w] = r;
    else if (dict[w] !== r) dict[w] = null;
  }

  // Word -> reading map from items: meta.examples / meta.irregular entries {w, r} and {base|reading} in prompt/explanation. Only words of 2+ kanji with a single reading; ambiguous words are dropped.
  function buildRubyDict(items) {
    var dict = {};
    if (!Array.isArray(items)) return dict;
    items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      ['examples', 'irregular'].forEach(function (k) {
        var arr = it.meta && it.meta[k];
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
    if (!rubyDict || typeof str !== 'string') return [{ text: str }];
    var out = [];
    var buf = '';
    var i = 0;
    var lastEnd = -1;
    function startsWord(j) {
      for (var l = Math.min(rubyDictMax, str.length - j); l > 0; l--) {
        if (Object.prototype.hasOwnProperty.call(rubyDict, str.substr(j, l))) return true;
      }
      return false;
    }
    while (i < str.length) {
      var hit = null;
      if (!(i > 0 && i !== lastEnd && isHan(str.charAt(i - 1)))) {
        for (var len = Math.min(rubyDictMax, str.length - i); len > 0; len--) {
          var w = str.substr(i, len);
          if (!Object.prototype.hasOwnProperty.call(rubyDict, w)) continue;
          var nx = i + len;
          if (nx < str.length && isHan(str.charAt(nx)) && !startsWord(nx)) continue;
          hit = w;
          break;
        }
      }
      if (hit) {
        if (buf) { out.push({ text: buf }); buf = ''; }
        out.push({ base: hit, reading: rubyDict[hit] });
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
    rubySkip = null;
    rubyDict = null;
    rubyDictMax = 0;
    if (!cfg || typeof cfg !== 'object') return false;
    rubyDict = buildRubyDict(items);
    Object.keys(rubyDict).forEach(function (w) { if (w.length > rubyDictMax) rubyDictMax = w.length; });
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
    rubySkip = n ? set : null;
    return !!rubySkip;
  }

  // True when the base has Han characters and every one is in the skip set.
  function rubyHidden(base) {
    if (!rubySkip) return false;
    var han = hanOf(base);
    return han.length > 0 && han.every(function (c) { return rubySkip[c] === true; });
  }

  // {base|reading} -> <ruby>base<rt>reading</rt></ruby> (bare base for skipped kanji or when reading is in hide); all other text is escaped (vnode children or HTML string without h).
  function rubyRender(str, h, opts) {
    if (typeof str !== 'string') return str;
    var all = opts && opts.all;
    var annotate = opts && opts.annotate;
    var hide = opts && opts.hide;
    var segs = rubyParse(str);
    if ((all || annotate) && rubyDict) {
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

  // Unicode script ranges per name; "non-latin" is every listed script.
  var SCRIPTS = {
    han: /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2CEAF}]/u,
    hiragana: /[\u3040-\u309f]/,
    katakana: /[\u30a0-\u30ff\uff65-\uff9f]/,
    cyrillic: /[\u0400-\u04ff]/,
    greek: /[\u0370-\u03ff\u1f00-\u1fff]/,
    arabic: /[\u0600-\u06ff\u0750-\u077f]/,
    hebrew: /[\u0590-\u05ff]/,
    hangul: /[\uac00-\ud7af\u1100-\u11ff]/,
    devanagari: /[\u0900-\u097f]/,
    thai: /[\u0e00-\u0e7f]/
  };
  var LATIN_RE = /[A-Za-z]/;

  function scriptNames(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (n) {
      if (n === 'non-latin') Object.keys(SCRIPTS).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
      else if (Object.prototype.hasOwnProperty.call(SCRIPTS, n) && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }

  function expectedTexts(item) {
    var out = [];
    if (!item) return out;
    if (item.type === 'gap' && Array.isArray(item.answers)) out = item.answers.slice();
    else if (item.type === 'cloze' && Array.isArray(item.parts)) {
      item.parts.forEach(function (p) { if (Array.isArray(p)) out = out.concat(p); });
    }
    return out.filter(function (x) { return typeof x === 'string'; });
  }

  // Option text(s) marked correct on a choice item.
  function answerTexts(item) {
    var out = [];
    if (!item || item.type !== 'choice' || !Array.isArray(item.options)) return out;
    (Array.isArray(item.answer) ? item.answer : [item.answer]).forEach(function (a) {
      if (typeof item.options[a] === 'string') out.push(item.options[a]);
    });
    return out;
  }

  // Build a lookup map from kanji char -> {meaning, on, kun} from items with meta.kanji.
  // First item per char wins; items without a string meaning are skipped.
  function kanjiIndex(items, cfgOrLang) {
    var map = {};
    if (!Array.isArray(items)) return map;
    var useConfig = typeof cfgOrLang === 'object' && cfgOrLang !== null;
    var keyPath = useConfig && cfgOrLang.key ? cfgOrLang.key : 'meta.kanji';
    var meaningPath = useConfig && cfgOrLang.meaning ? cfgOrLang.meaning : null;
    var readingsPaths = useConfig && Array.isArray(cfgOrLang.readings) ? cfgOrLang.readings : ['meta.on', 'meta.kun'];
    items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var kanjiChar = pathValue(it, keyPath);
      if (typeof kanjiChar !== 'string' || kanjiChar.length !== 1) return;  // only single Han chars
      if (Object.prototype.hasOwnProperty.call(map, kanjiChar)) return;  // first wins
      var meaning = pathValue(it, meaningPath);
      if (meaning === undefined || meaning === null) meaning = pathValue(it, 'meta.meaning');
      if (meaning === undefined || meaning === null) {
        if (useConfig && meaningPath) {
          // Config mode: meaning path is required, skip if not found
          return;
        }
        // Fallback: try meta[lang] where lang is cfgOrLang as string
        var lang = typeof cfgOrLang === 'string' ? cfgOrLang : 'meaning';
        meaning = it.meta && it.meta[lang];
      }
      if (typeof meaning !== 'string' || meaning.length === 0) return;  // skip items without a string meaning
      var on = undefined;
      var kun = undefined;
      if (readingsPaths.length >= 1) {
        on = pathValue(it, readingsPaths[0]);
        if (on === undefined || on === null || !Array.isArray(on)) on = undefined;
      }
      if (readingsPaths.length >= 2) {
        kun = pathValue(it, readingsPaths[1]);
        if (kun === undefined || kun === null || !Array.isArray(kun)) kun = undefined;
      }
      map[kanjiChar] = {
        kanji: kanjiChar,
        meaning: meaning,
        on: on,
        kun: kun
      };
    });
    return map;
  }

  // Returns kanji rows for distinct Han chars in item's prompt + expectedTexts,
  // ordered by first appearance, capped at 12 rows.
  // Returns [] when the prompt has fewer than 2 Han characters, or when the only distinct kanji equals the item's own meta.kanji
  // (kanji items themselves) or when nothing is found.
  function kanjiBreakdown(item, items, cfgOrLang) {
    if (!item) return [];
    // Count Han characters in the prompt only
    var promptText = typeof item.prompt === 'string' ? plain(item.prompt) : '';
    var promptHan = hanOf(promptText);
    // Return empty if prompt has fewer than 2 distinct kanji
    if (promptHan.length < 2) return [];
    // Collect text from prompt + expectedTexts + answerTexts for finding kanji
    var text = promptText;
    expectedTexts(item).forEach(function (t) { text += plain(t); });
    answerTexts(item).forEach(function (t) { text += plain(t); });
    var han = hanOf(text);
    var index = kanjiIndex(items, cfgOrLang);
    var seen = {};
    var result = [];
    var keyPath = typeof cfgOrLang === 'object' && cfgOrLang !== null && cfgOrLang.key ? cfgOrLang.key : 'meta.kanji';
    var ownKanji = pathValue(item, keyPath);
    if (typeof ownKanji !== 'string' || ownKanji.length !== 1) ownKanji = null;
    han.forEach(function (c) {
      if (seen[c]) return;
      seen[c] = true;
      if (!Object.prototype.hasOwnProperty.call(index, c)) return;  // skip chars without a kanji item
      result.push(index[c]);
    });
    if (result.length === 0) return [];
    // If the only distinct kanji is the item's own meta.kanji, return []
    if (result.length === 1 && ownKanji && result[0].kanji === ownKanji) return [];
    return result.slice(0, 12);
  }

  function inputText(input) {
    if (typeof input === 'string') return input;
    if (!input || typeof input !== 'object') return '';
    var parts = [];
    if (typeof input.text === 'string') parts.push(input.text);
    if (Array.isArray(input.inputs)) input.inputs.forEach(function (x) { if (typeof x === 'string') parts.push(x); });
    return parts.join('\n');
  }

  function useInputScript(scripts, message) {
    var names = scriptNames(scripts);
    if (names.length === 0) { scriptGuard = null; return false; }
    scriptGuard = function (item, input) {
      var exp = expectedTexts(item);
      var inScript = exp.some(function (a) { return names.some(function (n) { return SCRIPTS[n].test(a); }); });
      if (inScript && LATIN_RE.test(inputText(input))) return { message: String(message || '') };
      return null;
    };
    return true;
  }

  function use(name) {
    active = null;
    if (name === undefined || name === null || name === '') return false;
    if (!Object.prototype.hasOwnProperty.call(markups, name) && Object.prototype.hasOwnProperty.call(builtinMarkups, name)) {
      active = builtinMarkups[name];
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(markups, name)) {
      warn('markup "' + name + '" is not registered; using plain text');
      return false;
    }
    active = markups[name];
    return true;
  }

  // Unkeyed arrays of mixed element types corrupt Preact 10.19.3's DOM diff (lost nodes, insertBefore NotFoundError); index keys avoid it.
  function keyed(out) {
    if (!Array.isArray(out) || typeof preact === 'undefined' || !preact.cloneElement) return out;
    return out.map(function (c, i) {
      return c && typeof c === 'object' && c.props && (c.key === undefined || c.key === null) ? preact.cloneElement(c, { key: 'm' + i }) : c;
    });
  }

  function text(str, opts) {
    if (!active || typeof str !== 'string') return str;
    try {
      return keyed(active.render(str, typeof preact !== 'undefined' ? preact.h : undefined, opts));
    } catch (e) {
      warn('markup render failed', e);
      return str;
    }
  }

  function plain(str) {
    if (!active || typeof str !== 'string') return str;
    try {
      var out = active.plain(str);
      return typeof out === 'string' ? out : str;
    } catch (e) {
      warn('markup plain failed', e);
      return str;
    }
  }

  function textAll(str) {
    return text(str, { all: true });
  }

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  function beforeSubmit(item, input) {
    if (scriptGuard) {
      try {
        var sg = scriptGuard(clone(item), clone(input));
        if (sg) return { message: sg.message };
      } catch (e) {
        warn('inputScript failed', e);
      }
    }
    if (!guard) return null;
    try {
      var r = guard(clone(item), clone(input));
      if (r && typeof r === 'object' && typeof r.message === 'string') return { message: r.message };
      return null;
    } catch (e) {
      warn('beforeSubmit failed', e);
      return null;
    }
  }

  function detail(item, ctx) {
    if (!detailFn) return null;
    try {
      var c = Object.assign({}, ctx);
      if (ctx && ctx.items !== undefined) c.items = clone(ctx.items);
      if (ctx && ctx.records !== undefined) c.records = clone(ctx.records);
      var r = detailFn(clone(item), c);
      return r === undefined ? null : r;
    } catch (e) {
      warn('detail failed', e);
      return null;
    }
  }

  function intro(card, item, ctx) {
    if (!introFn) return null;
    try {
      var c = Object.assign({}, ctx);
      if (ctx && ctx.items !== undefined) c.items = clone(ctx.items);
      if (ctx && ctx.records !== undefined) c.records = clone(ctx.records);
      var r = introFn(clone(card), clone(item), c);
      return r === undefined ? null : r;
    } catch (e) {
      warn('intro failed', e);
      return null;
    }
  }

  function voiceRank(voice, role) {
    if (!rankFn) return 0;
    try {
      var r = rankFn(voice, role);
      return typeof r === 'number' && isFinite(r) ? r : 0;
    } catch (e) {
      warn('voiceRank failed', e);
      return 0;
    }
  }

  function reset() {
    introFn = null;
    rankFn = null;
    markups = {};
    active = null;
    rubySkip = null;
    rubyDict = null;
    rubyDictMax = 0;
    guard = null;
    scriptGuard = null;
    detailFn = null;
    pluginSettings = {};
    settingsAccessor = null;
    settingsBound = false;
  }

  return {
    registerMarkup: registerMarkup,
    registerBeforeSubmit: registerBeforeSubmit,
    registerDetail: registerDetail,
    registerIntro: registerIntro,
    registerVoiceRank: registerVoiceRank,
    registerSetting: registerSetting,
    bindSettings: bindSettings,
    getSetting: getSetting,
    getRegisteredSettings: getRegisteredSettings,
    use: use,
    useInputScript: useInputScript,
    useRuby: useRuby,
    text: text,
    textAll: textAll,
    plain: plain,
    beforeSubmit: beforeSubmit,
    detail: detail,
    intro: intro,
    voiceRank: voiceRank,
    reset: reset,
    kanjiBreakdown: kanjiBreakdown
  };
});
