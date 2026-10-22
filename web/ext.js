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
 *   useRuby(cfg, items)  course.ruby = { skip?, skipTag?, skipKey?, dictKeys? }: Han characters of skip plus those of the string at item path skipKey (default "meta.kanji") of items tagged skipTag form the skip set; built-in ruby {base|reading} whose Han characters are all in the set renders as bare base; dictKeys (default ["meta.examples", "meta.irregular"]) = dotted paths into item for {w, r} pairs to add to the reading dictionary
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
  var DojoExtRegistry = root.DojoExtRegistry || (typeof require !== 'undefined' ? require('./ext/registry.js') : null);
  var api = factory(DojoExtRegistry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExt = api;
})(typeof self !== 'undefined' ? self : this, function (registry) {
  'use strict';

  // Import state and functions from registry
  var S = registry.state;
  var builtinMarkups = registry.builtinMarkups;
  var warn = registry.warn;
  var hanOf = registry.hanOf;
  var pathValue = registry.pathValue;
  var RUBY_RE = registry.RUBY_RE;
  var HAN_G = registry.HAN_G;

  // Re-export registration functions
  function registerMarkup(name, def) { return registry.registerMarkup(name, def); }
  function registerBeforeSubmit(fn) { return registry.registerBeforeSubmit(fn); }
  function registerDetail(fn) { return registry.registerDetail(fn); }
  function registerIntro(fn) { return registry.registerIntro(fn); }
  function registerVoiceRank(fn) { return registry.registerVoiceRank(fn); }
  function registerSetting(config) { return registry.registerSetting(config); }
  function bindSettings(fn) { return registry.bindSettings(fn); }
  function getSetting(key) { return registry.getSetting(key); }
  function getRegisteredSettings() { return registry.getRegisteredSettings(); }
  function useRuby(cfg, items) { return registry.useRuby(cfg, items); }

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
    var readingsPaths = useConfig && Array.isArray(cfgOrLang.readings) ? cfgOrLang.readings : [];
    items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var kanjiChar = pathValue(it, keyPath);
      if (typeof kanjiChar !== 'string' || kanjiChar.length !== 1) return;  // only single Han chars
      if (Object.prototype.hasOwnProperty.call(map, kanjiChar)) return;  // first wins
      var meaning;
      if (useConfig && meaningPath) {
        meaning = pathValue(it, meaningPath);
      } else if (typeof cfgOrLang === 'string') {
        meaning = it.meta ? it.meta[cfgOrLang] : undefined;
      } else {
        meaning = undefined;
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
    if (names.length === 0) { S.scriptGuard = null; return false; }
    S.scriptGuard = function (item, input) {
      var exp = expectedTexts(item);
      var inScript = exp.some(function (a) { return names.some(function (n) { return SCRIPTS[n].test(a); }); });
      if (inScript && LATIN_RE.test(inputText(input))) return { message: String(message || '') };
      return null;
    };
    return true;
  }

  function use(name) {
    S.active = null;
    if (name === undefined || name === null || name === '') return false;
    if (!Object.prototype.hasOwnProperty.call(S.markups, name) && Object.prototype.hasOwnProperty.call(builtinMarkups, name)) {
      S.active = builtinMarkups[name];
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(S.markups, name)) {
      warn('markup "' + name + '" is not registered; using plain text');
      return false;
    }
    S.active = S.markups[name];
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
    if (!S.active || typeof str !== 'string') return str;
    try {
      return keyed(S.active.render(str, typeof preact !== 'undefined' ? preact.h : undefined, opts));
    } catch (e) {
      warn('markup render failed', e);
      return str;
    }
  }

  function plain(str) {
    if (!S.active || typeof str !== 'string') return str;
    try {
      var out = S.active.plain(str);
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
    if (S.scriptGuard) {
      try {
        var sg = S.scriptGuard(clone(item), clone(input));
        if (sg) return { message: sg.message };
      } catch (e) {
        warn('inputScript failed', e);
      }
    }
    if (!S.guard) return null;
    try {
      var r = S.guard(clone(item), clone(input));
      if (r && typeof r === 'object' && typeof r.message === 'string') return { message: r.message };
      return null;
    } catch (e) {
      warn('beforeSubmit failed', e);
      return null;
    }
  }

  function detail(item, ctx) {
    if (!S.detailFn) return null;
    try {
      var c = Object.assign({}, ctx);
      if (ctx && ctx.items !== undefined) c.items = clone(ctx.items);
      if (ctx && ctx.records !== undefined) c.records = clone(ctx.records);
      var r = S.detailFn(clone(item), c);
      return r === undefined ? null : r;
    } catch (e) {
      warn('detail failed', e);
      return null;
    }
  }

  function intro(card, item, ctx) {
    if (!S.introFn) return null;
    try {
      var c = Object.assign({}, ctx);
      if (ctx && ctx.items !== undefined) c.items = clone(ctx.items);
      if (ctx && ctx.records !== undefined) c.records = clone(ctx.records);
      var r = S.introFn(clone(card), clone(item), c);
      return r === undefined ? null : r;
    } catch (e) {
      warn('intro failed', e);
      return null;
    }
  }

  function voiceRank(voice, role) {
    if (!S.rankFn) return 0;
    try {
      var r = S.rankFn(voice, role);
      return typeof r === 'number' && isFinite(r) ? r : 0;
    } catch (e) {
      warn('voiceRank failed', e);
      return 0;
    }
  }

  function reset() {
    S.introFn = null;
    S.rankFn = null;
    S.markups = {};
    S.active = null;
    S.rubySkip = null;
    S.rubyDict = null;
    S.rubyDictMax = 0;
    S.guard = null;
    S.scriptGuard = null;
    S.detailFn = null;
    S.pluginSettings = {};
    S.settingsAccessor = null;
    S.settingsBound = false;
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
