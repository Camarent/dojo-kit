/*
 * ext/input-script.js — DojoExt input-script guard: rejects Latin letters typed into a course's own script.
 * Global DojoExtInputScript (UMD).
 */
(function (root) {
  'use strict';
  var registry = root.DojoExtRegistry || (typeof require !== 'undefined' ? require('./registry.js') : null);

  var S = registry.state;

  function expectedTexts(item) {
    var out = [];
    if (!item) return out;
    if (item.type === 'gap' && Array.isArray(item.answers)) out = item.answers.slice();
    else if (item.type === 'cloze' && Array.isArray(item.parts)) {
      item.parts.forEach(function (p) { if (Array.isArray(p)) out = out.concat(p); });
    }
    return out.filter(function (x) { return typeof x === 'string'; });
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
    greek: /[Ͱ-Ͽἀ-῿]/,
    arabic: /[؀-ۿݐ-ݿ]/,
    hebrew: /[֐-׿]/,
    hangul: /[가-힯ᄀ-ᇿ]/,
    devanagari: /[ऀ-ॿ]/,
    thai: /[฀-๿]/
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

  var api = {
    expectedTexts: expectedTexts,
    inputText: inputText,
    scriptNames: scriptNames,
    useInputScript: useInputScript
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoExtInputScript = api;
})(typeof self !== 'undefined' ? self : this);
