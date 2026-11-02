/* session/run-view.js — per-session view building, result shaping and grade recording of the study session engine.
 * Exports DojoSessionRunView: create(ctx, sx) -> { rightsOf, viewFor, isNewFor, scopedPrev, requeueKey, result, prevOf, recordGrade }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);

  function rightsOf(item) {
    return item.pairs.map(function (p) { return p.right; }).concat(item.distractors || []);
  }

  function labelled(list, key) {
    return list.map(function (orig, pos) { return { label: key(orig), id: pos }; });
  }

  function matchView(item, seed) {
    var lp = util.shuffledIndexes(item.pairs.length, seed + '|L');
    var rights = rightsOf(item);
    var rp = util.shuffledIndexes(rights.length, seed + '|R');
    return {
      lefts: labelled(lp, function (orig) { return item.pairs[orig].left; }),
      rights: labelled(rp, function (orig) { return rights[orig]; })
    };
  }

  function clozeView(item) {
    var n = 0;
    return {
      segments: item.parts.map(function (p) { return typeof p === 'string' ? { text: p } : { blank: n++ }; }),
      blanks: n
    };
  }

  function viewFor(sx, item) {
    var seed = sx.session.id + '|' + item.id;
    switch (item.type) {
      case 'choice':
        return { options: util.shuffledIndexes(item.options.length, seed).map(function (orig) { return { label: util.optionText(item, orig), index: orig }; }) };
      case 'multi':
        return { options: labelled(util.shuffledIndexes(item.options.length, seed), function (orig) { return item.options[orig]; }) };
      case 'match': return matchView(item, seed);
      case 'order':
        return { steps: labelled(util.orderPerm(item.steps.length, seed), function (orig) { return item.steps[orig]; }) };
      case 'cloze': return clozeView(item);
      case 'numeric': return { unitLabel: item.unitLabel || null };
      case 'card': return sx.revealed ? { back: item.back } : {};
      default: return {};
    }
  }

  function isNewFor(ctx, item) {
    var se = ctx.scopedEntityOf[item.id];
    return se !== undefined ? ctx.fn.entityViewOf(se) === null : ctx.fn.records()[item.id] === undefined;
  }

  function scopedPrev(ctx, e) {
    var snap = {};
    var recs = ctx.fn.records();
    ctx.entityMembers[e].forEach(function (id) { snap[id] = recs[id]; });
    return snap;
  }

  function requeueKey(ctx, item) {
    var se = ctx.scopedEntityOf[item.id];
    return se !== undefined ? 'e:' + se : item.id;
  }

  function feedback(item, graded) {
    var out = { correct: graded.correct, expected: util.expectedFor(item), explanation: item.explanation || null };
    if (graded.dontKnow) out.given = graded.given;
    if (item.type === 'gap') out.accepted = item.answers.slice();
    if (graded.detail) out.detail = graded.detail;
    return out;
  }

  function result(ctx, sx, item, graded) {
    var session = sx.session;
    if (sx.mode === 'exam' && !session.training) return { recorded: true };
    if (sx.mode === 'placement') {
      // Self mode: no feedback
      return (session.placementMode || ctx.fn.placementMode()) === 'check' ? feedback(item, graded) : { recorded: true };
    }
    return feedback(item, graded);
  }

  function prevOf(ctx, item) {
    var se = ctx.scopedEntityOf[item.id];
    return se !== undefined ? scopedPrev(ctx, se) : ctx.fn.records()[item.id];
  }

  function recordGrade(ctx, sx, item, verdict) {
    sx.graded[item.id] = verdict.correct;
    var entry = { id: item.id, correct: verdict.correct, given: verdict.given, expected: util.expectedFor(item) };
    if (verdict.timedOut === true) entry.timedOut = true;
    sx.review.push(entry);
    var rk = requeueKey(ctx, item);
    if (!verdict.correct && sx.mode !== 'exam' && !sx.requeued[rk]) {
      sx.requeued[rk] = true;
      sx.queue.push(item.id);
      return true;
    }
    return false;
  }

  function baseSummary(ctx, sx) {
    var review = sx.review;
    return {
      mode: sx.mode,
      correct: review.filter(function (r) { return r.correct; }).length,
      total: sx.session.total,
      answered: review.length,
      skipped: sx.skipped.slice(),
      durationMs: ctx.now() - sx.startedAt,
      review: review.slice()
    };
  }

  function create(ctx, sx) {
    return {
      baseSummary: function () { return baseSummary(ctx, sx); },
      rightsOf: rightsOf,
      viewFor: function (item) { return viewFor(sx, item); },
      isNewFor: function (item) { return isNewFor(ctx, item); },
      scopedPrev: function (e) { return scopedPrev(ctx, e); },
      requeueKey: function (item) { return requeueKey(ctx, item); },
      result: function (item, graded) { return result(ctx, sx, item, graded); },
      prevOf: function (item) { return prevOf(ctx, item); },
      recordGrade: function (item, verdict) { return recordGrade(ctx, sx, item, verdict); }
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionRunView = api;
})(typeof self !== 'undefined' ? self : this);
