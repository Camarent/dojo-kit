/*
 * ext/ruby-dict.js — ruby parse (`{base|reading}`) and the word-reading dictionary builders used by the built-in ruby renderer.
 */
(function (root) {
  'use strict';

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

  var HAN_G = /[一-鿿㐀-䶿\u{20000}-\u{2CEAF}]/gu;

  function hanOf(str) { return typeof str === 'string' ? (str.match(HAN_G) || []) : []; }

  function isHan(ch) { return !!ch && hanOf(ch).length === 1; }

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
  function addExamples(dict, it, keys) {
    keys.forEach(function (key) {
      var arr = pathValue(it, key);
      if (Array.isArray(arr)) arr.forEach(function (e) { if (e && typeof e === 'object') dictAdd(dict, e.w, e.r); });
    });
  }

  function addProse(dict, it) {
    [it.prompt, it.explanation].forEach(function (str) {
      if (typeof str !== 'string') return;
      rubyParse(str).forEach(function (g) { if (g.base != null) dictAdd(dict, g.base, g.reading); });
    });
  }

  // Build-time pairs (course.ruby.dict) go in first; any Han-only word is kept, single kanji included.
  function addBuildDict(dict, pairs) {
    if (!pairs || typeof pairs !== 'object' || Array.isArray(pairs)) return;
    Object.keys(pairs).forEach(function (w) {
      var r = pairs[w];
      if (typeof r !== 'string' || !r || !w || hanOf(w).length !== [...w].length) return;
      if (!Object.prototype.hasOwnProperty.call(dict, w)) dict[w] = r;
      else if (dict[w] !== r) dict[w] = null;
    });
  }

  function buildRubyDict(items, dictKeys, pairs) {
    var dict = {};
    addBuildDict(dict, pairs);
    if (!Array.isArray(items)) return dict;
    var keys = dictKeys && Array.isArray(dictKeys) ? dictKeys : ['meta.examples', 'meta.irregular'];
    items.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      addExamples(dict, it, keys);
      addProse(dict, it);
    });
    Object.keys(dict).forEach(function (w) { if (dict[w] === null) delete dict[w]; });
    return dict;
  }

  var api = {
    RUBY_RE: RUBY_RE,
    rubyParse: rubyParse,
    HAN_G: HAN_G,
    hanOf: hanOf,
    isHan: isHan,
    pathValue: pathValue,
    dictAdd: dictAdd,
    buildRubyDict: buildRubyDict
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoRubyDict = api;
})(typeof self !== 'undefined' ? self : this);
