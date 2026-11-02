/* session/grade.js — answer grading, record writes and verdict application of a study session.
 * Exports DojoSessionGrade: create(ctx, sx) -> { gradeInput, nextRecord, applyVerdict(item, verdict, { rec, prev, relearn, isNewRecord }) }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);

  function stableGiven(g) {
    return typeof g === 'string' ? g.substring(0, util.K.MAX_ANSWER_G) : '';
  }

  function gradeChoice(ctx, item, input) {
    if (!Number.isInteger(input.index) || input.index < 0 || input.index >= item.options.length) return null;
    var ok = util.correctIndexes(item).some(function (a) {
      return ctx.dojo.call('checkChoice', { answer: a, selected: input.index });
    });
    return { correct: ok, given: util.optionText(item, input.index) };
  }

  function gradeGap(ctx, item, input) {
    if (typeof input.text !== 'string') return null;
    var args = { answers: item.answers, input: input.text, opts: ctx.fn.normalizeOpts(item) };
    // Use gapVerdict if retry readings are defined
    if (item.retry && item.retry.length > 0) {
      args.retry = item.retry;
      var verdict = ctx.dojo.call('gapVerdict', args);
      if (verdict === 'retry') {
        return { verdict: 'retry', correct: false, given: input.text };
      }
      return { correct: verdict === 'ok', given: input.text };
    }
    return { correct: ctx.dojo.call('checkGap', args), given: input.text };
  }

  function gradeRating(input) {
    if (input.rating !== 'known' && input.rating !== 'again') return null;
    return { correct: input.rating === 'known', given: input.rating };
  }

  function gradeMulti(g, item, input, seed) {
    var ctx = g.ctx;
    var perm = util.shuffledIndexes(item.options.length, seed);
    if (!util.isIdList(input.ids, perm.length, true)) return null;
    var sel = input.ids.map(function (id) { return perm[id]; });
    var okM = ctx.dojo.call('checkMulti', { correct: item.correct, selected: sel });
    var chosen = {};
    sel.forEach(function (i) { chosen[i] = true; });
    var isCorrect = {};
    item.correct.forEach(function (i) { isCorrect[i] = true; });
    var detail = { missing: [], extra: [] };
    perm.forEach(function (orig) {
      if (isCorrect[orig] && !chosen[orig]) detail.missing.push(item.options[orig]);
      if (chosen[orig] && !isCorrect[orig]) detail.extra.push(item.options[orig]);
    });
    return { correct: okM, given: sel.map(function (i) { return item.options[i]; }).join(', '), detail: detail };
  }

  function gradeMatch(g, item, input, seed) {
    var ctx = g.ctx;
    var sx = g.sx;
    var lp = util.shuffledIndexes(item.pairs.length, seed + '|L');
    var rights = sx.fn.rightsOf(item);
    var rp = util.shuffledIndexes(rights.length, seed + '|R');
    if (!util.isIdList(input.mapping, rights.length, false) || input.mapping.length !== lp.length) return null;
    var mapping = [];
    input.mapping.forEach(function (rid, pos) { mapping[lp[pos]] = rp[rid]; });
    var r = ctx.dojo.call('checkMatch', { pairCount: item.pairs.length, mapping: mapping });
    var wrongSet = {};
    r.wrong.forEach(function (i) { wrongSet[i] = true; });
    var wrong = [];
    lp.forEach(function (orig) { if (wrongSet[orig]) wrong.push(item.pairs[orig].left); });
    return {
      correct: r.correct,
      given: lp.map(function (orig, pos) { return item.pairs[orig].left + ' = ' + rights[rp[input.mapping[pos]]]; }).join('; '),
      detail: { wrong: wrong }
    };
  }

  function gradeOrder(g, item, input, seed) {
    var ctx = g.ctx;
    var op = util.orderPerm(item.steps.length, seed);
    if (!util.isIdList(input.sequence, op.length, true) || input.sequence.length !== op.length) return null;
    var seq = input.sequence.map(function (id) { return op[id]; });
    var r = ctx.dojo.call('checkOrder', { stepCount: op.length, sequence: seq, altOrders: item.altOrders || [] });
    var fmtOrder = function (o) { return o.map(function (i, k) { return (k + 1) + '. ' + item.steps[i]; }).join('; '); };
    var odetail = { firstWrong: r.firstWrong === undefined ? null : r.firstWrong };
    if (item.altOrders && item.altOrders.length) {
      odetail.matched = r.matched === undefined ? null : r.matched;
      odetail.alsoCorrect = r.correct ? [] : item.altOrders.map(fmtOrder);
    }
    return { correct: r.correct, given: fmtOrder(seq), detail: odetail };
  }

  function gradeCloze(g, item, input) {
    var ctx = g.ctx;
    var blanks = util.clozeBlanks(item);
    if (!Array.isArray(input.inputs) || input.inputs.length !== blanks.length) return null;
    if (!input.inputs.every(function (x) { return typeof x === 'string'; })) return null;
    var r = ctx.dojo.call('checkCloze', { blanks: blanks, inputs: input.inputs, opts: ctx.fn.normalizeOpts(item) });
    return { correct: r.correct, given: input.inputs.join(' | '), detail: { results: r.results } };
  }

  function gradeNumeric(g, item, input) {
    var ctx = g.ctx;
    if (typeof input.text !== 'string') return null;
    var r = ctx.dojo.call('checkNumeric', { answer: item.answer, tolerance: item.tolerance || 0, input: input.text });
    return { correct: r.correct, given: input.text, detail: { parsed: r.parsed === undefined ? null : r.parsed } };
  }

  var NEW_GRADERS = { multi: gradeMulti, match: gradeMatch, order: gradeOrder, cloze: gradeCloze, numeric: gradeNumeric };

  function gradeInput(ctx, sx, item, input) {
    if (!input || typeof input !== 'object') return null;
    if (item.type === 'choice') return gradeChoice(ctx, item, input);
    if (item.type === 'gap') return gradeGap(ctx, item, input);
    var grader = NEW_GRADERS[item.type];
    if (grader) return grader({ ctx: ctx, sx: sx }, item, input,sx.session.id + '|' + item.id);
    return gradeRating(input);
  }

  // Writes for one scoped entity: {memberId: record} (possibly empty). A repeated wrong in the same session goes
  // through relearn so the entity drops once.
  function scopedWrites(g, e, correct, relearn) {
    var ctx = g.ctx;
    var sx = g.sx;
    var unit = ctx.scopedUnit[e];
    var args = {
      members: ctx.fn.scopedMemberList(e), records: ctx.fn.scopedRecords(e), now: ctx.now(), correct: correct,
      ladder: ctx.fn.ladderForUnit(unit)
    };
    if (sx.mode === 'placement') {
      args.mode = 'placement';
      args.known = correct;
      args.seed = util.hashString(sx.session.seed + '|' + e).toString();
      return ctx.dojo.call('applyEntity', args);
    }
    var override = ctx.fn.getUnitSettingsOverride(unit);
    args.dropOnWrong = override.dropOnWrong !== undefined ? override.dropOnWrong : ctx.fn.unitConfig(unit).dropOnWrong;
    args.mode = relearn || sx.entityWrong[e] ? 'relearn' : (sx.mode === 'daily' ? 'answer' : 'practice');
    if (args.mode === 'relearn' && !correct) return {};
    return ctx.dojo.call('applyEntity', args);
  }

  function nextItemRecord(g, item, correct, relearn) {
    var ctx = g.ctx;
    var sx = g.sx;
    var rec = ctx.fn.records()[item.id];
    var ladder = ctx.fn.itemLadderFor(item);
    var base = { rec: rec === undefined ? null : rec, now: ctx.now(), ladder: ladder };
    if (sx.mode === 'placement') {
      var known = correct;
      var itemSeed = util.hashString(sx.session.seed + '|' + item.id).toString();
      return ctx.dojo.call('applyPlacement', { rec: rec === undefined ? null : rec, known: known, now: ctx.now(), ladder: ladder, seed: itemSeed });
    }
    if (relearn) {
      if (!correct || !rec || rec.s !== 0) return null;
      return ctx.dojo.call('applyRelearn', base);
    }
    base.correct = correct;
    base.drop = ctx.fn.dropForItem(item);
    return ctx.dojo.call(sx.mode === 'daily' ? 'applyAnswer' : 'applyPractice', base);
  }

  // Records to store for one answer: {id: record} or null.
  function nextRecord(g, item, correct, relearn) {
    var se = g.ctx.scopedEntityOf[item.id];
    if (se !== undefined) return scopedWrites(g, se, correct, relearn);
    var one = nextItemRecord(g, item, correct, relearn);
    if (!one) return null;
    var out = {};
    out[item.id] = one;
    return out;
  }

  function bumpCounter(stats, key, day) {
    stats[key] = util.ensureObject(stats[key]);
    stats[key][day] = (stats[key][day] || 0) + 1;
  }

  function groupStarted(ctx, doc, item) {
    var mates = ctx.entityMembers[ctx.itemEntities[item.id]] || [];
    return ctx.scopedEntityOf[item.id] === undefined && mates.some(function (m) { return m !== item.id && doc.items && doc.items[m] !== undefined; });
  }

  function countNewItem(ctx, doc, item, day) {
    doc.stats.newByDay = util.ensureObject(doc.stats.newByDay);
    doc.stats.newByDay[day] = (doc.stats.newByDay[day] || 0) + 1;
    var gid = ctx.unitGroup[item.unit];
    if (gid !== undefined && !groupStarted(ctx, doc, item)) bumpCounter(doc.stats, util.K.GROUP_NEW_PREFIX + gid, day);
    if (item.unit) bumpCounter(doc.stats, util.K.UNIT_NEW_PREFIX + item.unit, day);
  }

  function commit(g, item, writes, countsNew) {
    var ctx = g.ctx;
    var sx = g.sx;
    var day = ctx.today();
    ctx.store.update(function (doc) {
      if (writes) {
        doc.items = doc.items || {};
        Object.keys(writes).forEach(function (id) { doc.items[id] = writes[id]; });
      }
      if (sx.mode === 'placement') return;
      doc.stats = doc.stats || {};
      doc.stats.days = doc.stats.days || {};
      doc.stats.days[day] = (doc.stats.days[day] || 0) + 1;
      if (countsNew) countNewItem(ctx, doc, item, day);
    });
    if (sx.mode !== 'placement') ctx.store.noteAnswer();
  }

  function markEntityWrong(ctx, sx, item, verdict) {
    var se = ctx.scopedEntityOf[item.id];
    if (se === undefined || sx.mode === 'placement' || verdict.correct || sx.entityWrong[se]) return false;
    sx.entityWrong[se] = true;
    return true;
  }

  function recordDraftAnswer(sx, verdict) {
    if (!sx.isTimedExam) return;
    sx.draftAnswers[sx.session.index] = { i: sx.session.index, c: !!verdict.correct, g: stableGiven(verdict.given) };
    sx.fn.saveDraft(true);
  }

  function markTimedOut(ctx, verdict, options) {
    if (!verdict.correct && (options.timedOut === true || ctx.fn.qtimerPending())) return Object.assign({}, verdict, { timedOut: true });
    return verdict;
  }

  function advanceTimer(g, item, verdict, relearn) {
    if (relearn) g.ctx.fn.qtimerClear();
    else if (g.sx.mode !== 'placement') g.ctx.fn.qtimerAfter(item, verdict);
  }

  function applyVerdict(g, item, verdict, options) {
    var ctx = g.ctx;
    var sx = g.sx;
    verdict = markTimedOut(ctx, verdict, options);
    var rec = options.relearn || sx.mode === 'placement' ? options.rec : ctx.fn.extrasFor(item, options.rec, verdict);
    var relearn = options.relearn;
    commit(g, item, rec, sx.mode === 'daily' && !relearn && options.isNewRecord);
    var setWrong = markEntityWrong(ctx, sx, item, verdict);
    var timerSnap = ctx.fn.qtimerSnapshot();
    advanceTimer(g, item, verdict, relearn);
    sx.answeredAt[sx.session.index] = true;
    sx.session.answered++;
    var pushed = false;
    if (!relearn && sx.mode !== 'placement') pushed = sx.fn.recordGrade(item, verdict);
    sx.lastAnswer = sx.mode === 'placement' ? null : { index: sx.session.index, item: item, prev: options.prev, relearn: relearn, verdict: verdict, pushed: pushed, setWrong: setWrong, timer: relearn ? null : timerSnap };
    recordDraftAnswer(sx, verdict);
    var out = sx.fn.result(item, verdict);
    return verdict.timedOut ? Object.assign({}, out, { timedOut: true }) : out;
  }

  function nearMissOf(item) {
    if (item.type === 'gap') return item.answers;
    return item.type === 'numeric' ? [String(item.answer)] : null;
  }

  function overrideOff(g) {
    return g.sx.mode === 'exam' || g.sx.mode === 'placement' || g.ctx.course.allowOverride === false;
  }

  function canOverride(g) {
    var sx = g.sx;
    var la = sx.lastAnswer;
    if (!la || la.index !== sx.session.index || la.verdict.correct || la.verdict.dontKnow) return false;
    if (overrideOff(g) || util.K.TYPED.indexOf(la.item.type) < 0) return false;
    var nearMiss = nearMissOf(la.item);
    if (!nearMiss || typeof la.verdict.given !== 'string') return true;
    return util.isTypo(la.verdict.given, nearMiss);
  }

  function revertRecords(g, la, se) {
    g.ctx.store.update(function (doc) {
      doc.items = doc.items || {};
      if (se !== undefined) {
        Object.keys(la.prev).forEach(function (id) {
          if (la.prev[id] === undefined) delete doc.items[id]; else doc.items[id] = la.prev[id];
        });
      } else if (la.prev === undefined) delete doc.items[la.item.id]; else doc.items[la.item.id] = la.prev;
    });
  }

  function undoGrade(sx, la) {
    var item = la.item;
    sx.graded[item.id] = true;
    var row = sx.review[sx.review.length - 1];
    if (row && row.id === item.id) row.correct = true;
    if (la.pushed && sx.queue[sx.queue.length - 1] === item.id) {
      sx.queue.pop();
      delete sx.requeued[sx.fn.requeueKey(item)];
    }
  }

  function overrideLast(g) {
    var sx = g.sx;
    if (!sx.session.canOverride()) return { error: 'no_override' };
    var la = sx.lastAnswer;
    var item = la.item;
    var rec;
    try {
      var se = g.ctx.scopedEntityOf[item.id];
      revertRecords(g, la, se);
      if (se !== undefined && la.setWrong) delete sx.entityWrong[se];
      rec = sx.fn.nextRecord(item, true, la.relearn);
    } catch {
      return { error: 'engine' };
    }
    if (rec) g.ctx.store.update(function (doc) { Object.keys(rec).forEach(function (id) { doc.items[id] = rec[id]; }); });
    if (!la.relearn) undoGrade(sx, la);
    if (la.timer) g.ctx.fn.qtimerRestore(la.timer);
    sx.lastAnswer = null;
    return sx.fn.result(item, Object.assign({}, la.verdict, { correct: true }));
  }

  function create(ctx, sx) {
    var g = { ctx: ctx, sx: sx };
    return {
      canOverride: function () { return canOverride(g); },
      overrideLast: function () { return overrideLast(g); },
      gradeInput: function (item, input) { return gradeInput(ctx, sx, item, input); },
      nextRecord: function (item, correct, relearn) { return nextRecord(g, item, correct, relearn); },
      applyVerdict: function (item, verdict, options) { return applyVerdict(g, item, verdict, options); }
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionGrade = api;
})(typeof self !== 'undefined' ? self : this);
