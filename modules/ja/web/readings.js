/*
 * modules/ja/web/readings.js — ja module: kanji breakdown (DojoExt.kanjiBreakdown) from course.breakdown.
 * Global DojoJaReadings (UMD).
 */
(function (root) {
  'use strict';
  var req = typeof require !== 'undefined';
  var ext = root.DojoExt || (req ? require('../../../web/ext.js') : null);
  var inputScript = root.DojoExtInputScript || (req ? require('../../../web/ext/input-script.js') : null);
  var RD = root.DojoRubyDict || (req ? require('./ruby-dict.js') : null);

  var expectedTexts = inputScript.expectedTexts;
  var hanOf = RD.hanOf;
  var pathValue = RD.pathValue;
  // Text without the active markup (ext.plain), so {base|reading} counts only its base.
  function plain(str) { return ext.plain(str); }

  function answerTexts(item) {
    var out = [];
    if (!item || item.type !== 'choice' || !Array.isArray(item.options)) return out;
    (Array.isArray(item.answer) ? item.answer : [item.answer]).forEach(function (a) {
      if (typeof item.options[a] === 'string') out.push(item.options[a]);
    });
    return out;
  }

  function keyPathOf(cfgOrLang) {
    return typeof cfgOrLang === 'object' && cfgOrLang !== null && cfgOrLang.key ? cfgOrLang.key : 'meta.kanji';
  }

  function meaningOf(it, cfgOrLang) {
    var useConfig = typeof cfgOrLang === 'object' && cfgOrLang !== null;
    if (useConfig && cfgOrLang.meaning) return pathValue(it, cfgOrLang.meaning);
    if (typeof cfgOrLang === 'string') return it.meta ? it.meta[cfgOrLang] : undefined;
    return undefined;
  }

  function readingAt(it, paths, i) {
    if (paths.length <= i) return undefined;
    var v = pathValue(it, paths[i]);
    return Array.isArray(v) ? v : undefined;
  }

  function kanjiEntry(it, cfgOrLang) {
    var kanjiChar = pathValue(it, keyPathOf(cfgOrLang));
    if (typeof kanjiChar !== 'string' || kanjiChar.length !== 1) return null;
    var meaning = meaningOf(it, cfgOrLang);
    if (typeof meaning !== 'string' || meaning.length === 0) return null;
    var readingsPaths = typeof cfgOrLang === 'object' && cfgOrLang !== null && Array.isArray(cfgOrLang.readings) ? cfgOrLang.readings : [];
    return {
      kanji: kanjiChar,
      meaning: meaning,
      on: readingAt(it, readingsPaths, 0),
      kun: readingAt(it, readingsPaths, 1)
    };
  }

  function kanjiIndex(items, cfgOrLang) {
    var map = {};
    if (!Array.isArray(items)) return map;
    items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var entry = kanjiEntry(it, cfgOrLang);
      if (!entry || Object.prototype.hasOwnProperty.call(map, entry.kanji)) return;
      map[entry.kanji] = entry;
    });
    return map;
  }

  function promptHanOf(item) {
    var promptText = typeof item.prompt === 'string' ? plain(item.prompt) : '';
    return { text: promptText, han: hanOf(promptText) };
  }

  function allHanOf(item, promptText) {
    var text = promptText;
    expectedTexts(item).forEach(function (t) { text += plain(t); });
    answerTexts(item).forEach(function (t) { text += plain(t); });
    return hanOf(text);
  }

  function ownKanjiOf(item, cfgOrLang) {
    var ownKanji = pathValue(item, keyPathOf(cfgOrLang));
    return typeof ownKanji !== 'string' || ownKanji.length !== 1 ? null : ownKanji;
  }

  function kanjiBreakdown(item, items, cfgOrLang) {
    if (!item) return [];
    var prompt = promptHanOf(item);
    if (prompt.han.length < 2) return [];
    var han = allHanOf(item, prompt.text);
    var index = kanjiIndex(items, cfgOrLang);
    var seen = {};
    var result = [];
    var ownKanji = ownKanjiOf(item, cfgOrLang);
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

  ext.provide('kanjiBreakdown', kanjiBreakdown);

  var api = { kanjiBreakdown: kanjiBreakdown, kanjiIndex: kanjiIndex, answerTexts: answerTexts };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoJaReadings = api;
})(typeof self !== 'undefined' ? self : this);
