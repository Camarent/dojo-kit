/* session/util.js — pure helpers of the study session engine. Exports DojoSessionUtil. */
(function (root) {
  'use strict';

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffledIndexes(count, seedText) {
    var rand = mulberry32(hashString(seedText));
    var order = [];
    for (var i = 0; i < count; i++) order.push(i);
    for (var j = count - 1; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var tmp = order[j];
      order[j] = order[k];
      order[k] = tmp;
    }
    return order;
  }
  function isRetired(item) {
    return item.status === 'retired';
  }
  function ensureObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }
  function expectedFor(item) {
    if (item.type === 'choice') return optionText(item, correctIndexes(item)[0]);
    if (item.type === 'gap') return item.answers[0];
    if (item.type === 'multi') return item.correct.map(function (i) { return item.options[i]; }).join(', ');
    if (item.type === 'match') return item.pairs.map(function (p) { return p.left + ' = ' + p.right; }).join('; ');
    if (item.type === 'order') return item.steps.map(function (st, i) { return (i + 1) + '. ' + st; }).join('; ');
    if (item.type === 'cloze') return item.parts.map(function (p) { return typeof p === 'string' ? p : p[0]; }).join('');
    if (item.type === 'numeric') {
      var out = String(item.answer);
      if (item.unitLabel) out += ' ' + item.unitLabel;
      if (item.tolerance > 0) out += ' (\u00b1' + item.tolerance + ')';
      return out;
    }
    return item.back;
  }

  function isIdList(ids, size, unique) {
    if (!Array.isArray(ids)) return false;
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var v = ids[i];
      if (!Number.isInteger(v) || v < 0 || v >= size) return false;
      if (unique && seen[v]) return false;
      seen[v] = true;
    }
    return true;
  }
  function isIdentity(perm) {
    return perm.every(function (v, i) { return v === i; });
  }
  function orderPerm(count, seedText) {
    var perm = shuffledIndexes(count, seedText);
    if (count >= 2 && isIdentity(perm)) perm = perm.slice(1).concat(perm[0]);
    return perm;
  }
  function clozeBlanks(item) {
    return item.parts.filter(function (p) { return typeof p !== 'string'; });
  }
  function correctIndexes(item) {
    return Array.isArray(item.answer) ? item.answer : [item.answer];
  }
  function optionText(item, index) {
    return item.options[index];
  }

  var api = {
    hashString: hashString, mulberry32: mulberry32, shuffledIndexes: shuffledIndexes, isRetired: isRetired,
    ensureObject: ensureObject, expectedFor: expectedFor, isIdList: isIdList, orderPerm: orderPerm,
    clozeBlanks: clozeBlanks, correctIndexes: correctIndexes, optionText: optionText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionUtil = api;
})(typeof self !== 'undefined' ? self : this);
