/* session/run-view.js — per-session view building, result shaping and grade recording of the study session engine.
 * Exports DojoSessionRunView: create(ctx, sx) -> { rightsOf, viewFor, isNewFor, scopedPrev, requeueKey, result, prevOf, recordGrade }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);

  function create(ctx, sx) {
    var session = sx.session;
    var mode = sx.mode;
    var graded = sx.graded;
    var review = sx.review;
    var requeued = sx.requeued;
    var queue = sx.queue;

    function rightsOf(item) {
      return item.pairs.map(function (p) { return p.right; }).concat(item.distractors || []);
    }

    function viewFor(item) {
      if (item.type === 'choice') {
        var order = util.shuffledIndexes(item.options.length, session.id + '|' + item.id);
        return { options: order.map(function (orig) { return { label: util.optionText(item, orig), index: orig }; }) };
      }
      var seed = session.id + '|' + item.id;
      if (item.type === 'multi') {
        return { options: util.shuffledIndexes(item.options.length, seed).map(function (orig, pos) { return { label: item.options[orig], id: pos }; }) };
      }
      if (item.type === 'match') {
        var lp = util.shuffledIndexes(item.pairs.length, seed + '|L');
        var rp = util.shuffledIndexes(rightsOf(item).length, seed + '|R');
        return {
          lefts: lp.map(function (orig, pos) { return { label: item.pairs[orig].left, id: pos }; }),
          rights: rp.map(function (orig, pos) { return { label: rightsOf(item)[orig], id: pos }; })
        };
      }
      if (item.type === 'order') {
        return { steps: util.orderPerm(item.steps.length, seed).map(function (orig, pos) { return { label: item.steps[orig], id: pos }; }) };
      }
      if (item.type === 'cloze') {
        var n = 0;
        return {
          segments: item.parts.map(function (p) { return typeof p === 'string' ? { text: p } : { blank: n++ }; }),
          blanks: n
        };
      }
      if (item.type === 'numeric') return { unitLabel: item.unitLabel || null };
      if (item.type === 'card') return sx.revealed ? { back: item.back } : {};
      return {};
    }

    function isNewFor(item) {
      var se = ctx.scopedEntityOf[item.id];
      return se !== undefined ? ctx.fn.entityViewOf(se) === null : ctx.fn.records()[item.id] === undefined;
    }

    function scopedPrev(e) {
      var snap = {};
      var recs = ctx.fn.records();
      ctx.entityMembers[e].forEach(function (id) { snap[id] = recs[id]; });
      return snap;
    }

    function requeueKey(item) {
      var se = ctx.scopedEntityOf[item.id];
      return se !== undefined ? 'e:' + se : item.id;
    }

    function result(item, graded_) {
      if (mode === 'exam' && !session.training) return { recorded: true };
      if (mode === 'placement') {
        var placementModeVar = session.placementMode || ctx.fn.placementMode();
        if (placementModeVar === 'check') {
          var out = { correct: graded_.correct, expected: util.expectedFor(item), explanation: item.explanation || null };
          if (graded_.dontKnow) out.given = graded_.given;
          if (item.type === 'gap') out.accepted = item.answers.slice();
          if (graded_.detail) out.detail = graded_.detail;
          return out;
        } else {
          // Self mode: original behavior - no feedback
          return { recorded: true };
        }
      }
      var out = { correct: graded_.correct, expected: util.expectedFor(item), explanation: item.explanation || null };
      if (graded_.dontKnow) out.given = graded_.given;
      if (item.type === 'gap') out.accepted = item.answers.slice();
      if (graded_.detail) out.detail = graded_.detail;
      return out;
    }

    function prevOf(item) {
      var se = ctx.scopedEntityOf[item.id];
      return se !== undefined ? scopedPrev(se) : ctx.fn.records()[item.id];
    }

    function recordGrade(item, verdict) {
      graded[item.id] = verdict.correct;
      var entry = { id: item.id, correct: verdict.correct, given: verdict.given, expected: util.expectedFor(item) };
      if (verdict.timedOut === true) entry.timedOut = true;
      review.push(entry);
      var rk = requeueKey(item);
      if (!verdict.correct && mode !== 'exam' && !requeued[rk]) {
        requeued[rk] = true;
        queue.push(item.id);
        return true;
      }
      return false;
    }

    function baseSummary() {
      var correct = review.filter(function (r) { return r.correct; }).length;
      return {
        mode: mode,
        correct: correct,
        total: session.total,
        answered: review.length,
        skipped: sx.skipped.slice(),
        durationMs: ctx.now() - sx.startedAt,
        review: review.slice()
      };
    }
    return {
      baseSummary: baseSummary, rightsOf: rightsOf, viewFor: viewFor, isNewFor: isNewFor, scopedPrev: scopedPrev,
      requeueKey: requeueKey, result: result, prevOf: prevOf, recordGrade: recordGrade
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionRunView = api;
})(typeof self !== 'undefined' ? self : this);
