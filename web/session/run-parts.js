/* session/run-parts.js — session state helpers of the study session engine: the shared sx object and the remaining-time list.
 * Exports DojoSessionRunParts: { makeSx(ctx, mode, plan, session), remainingList(rc) }; rc = { ctx, sx, session, view }.
 */
(function (root) {
  'use strict';

  function remainingList(rc) {
    var left = Math.max(0, rc.session.deadline - rc.ctx.now());
    if (!rc.sx.groups) return [left];
    return rc.sx.groups.map(function (g, gi) {
      if (gi === rc.sx.groupIdx) return left;
      return gi < rc.sx.groupIdx ? 0 : g.minutes * 60000;
    });
  }

  // sx: shared session state for session/grade.js and session/exam-run.js; the reassigned fields live only here.
  function makeSx(ctx, mode, plan, session) {
    var groups = plan.groups || null;
    var resume = plan.resume;
    if (groups) session.group = { index: resume ? resume.group : 0, count: groups.length };
    return {
      mode: mode, plan: plan, session: session, resume: resume, groups: groups,
      lockHolder: mode === 'exam' && plan.deadline !== undefined ? ctx.fn.acquireWakeLock() : null, queue: plan.ids.slice(),
      startedAt: resume ? ctx.now() - resume.elapsedMs : ctx.now(), answeredAt: {}, graded: {}, review: [], repeated: {}, // repeated: repeats queued per question id
      entityWrong: {}, // scoped entities that already dropped once in this session
      skipped: [], // items skipped due to timer expiry
      introduced: {}, // items that showed their intro (introNew)
      introSeen: Object.create(null), // entities whose intro card was dismissed in this session
      isTimedExam: mode === 'exam' && !plan.training && plan.deadline !== undefined, draftAnswers: {}, fn: {},
      groupIdx: groups ? session.group.index : 0, revealed: false, summary: null, lastAnswer: null,
      draftClosed: false, draftDirty: false, lastWriteAt: -Infinity
    };
  }

  var api = { makeSx: makeSx, remainingList: remainingList };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionRunParts = api;
})(typeof self !== 'undefined' ? self : this);
