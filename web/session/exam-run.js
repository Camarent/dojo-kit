/* session/exam-run.js — draft saving, timer groups and exam scoring of a running exam session.
 * Exports DojoSessionExamRun: create(ctx, sx) -> { saveDraft, closeDraft, enterGroup, skipRange, examSummary, storeExam }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);

  function create(ctx, sx) {
  function buildDraft() {
    var answers = Object.keys(sx.draftAnswers).map(Number).sort(function (x, y) { return x - y; }).map(function (i) {
      return sx.draftAnswers[i];
    });
    var draft = {
      sid: sx.session.id,
      examId: sx.plan.exam.id,
      ids: sx.queue.slice(),
      sections: sx.plan.sections,
      index: sx.session.index,
      group: sx.groups ? sx.groupIdx : 0,
      remainingMs: sx.fn.remainingList(),
      elapsedMs: Math.max(0, ctx.now() - sx.startedAt),
      answers: answers,
      startedAt: sx.resume ? sx.resume.startedAt : sx.startedAt,
      updatedAt: ctx.now()
    };
    return draft;
  }

  function saveDraft(force) {
    if (!sx.isTimedExam || sx.draftClosed) return;
    var t = ctx.now();
    if (!force && t - sx.lastWriteAt < util.K.WRITE_THROTTLE_MS) { sx.draftDirty = true; return; }
    var draft = buildDraft();
    sx.lastWriteAt = t;
    sx.draftDirty = false;
    ctx.store.update(function (doc) {
      var prev = doc.examDraft;
      if (prev && typeof prev === 'object' && prev.sid === sx.session.id && prev.closed) return;
      if (prev && Array.isArray(prev.closedSids)) {
        if (prev.closedSids.some(function (c) { return c && c.sid === sx.session.id; })) return;
        draft.closedSids = prev.closedSids;
      }
      doc.examDraft = draft;
    });
  }

  function closeDraft(doc, reason) {
    sx.draftClosed = true;
    ctx.fn.closeSlot(doc, sx.session.id, reason, ctx.now());
  }

  function enterGroup(g) {
    sx.groupIdx = g;
    sx.session.group = { index: g, count: sx.groups.length };
    sx.session.deadline = ctx.now() + sx.groups[g].minutes * 60000;
    saveDraft(true);
  }

  function skipRange(from, to) {
    for (var k = from; k < to; k++) {
      if (!sx.answeredAt[k]) sx.skipped.push(sx.queue[k]);
    }
  }

  function examSummary(sum) {
    var results = sx.plan.ids.map(function (id) { return { id: id, correct: sx.graded[id] === true }; });
    var exam = sx.plan.exam;
    var args = { results: results, total: sx.plan.ids.length };
    if (typeof exam.passMark === 'number') args.passMark = exam.passMark;
    if (exam.pass !== undefined) args.pass = exam.pass;
    if (exam.scoring && exam.scoring.length) {
      args.scoring = exam.scoring;
      args.sections = sx.plan.sections;
      if (exam.passPoints !== undefined && exam.passPoints !== null) args.passPoints = exam.passPoints;
    }
    var scored = ctx.dojo.call('score', args);
    sum.raw = scored.raw;
    sum.fraction = scored.fraction;
    sum.pass = scored.pass;
    sum.short = sx.plan.warnings || [];
    if (scored.parts && scored.parts.length) {
      sum.parts = scored.parts;
      sum.totalPoints = scored.totalPoints;
      if (args.passPoints !== undefined) sum.passPoints = args.passPoints;
    }
    if (exam.note) sum.note = exam.note;
    if (sx.plan.examId !== undefined) sum.examId = sx.plan.examId;
    if (sx.session.training) sum.training = true;
    if (scored.estimate === true) sum.estimate = true;
    return scored;
  }

  function storeExam(scored, alsoClose) {
    var entry = { date: ctx.today(), raw: scored.raw, total: scored.total, fraction: scored.fraction, pass: scored.pass, mode: 'exam' };
    if (sx.plan.examId !== undefined) entry.examId = sx.plan.examId;
    if (scored.parts && scored.parts.length) {
      entry.parts = scored.parts;
      entry.totalPoints = scored.totalPoints;
    }
    if (scored.estimate === true) entry.estimate = true;
    var key = 'exam-' + ctx.now();
    var sid = sx.session.id;
    var blocked = false;
    ctx.store.update(function (doc) {
      var slot = doc.examDraft;
      if (slot && typeof slot === 'object') {
        if (slot.sid === sid && slot.closed === 'finished') {
          blocked = true;
          return;
        }
        if (Array.isArray(slot.closedSids) && slot.closedSids.some(function (c) { return c && c.sid === sid; })) {
          blocked = true;
          return;
        }
      }
      doc.exams = doc.exams || {};
      doc.exams[key] = entry;
      if (alsoClose) closeDraft(doc, 'finished');
    });
    if (blocked) return { error: 'finished_elsewhere' };
  }

    return {
      buildDraft: buildDraft, saveDraft: saveDraft, closeDraft: closeDraft, enterGroup: enterGroup,
      skipRange: skipRange, examSummary: examSummary, storeExam: storeExam
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionExamRun = api;
})(typeof self !== 'undefined' ? self : this);
