/*
 * modules/ja/web/kanji-rows.js — ja module: default feedback rows (kanji breakdown of the answered item).
 * Registered as the registerFeedbackRows fallback, so a course plugin hook still wins.
 */
(function (root) {
  'use strict';
  var ext = root.DojoExt || (typeof require !== 'undefined' ? require('../../../web/ext.js') : null);

  // ctx: { examMode, items, course }; no rows in exam mode or without course.breakdown.
  function kanjiRows(item, ctx) {
    if (!item || !ctx || ctx.examMode || !ctx.items || !ctx.course || !ext.kanjiBreakdown) return null;
    var cfgOrLang = ctx.course.breakdown;
    if (cfgOrLang === undefined) return null;
    return ext.kanjiBreakdown(item, ctx.items, cfgOrLang);
  }

  ext.registerFeedbackRows(kanjiRows, { fallback: true, aliases: { ch: ['kanji'] } });

  var api = { kanjiRows: kanjiRows };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoJaKanjiRows = api;
})(typeof self !== 'undefined' ? self : this);
