/*
 * modules/ja/web/ruby.js — ja module: built-in ruby markup {base|reading}, word annotation from a reading
 * dictionary (course.ruby) and DojoExt.useRuby. Global DojoJaRuby (UMD).
 */
(function (root, factory) {
  'use strict';
  var req = typeof require !== 'undefined';
  var registry = root.DojoExtRegistry || (req ? require('../../../web/ext/registry.js') : null);
  var ext = root.DojoExt || (req ? require('../../../web/ext.js') : null);
  var RD = root.DojoRubyDict || (req ? require('./ruby-dict.js') : null);
  var api = factory(registry, ext, RD);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoJaRuby = api;
})(typeof self !== 'undefined' ? self : this, function (registry, ext, RD) {
  'use strict';
  var RUBY_RE = RD.RUBY_RE, rubyParse = RD.rubyParse, hanOf = RD.hanOf, isHan = RD.isHan;
  var pathValue = RD.pathValue, buildRubyDict = RD.buildRubyDict;
  // Reading dictionary and skip set from the last useRuby call; reset() clears them.
  var R = { dict: null, skip: null, max: 0 };


  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function startsWordAt(str, j) {
    for (var l = Math.min(R.max, str.length - j); l > 0; l--) {
      if (Object.prototype.hasOwnProperty.call(R.dict, str.substr(j, l))) return true;
    }
    return false;
  }

  // Longest known word starting at i, or null. A word followed by a kanji that starts no known word is skipped.
  function longestWordAt(str, i) {
    for (var len = Math.min(R.max, str.length - i); len > 0; len--) {
      var w = str.substr(i, len);
      if (!Object.prototype.hasOwnProperty.call(R.dict, w)) continue;
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
    if (!R.dict || typeof str !== 'string') return [{ text: str }];
    var out = [];
    var buf = '';
    var i = 0;
    var lastEnd = -1;
    while (i < str.length) {
      var hit = i > 0 && i !== lastEnd && isHan(str.charAt(i - 1)) ? null : longestWordAt(str, i);
      if (hit) {
        if (buf) { out.push({ text: buf }); buf = ''; }
        splitRuby(hit, R.dict[hit]).forEach(function (x) { out.push(x); });
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
    R.skip = null;
    R.dict = null;
    R.max = 0;
    if (!cfg || typeof cfg !== 'object') return false;
    R.dict = buildRubyDict(items, cfg.dictKeys, cfg.dict);
    Object.keys(R.dict).forEach(function (w) { if (w.length > R.max) R.max = w.length; });
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
    R.skip = n ? set : null;
    return !!R.skip;
  }

  function rubyHidden(base) {
    if (!R.skip) return false;
    var han = hanOf(base);
    return han.length > 0 && han.every(function (c) { return R.skip[c] === true; });
  }

  function rubyRender(str, h, opts) {
    if (typeof str !== 'string') return str;
    var all = opts && opts.all;
    var annotate = opts && opts.annotate;
    var hide = opts && opts.hide;
    var segs = rubyParse(str);
    if ((all || annotate) && R.dict) {
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

  var markup = { render: rubyRender, plain: rubyPlain, parse: rubyParse };
  registry.registerBuiltinMarkup('ruby', markup);
  registry.onReset(function () { R.dict = null; R.skip = null; R.max = 0; });
  ext.provide('useRuby', useRuby);

  return {
    markup: markup, useRuby: useRuby, splitRuby: splitRuby, annotateText: annotateText,
    rubyHidden: rubyHidden, rubyRender: rubyRender, rubyPlain: rubyPlain, escHtml: escHtml
  };
});
