/*
 * ext/readings.js — DojoExt readings and kanji breakdown support.
 * Global DojoExtReadings (UMD).
 */
(function (root, factory) {
  'use strict';
  var DojoExtRegistry = root.DojoExtRegistry || (typeof require !== 'undefined' ? require('./registry.js') : null);
  var DojoExtRuby = root.DojoExtRuby || (typeof require !== 'undefined' ? require('./ruby.js') : null);
  var api = factory(DojoExtRegistry, DojoExtRuby);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExtReadings = api;
})(typeof self !== 'undefined' ? self : this, function (registry, rubyApi) {
  'use strict';

  var S = registry.state;
  var hanOf = registry.hanOf;
  var pathValue = registry.pathValue;
  var warn = registry.warn;

  // Use rubyApi.plain if available, otherwise use S.active.plain directly
  function plain(str) {
    if (rubyApi && rubyApi.plain) return rubyApi.plain(str);
    if (!S.active || typeof str !== 'string') return str;
    try {
      var out = S.active.plain(str);
      return typeof out === 'string' ? out : str;
    } catch (e) {
      warn('markup plain failed', e);
      return str;
    }
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

  function answerTexts(item) {
    var out = [];
    if (!item || item.type !== 'choice' || !Array.isArray(item.options)) return out;
    (Array.isArray(item.answer) ? item.answer : [item.answer]).forEach(function (a) {
      if (typeof item.options[a] === 'string') out.push(item.options[a]);
    });
    return out;
  }

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
      if (typeof kanjiChar !== 'string' || kanjiChar.length !== 1) return;
      if (Object.prototype.hasOwnProperty.call(map, kanjiChar)) return;
      var meaning;
      if (useConfig && meaningPath) {
        meaning = pathValue(it, meaningPath);
      } else if (typeof cfgOrLang === 'string') {
        meaning = it.meta ? it.meta[cfgOrLang] : undefined;
      } else {
        meaning = undefined;
      }
      if (typeof meaning !== 'string' || meaning.length === 0) return;
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

  function kanjiBreakdown(item, items, cfgOrLang) {
    if (!item) return [];
    var promptText = typeof item.prompt === 'string' ? plain(item.prompt) : '';
    var promptHan = hanOf(promptText);
    if (promptHan.length < 2) return [];
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
      if (!Object.prototype.hasOwnProperty.call(index, c)) return;
      result.push(index[c]);
    });
    if (result.length === 0) return [];
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

  function scriptNames(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (n) {
      if (n === 'non-latin') Object.keys(SCRIPTS).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
      else if (Object.prototype.hasOwnProperty.call(SCRIPTS, n) && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }

  var LATIN_RE = /[A-Za-z]/;

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

  return {
    kanjiBreakdown: kanjiBreakdown,
    kanjiIndex: kanjiIndex,
    expectedTexts: expectedTexts,
    answerTexts: answerTexts,
    useInputScript: useInputScript,
    inputText: inputText,
    scriptNames: scriptNames
  };
});
