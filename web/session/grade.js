/* session/grade.js — answer grading, record writes and verdict application of a study session.
 * Exports DojoSessionGrade: create(ctx, sx) -> { gradeInput, nextRecord, applyVerdict(item, verdict, { rec, prev, relearn, isNewRecord }) }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);

  function create(ctx, sx) {
  function stableGiven(g) {
    return typeof g === 'string' ? g.substring(0, util.K.MAX_ANSWER_G) : '';
  }

  function gradeInput(item, input) {
    if (!input || typeof input !== 'object') return null;
    if (item.type === 'choice') {
      if (!Number.isInteger(input.index) || input.index < 0 || input.index >= item.options.length) return null;
      var ok = util.correctIndexes(item).some(function (a) {
        return ctx.dojo.call('checkChoice', { answer: a, selected: input.index });
      });
      return { correct: ok, given: util.optionText(item, input.index) };
    }
    if (item.type === 'gap') {
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
    if (item.type === 'multi' || item.type === 'match' || item.type === 'order' || item.type === 'cloze' || item.type === 'numeric') {
      return gradeNew(item, input);
    }
    if (input.rating !== 'known' && input.rating !== 'again') return null;
    return { correct: input.rating === 'known', given: input.rating };
  }

  function gradeNew(item, input) {
    var seed = sx.session.id + '|' + item.id;
    var r;
    if (item.type === 'multi') {
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
    if (item.type === 'match') {
      var lp = util.shuffledIndexes(item.pairs.length, seed + '|L');
      var rights = sx.fn.rightsOf(item);
      var rp = util.shuffledIndexes(rights.length, seed + '|R');
      if (!util.isIdList(input.mapping, rights.length, false) || input.mapping.length !== lp.length) return null;
      var mapping = [];
      input.mapping.forEach(function (rid, pos) { mapping[lp[pos]] = rp[rid]; });
      r = ctx.dojo.call('checkMatch', { pairCount: item.pairs.length, mapping: mapping });
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
    if (item.type === 'order') {
      var op = util.orderPerm(item.steps.length, seed);
      if (!util.isIdList(input.sequence, op.length, true) || input.sequence.length !== op.length) return null;
      var seq = input.sequence.map(function (id) { return op[id]; });
      r = ctx.dojo.call('checkOrder', { stepCount: op.length, sequence: seq });
      return {
        correct: r.correct,
        given: seq.map(function (i, k) { return (k + 1) + '. ' + item.steps[i]; }).join('; '),
        detail: { firstWrong: r.firstWrong === undefined ? null : r.firstWrong }
      };
    }
    if (item.type === 'cloze') {
      var blanks = util.clozeBlanks(item);
      if (!Array.isArray(input.inputs) || input.inputs.length !== blanks.length) return null;
      if (!input.inputs.every(function (x) { return typeof x === 'string'; })) return null;
      r = ctx.dojo.call('checkCloze', { blanks: blanks, inputs: input.inputs, opts: ctx.fn.normalizeOpts(item) });
      return { correct: r.correct, given: input.inputs.join(' | '), detail: { results: r.results } };
    }
    if (typeof input.text !== 'string') return null;
    r = ctx.dojo.call('checkNumeric', { answer: item.answer, tolerance: item.tolerance || 0, input: input.text });
    return { correct: r.correct, given: input.text, detail: { parsed: r.parsed === undefined ? null : r.parsed } };
  }

  // Writes for one scoped entity: {memberId: record} (possibly empty). A repeated wrong in the same session goes
  // through relearn so the entity drops once.
  function scopedWrites(item, e, correct, relearn) {
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

  // Records to store for one answer: {id: record} or null.
  function nextRecord(item, correct, relearn) {
    var se = ctx.scopedEntityOf[item.id];
    if (se !== undefined) return scopedWrites(item, se, correct, relearn);
    var one = nextItemRecord(item, correct, relearn);
    if (!one) return null;
    var out = {};
    out[item.id] = one;
    return out;
  }

  function nextItemRecord(item, correct, relearn) {
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

  function commit(item, writes, countsNew) {
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
      if (countsNew) {
        doc.stats.newByDay = util.ensureObject(doc.stats.newByDay);
        doc.stats.newByDay[day] = (doc.stats.newByDay[day] || 0) + 1;
        var gid = ctx.unitGroup[item.unit];
        if (gid !== undefined) {
          var mates = ctx.entityMembers[ctx.itemEntities[item.id]] || [];
          var started = ctx.scopedEntityOf[item.id] === undefined && mates.some(function (m) { return m !== item.id && doc.items && doc.items[m] !== undefined; });
          if (!started) {
            var gKey = util.K.GROUP_NEW_PREFIX + gid;
            doc.stats[gKey] = util.ensureObject(doc.stats[gKey]);
            doc.stats[gKey][day] = (doc.stats[gKey][day] || 0) + 1;
          }
        }
        if (item.unit) {
          var unitKey = util.K.UNIT_NEW_PREFIX + item.unit;
          doc.stats[unitKey] = util.ensureObject(doc.stats[unitKey]);
          doc.stats[unitKey][day] = (doc.stats[unitKey][day] || 0) + 1;
        }
      }
    });
    if (sx.mode !== 'placement') ctx.store.noteAnswer();
  }

  function applyVerdict(item, verdict, options) {
    var rec = options.rec;
    var prev = options.prev;
    var relearn = options.relearn;
    var isNewRecord = options.isNewRecord;
    commit(item, rec, sx.mode === 'daily' && !relearn && isNewRecord);
    var setWrong = false;
    var se = ctx.scopedEntityOf[item.id];
    if (se !== undefined && sx.mode !== 'placement' && !verdict.correct && !sx.entityWrong[se]) {
      sx.entityWrong[se] = true;
      setWrong = true;
    }
    sx.answeredAt[sx.session.index] = true;
    sx.session.answered++;
    var pushed = false;
    if (!relearn && sx.mode !== 'placement') pushed = sx.fn.recordGrade(item, verdict);
    sx.lastAnswer = sx.mode === 'placement' ? null : { index: sx.session.index, item: item, prev: prev, relearn: relearn, verdict: verdict, pushed: pushed, setWrong: setWrong };
    if (sx.isTimedExam) {
      sx.draftAnswers[sx.session.index] = { i: sx.session.index, c: !!verdict.correct, g: stableGiven(verdict.given) };
      sx.fn.saveDraft(true);
    }
    return sx.fn.result(item, verdict);
  }

    return { gradeInput: gradeInput, nextRecord: nextRecord, applyVerdict: applyVerdict };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionGrade = api;
})(typeof self !== 'undefined' ? self : this);
