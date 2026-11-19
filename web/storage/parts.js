/*
 * storage/parts.js — pure helpers: cloud doc byte size, split of items into part docs, reassembly.
 */
(function (root) {
  'use strict';

  /** Deep copy by JSON round trip; local so parts.js does not require adapters.js (no import cycle). */
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /** Max compact UTF-8 bytes per cloud doc (measured platform: pass 139 KB, fail 162 KB). */
  var CLOUD_DOC_BUDGET_BYTES = 120000;
  /** Max number of part docs one body may be split into. */
  var MAX_PARTS = 64;

  /** UTF-8 byte length of the compact JSON of v; 0 when JSON has no text (undefined). */
  function byteSize(v) {
    var text = JSON.stringify(v);
    if (text === undefined) return 0;
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    var n = 0;
    for (var i = 0; i < text.length; i++) {
      var cp = text.codePointAt(i);
      if (cp > 0xffff) i++;
      n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    }
    return n;
  }

  function partPath(mainPath, k) { return mainPath + '.part' + k; }

  /** Part count of a main doc: raw.parts when it is an integer 1..MAX_PARTS, else 0. */
  function partCount(raw) {
    var k = raw && typeof raw === 'object' ? raw.parts : 0;
    return Number.isInteger(k) && k >= 1 && k <= MAX_PARTS ? k : 0;
  }

  function emptyPart(body) {
    return { v: 1, course: body.course, t: 0, resetAt: body.resetAt, items: {} };
  }

  /**
   * Splits body items (sorted by id) into part docs, each at most budget bytes.
   * Returns {main, parts} (main carries parts = count), or null when one record
   * alone does not fit or the count exceeds MAX_PARTS.
   */
  function splitItems(body, budget) {
    var src = clone(body);
    var srcItems = src.items || {};
    var parts = [];
    var cur = emptyPart(src);
    var ids = Object.keys(srcItems).sort();
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      cur.items[id] = srcItems[id];
      if (byteSize(cur) <= budget) continue;
      delete cur.items[id];
      if (Object.keys(cur.items).length === 0) return null;
      parts.push(cur);
      cur = emptyPart(src);
      cur.items[id] = srcItems[id];
      if (byteSize(cur) > budget) return null;
    }
    if (Object.keys(cur.items).length > 0) parts.push(cur);
    if (parts.length > MAX_PARTS) return null;
    var main = clone(body);
    main.items = {};
    main.parts = parts.length;
    return { main: main, parts: parts };
  }

  /** Folds merge(acc, part) over partDocs starting from a copy of main, then drops the parts key. */
  function assemble(main, partDocs, merge) {
    var acc = partDocs.reduce(function (a, p) { return merge(a, p); }, clone(main));
    delete acc.parts;
    return acc;
  }

  var api = {
    CLOUD_DOC_BUDGET_BYTES: CLOUD_DOC_BUDGET_BYTES,
    MAX_PARTS: MAX_PARTS,
    byteSize: byteSize,
    partPath: partPath,
    partCount: partCount,
    splitItems: splitItems,
    assemble: assemble
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorageParts = api;
  }
})(typeof self !== 'undefined' ? self : this);
