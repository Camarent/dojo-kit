/* session/run.js — createSession: one study session over a plan (queue, answers, intros, overrides, finish).
 * Exports DojoSessionRun: create(ctx) -> { createSession(mode, plan) }.
 */
(function (root) {
  'use strict';

  function dep(name, file) {
    return root[name] || (typeof require === 'function' ? require(file) : null);
  }

  var util = dep('DojoSessionUtil', './util.js');
  var gradeMod = dep('DojoSessionGrade', './grade.js');
  var runViewMod = dep('DojoSessionRunView', './run-view.js');
  var examRunMod = dep('DojoSessionExamRun', './exam-run.js');

  function initialSession(ctx, mode, plan) {
    var resume = plan.resume;
    var n = plan.ids.length;
    var session = {
      id: resume ? resume.sid : ctx.fn.newSessionId(mode), mode: mode, total: n, initialTotal: n,
      index: 0, done: false, answered: resume ? resume.answers.length : 0
    };
    if (plan.deadline !== undefined) session.deadline = plan.deadline;
    if (mode === 'placement') { session.seed = plan.seed; session.placementMode = ctx.fn.placementMode(); }
    if (plan.warnings) session.warnings = plan.warnings;
    if (mode === 'exam') {
      if (plan.examId !== undefined) session.examId = plan.examId;
      session.training = !!plan.training;
    }
    return session;
  }

  function remainingList(rc) {
    var left = Math.max(0, rc.session.deadline - rc.ctx.now());
    if (!rc.sx.groups) return [left];
    return rc.sx.groups.map(function (g, gi) {
      if (gi === rc.sx.groupIdx) return left;
      return gi < rc.sx.groupIdx ? 0 : g.minutes * 60000;
    });
  }

  function currentId(rc) {
    return rc.session.index < rc.sx.queue.length ? rc.sx.queue[rc.session.index] : null;
  }

  function showsIntro(rc, item) {
    var sx = rc.sx;
    var ctx = rc.ctx;
    if (!ctx.course.introNew || !item.explanation) return false;
    if (sx.mode === 'placement' || (sx.mode === 'exam' && !rc.session.training)) return false;
    if (!rc.view.isNewFor(item) || sx.introduced[item.id]) return false;
    return ctx.fn.stimulusOf(item) === null && !ctx.fn.hasAudioLines(item);
  }

  function attachIntros(rc) {
    var session = rc.session;
    var fn = rc.ctx.fn;
    session.shouldShowIntro = function (item) {
      if (!showsIntro(rc, item)) return false;
      rc.sx.introduced[item.id] = true;
      return true;
    };
    session.introFor = function (item) { return fn.introFor(rc.sx.mode, rc.sx.introSeen, item); };
    session.entityIntro = fn.entityIntro;
    session.markIntroSeen = function (entity) { fn.markIntroSeen(rc.sx.introSeen, entity); };
  }

  // Early-exit answer errors shared by answer() and dontKnow(), or null.
  function answerGuard(rc) {
    if (currentId(rc) === null) return { error: 'finished' };
    if (rc.sx.answeredAt[rc.session.index]) return { error: 'already_answered' };
    return null;
  }

  function answerPlacement(rc, item, input, relearn) {
    var sx = rc.sx;
    var verdict;
    var known;
    if ((rc.session.placementMode || rc.ctx.fn.placementMode()) === 'check') {
      // Check mode: grade the answer like a normal session
      verdict = sx.fn.gradeInput(item, input);
      if (!verdict) return { out: { error: 'bad_input' } };
      // For gap retry: in placement check mode, treat retry as wrong (no retry allowed)
      if (verdict.verdict === 'retry') verdict = { correct: false, given: verdict.given };
      known = verdict.correct;
      return { rec: sx.fn.nextRecord(item, known, relearn), verdict: Object.assign({}, verdict, { known: known }) };
    }
    // Self mode: original behavior
    var rating = input && input.rating;
    if (rating !== 'known' && rating !== 'again') return { out: { error: 'bad_input' } };
    known = rating === 'known';
    return { rec: sx.fn.nextRecord(item, known, relearn), verdict: { correct: known, given: known ? 'known' : 'unknown', known: known } };
  }

  function answerRegular(rc, item, input, relearn) {
    var sx = rc.sx;
    var pending = rc.ctx.fn.qtimerPending();
    var verdict = sx.fn.gradeInput(item, input);
    if (!verdict && pending) verdict = { correct: false, given: '' };
    if (!verdict) return { out: { error: 'bad_input' } };
    // For gap retry: don't record, don't advance, don't mark as answered
    if (verdict.verdict === 'retry' && ((sx.mode === 'exam' && !rc.session.training) || pending)) {
      verdict = { correct: false, given: verdict.given };
    } else if (verdict.verdict === 'retry') {
      return { out: { verdict: 'retry', retry: true, expected: util.expectedFor(item), explanation: item.explanation || null } };
    }
    return { rec: sx.fn.nextRecord(item, verdict.correct, relearn), verdict: verdict };
  }

  function answer(rc, input) {
    var guard = answerGuard(rc);
    if (guard) return guard;
    var item = rc.ctx.byId[currentId(rc)];
    var relearn = rc.session.index >= rc.session.total;
    var isNewRecord = rc.view.isNewFor(item);
    var prev = rc.view.prevOf(item);
    var r;
    try {
      r = rc.sx.mode === 'placement' ? answerPlacement(rc, item, input, relearn) : answerRegular(rc, item, input, relearn);
    } catch {
      return { error: 'engine' };
    }
    if (r.out) return r.out;
    return rc.sx.fn.applyVerdict(item, r.verdict, { rec: r.rec, prev: prev, relearn: relearn, isNewRecord: isNewRecord });
  }

  // viaNext: the Next button on a quiz card with no answer; it counts as "don't know" even when the course flag is off.
  function dontKnow(rc, viaNext) {
    var guard = answerGuard(rc);
    if (guard) return guard;
    if (!canDontKnow(rc, viaNext)) return { error: 'no_dont_know' };
    var item = rc.ctx.byId[currentId(rc)];
    var relearn = rc.session.index >= rc.session.total;
    var prev = rc.view.prevOf(item);
    var isNewRecord = rc.view.isNewFor(item);
    var rec;
    try {
      rec = rc.sx.fn.nextRecord(item, false, relearn);
    } catch {
      return { error: 'engine' };
    }
    return rc.sx.fn.applyVerdict(item, { correct: false, given: '-', dontKnow: true }, { rec: rec, prev: prev, relearn: relearn, isNewRecord: isNewRecord });
  }

  function canDontKnow(rc, viaNext) {
    var sx = rc.sx;
    if (!viaNext && rc.ctx.course.dontKnow !== true) return false;
    if (sx.mode === 'placement' && (rc.session.placementMode || rc.ctx.fn.placementMode()) === 'self') return false;
    var item = rc.ctx.byId[currentId(rc)];
    if (!item || util.K.SELF_RATED.indexOf(item.type) >= 0) return false;
    return !(sx.mode === 'exam' && !rc.session.training);
  }

  function attachAnswers(rc) {
    var session = rc.session;
    session.current = function () {
      var id = currentId(rc);
      if (id === null) return null;
      var item = rc.ctx.byId[id];
      return { item: item, position: session.index + 1, total: rc.sx.queue.length, view: rc.view.viewFor(item), stimulus: rc.ctx.fn.stimulusOf(item) };
    };
    session.reveal = function () { rc.sx.revealed = true; };
    session.answer = function (input) { return answer(rc, input); };
    session.dontKnow = function (viaNext) { return dontKnow(rc, viaNext === true); };
    session.canDontKnow = function () { return canDontKnow(rc, false); };
    session.canNextWrong = function () { return canDontKnow(rc, true); };
    session.canOverride = rc.sx.fn.canOverride;
    session.overrideLast = rc.sx.fn.overrideLast;
    session.retryCount = function () { return Math.max(0, rc.sx.queue.length - Math.max(session.index, session.total)); };
  }

  function nextGroupDue(rc) {
    var sx = rc.sx;
    var groups = sx.groups;
    return !!groups && !rc.session.done && sx.groupIdx + 1 < groups.length && rc.session.index >= groups[sx.groupIdx + 1].start;
  }

  function finishAll(rc, out) {
    rc.sx.fn.skipRange(rc.session.index, rc.sx.queue.length);
    rc.session.index = rc.sx.queue.length;
    rc.session.done = true;
    out.finished = true;
    return out;
  }

  function expire(rc) {
    var sx = rc.sx;
    var session = rc.session;
    var out = { jumped: false, finished: false };
    if (session.deadline === undefined || session.done || rc.ctx.now() < session.deadline) return out;
    while (rc.ctx.now() >= session.deadline) {
      if (!sx.groups || sx.groupIdx + 1 >= sx.groups.length) return finishAll(rc, out);
      sx.fn.skipRange(session.index, Math.min(sx.groups[sx.groupIdx + 1].start, sx.queue.length));
      session.index = sx.groups[sx.groupIdx + 1].start;
      sx.revealed = false;
      sx.fn.enterGroup(sx.groupIdx + 1);
      out.jumped = true;
    }
    return out;
  }

  function next(rc) {
    var session = rc.session;
    if (session.index < rc.sx.queue.length) session.index++;
    rc.sx.revealed = false;
    session.done = session.index >= rc.sx.queue.length;
    if (nextGroupDue(rc)) rc.sx.fn.enterGroup(rc.sx.groupIdx + 1);
    else rc.sx.fn.saveDraft(false);
    return session.current();
  }

  // Scores and stores an exam; returns an { error } result or null.
  function finishExam(rc, sum) {
    var scored;
    try {
      scored = rc.sx.fn.examSummary(sum);
    } catch {
      return { error: 'engine' };
    }
    if (!rc.session.training) {
      var stored = rc.sx.fn.storeExam(scored, rc.sx.isTimedExam);
      if (stored && stored.error) return stored;
    }
    rc.session.release();
    return null;
  }

  function finish(rc) {
    var sx = rc.sx;
    if (sx.summary) return sx.summary;
    var sum = rc.view.baseSummary();
    if (sx.mode === 'exam') {
      var failed = finishExam(rc, sum);
      if (failed) return failed;
    }
    if (sx.mode === 'placement') {
      rc.ctx.store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings.placementDone = true;
      });
    }
    sx.summary = sum;
    return sx.summary;
  }

  function attachFlow(rc) {
    var session = rc.session;
    var sx = rc.sx;
    session.saveDraft = function () { sx.fn.saveDraft(true); };
    session.tickDraft = function () {
      if (!sx.isTimedExam || sx.draftClosed) return;
      var since = rc.ctx.now() - sx.lastWriteAt;
      if ((sx.draftDirty && since >= util.K.WRITE_THROTTLE_MS) || since >= util.K.TICK_INTERVAL_MS) sx.fn.saveDraft(true);
    };
    session.next = function () { return next(rc); };
    session.expire = function () { return expire(rc); };
    session.release = function () { if (sx.lockHolder) rc.ctx.fn.releaseLock(sx.lockHolder); };
    session.abandon = function () {
      if (!sx.isTimedExam || sx.draftClosed) return;
      rc.ctx.store.update(function (doc) { sx.fn.closeDraft(doc, 'abandoned'); });
    };
    session.finish = function () { return finish(rc); };
  }

  function restoreResume(rc) {
    var sx = rc.sx;
    var session = rc.session;
    sx.resume.answers.slice().sort(function (x, y) { return x.i - y.i; }).forEach(function (ans) {
      var rid = sx.queue[ans.i];
      sx.answeredAt[ans.i] = true;
      sx.graded[rid] = ans.c;
      sx.review.push({ id: rid, correct: ans.c, given: ans.g === undefined ? '' : ans.g, expected: util.expectedFor(rc.ctx.byId[rid]) });
      sx.draftAnswers[ans.i] = ans.g === undefined ? { i: ans.i, c: ans.c } : { i: ans.i, c: ans.c, g: ans.g };
    });
    if (sx.groups) sx.fn.skipRange(0, sx.groups[sx.groupIdx].start);
    session.index = sx.resume.index;
    while (session.index < sx.queue.length && sx.answeredAt[session.index]) session.index++;
    session.done = session.index >= sx.queue.length;
    if (nextGroupDue(rc)) sx.fn.enterGroup(sx.groupIdx + 1);
    session.expire();
  }

  // sx: shared session state for session/grade.js and session/exam-run.js; the reassigned fields live only here.
  function makeSx(ctx, mode, plan, session) {
    var groups = plan.groups || null;
    var resume = plan.resume;
    if (groups) session.group = { index: resume ? resume.group : 0, count: groups.length };
    return {
      mode: mode, plan: plan, session: session, resume: resume, groups: groups,
      lockHolder: mode === 'exam' && plan.deadline !== undefined ? ctx.fn.acquireWakeLock() : null, queue: plan.ids.slice(),
      startedAt: resume ? ctx.now() - resume.elapsedMs : ctx.now(), answeredAt: {}, graded: {}, review: [], requeued: {},
      entityWrong: {}, // scoped entities that already dropped once in this session
      skipped: [], // items skipped due to timer expiry
      introduced: {}, // items that showed their intro (introNew)
      introSeen: Object.create(null), // entities whose intro card was dismissed in this session
      isTimedExam: mode === 'exam' && !plan.training && plan.deadline !== undefined, draftAnswers: {}, fn: {},
      groupIdx: groups ? session.group.index : 0, revealed: false, summary: null, lastAnswer: null,
      draftClosed: false, draftDirty: false, lastWriteAt: -Infinity
    };
  }

  function wireSx(rc) {
    var fn = rc.sx.fn;
    var view = rc.view;
    fn.rightsOf = view.rightsOf;
    fn.remainingList = function () { return remainingList(rc); };
    fn.result = view.result;
    fn.recordGrade = view.recordGrade;
    fn.isNewFor = view.isNewFor;
    fn.prevOf = view.prevOf;
    fn.requeueKey = view.requeueKey;
    var gradeApi = gradeMod.create(rc.ctx, rc.sx);
    ['gradeInput', 'nextRecord', 'applyVerdict', 'canOverride', 'overrideLast'].forEach(function (k) { fn[k] = gradeApi[k]; });
    var runApi = examRunMod.create(rc.ctx, rc.sx);
    ['buildDraft', 'saveDraft', 'closeDraft', 'enterGroup', 'skipRange', 'examSummary', 'storeExam'].forEach(function (k) { fn[k] = runApi[k]; });
  }

  function createSession(ctx, mode, plan) {
    var session = initialSession(ctx, mode, plan);
    var sx = makeSx(ctx, mode, plan, session);
    var rc = { ctx: ctx, sx: sx, session: session, view: runViewMod.create(ctx, sx) };
    wireSx(rc);
    attachIntros(rc);
    attachAnswers(rc);
    attachFlow(rc);
    if (sx.resume) restoreResume(rc);
    sx.fn.saveDraft(true);
    return session;
  }

  function create(ctx) {
    return { createSession: function (mode, plan) { return createSession(ctx, mode, plan); } };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionRun = api;
})(typeof self !== 'undefined' ? self : this);
