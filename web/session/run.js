/* session/run.js — createSession: one study session over a plan (queue, answers, intros, overrides, finish).
 * Exports DojoSessionRun: create(ctx) -> { createSession(mode, plan) }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var gradeMod = root.DojoSessionGrade || (typeof require === 'function' ? require('./grade.js') : null);
  var runViewMod = root.DojoSessionRunView || (typeof require === 'function' ? require('./run-view.js') : null);
  var examRunMod = root.DojoSessionExamRun || (typeof require === 'function' ? require('./exam-run.js') : null);

  function create(ctx) {
  var now = ctx.now;
  var course = ctx.course;
  var byId = ctx.byId;
  var store = ctx.store;
  var introById = ctx.introById;

  function initialSession(mode, plan) {
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

  function createSession(mode, plan) {
    var resume = plan.resume;
    var session = initialSession(mode, plan);
    var groups = plan.groups || null;
    if (groups) session.group = { index: resume ? resume.group : 0, count: groups.length };
    var lockHolder = mode === 'exam' && plan.deadline !== undefined ? ctx.fn.acquireWakeLock() : null;

    var queue = plan.ids.slice();
    var startedAt = resume ? now() - resume.elapsedMs : now();
    var answeredAt = {};
    var graded = {};
    var review = [];
    var requeued = {};
    var entityWrong = {}; // scoped entities that already dropped once in this session
    var skipped = []; // items skipped due to timer expiry
    var introduced = {}; // items that showed their intro (introNew)
    var introSeen = Object.create(null); // entities whose intro card was dismissed in this session
    var isTimedExam = mode === 'exam' && !plan.training && plan.deadline !== undefined;
    var draftAnswers = {};
    // sx: shared session state for session/grade.js and session/exam-run.js; the reassigned fields live only here.
    var sx = {
      mode: mode, plan: plan, session: session, resume: resume, groups: groups, lockHolder: lockHolder, queue: queue,
      startedAt: startedAt, answeredAt: answeredAt, graded: graded, review: review, requeued: requeued,
      entityWrong: entityWrong, skipped: skipped, introduced: introduced, introSeen: introSeen,
      isTimedExam: isTimedExam, draftAnswers: draftAnswers, fn: {},
      groupIdx: groups ? session.group.index : 0, revealed: false, summary: null, lastAnswer: null,
      draftClosed: false, draftDirty: false, lastWriteAt: -Infinity
    };
    var view = runViewMod.create(ctx, sx);
    var viewFor = view.viewFor, isNewFor = view.isNewFor;
    var prevOf = view.prevOf;
    var requeueKey = view.requeueKey;
    var result = view.result;
    var baseSummary = view.baseSummary;
    sx.fn.rightsOf = view.rightsOf;
    sx.fn.remainingList = remainingList;
    sx.fn.result = result;
    sx.fn.recordGrade = view.recordGrade;
    var gradeApi = gradeMod.create(ctx, sx);
    sx.fn.gradeInput = gradeApi.gradeInput;
    sx.fn.nextRecord = gradeApi.nextRecord;
    sx.fn.applyVerdict = gradeApi.applyVerdict;
    var runApi = examRunMod.create(ctx, sx);
    sx.fn.buildDraft = runApi.buildDraft;
    sx.fn.saveDraft = runApi.saveDraft;
    sx.fn.closeDraft = runApi.closeDraft;
    sx.fn.enterGroup = runApi.enterGroup;
    sx.fn.skipRange = runApi.skipRange;
    sx.fn.examSummary = runApi.examSummary;
    sx.fn.storeExam = runApi.storeExam;

    function remainingList() {
      var nowMs = now();
      if (!groups) return [Math.max(0, session.deadline - nowMs)];
      return groups.map(function (g, gi) {
        if (gi < sx.groupIdx) return 0;
        if (gi === sx.groupIdx) return Math.max(0, session.deadline - nowMs);
        return g.minutes * 60000;
      });
    }

    session.saveDraft = function () { sx.fn.saveDraft(true); };

    session.tickDraft = function () {
      if (!isTimedExam || sx.draftClosed) return;
      var since = now() - sx.lastWriteAt;
      if ((sx.draftDirty && since >= util.K.WRITE_THROTTLE_MS) || since >= util.K.TICK_INTERVAL_MS) sx.fn.saveDraft(true);
    };

    function currentId() {
      return session.index < queue.length ? queue[session.index] : null;
    }

    function isRelearnCopy() {
      return session.index >= session.total;
    }

    session.shouldShowIntro = function (item) {
      if (!course.introNew || !item.explanation) return false;
      if (mode === 'placement' || (mode === 'exam' && !session.training)) return false;
      if (!isNewFor(item) || introduced[item.id]) return false;
      if (ctx.fn.stimulusOf(item) !== null || ctx.fn.hasAudioLines(item)) return false;
      introduced[item.id] = true;
      return true;
    };

    // Intro card for the item's entity, or null. Pure: nothing is written until markIntroSeen.
    session.introFor = function (item) {
      if (!course.introNew || mode !== 'daily' || !item) return null;
      var e = ctx.itemEntities[item.id];
      if (e === undefined) e = item.entity || item.id;
      var intro = introById[e];
      if (!intro || introSeen[e]) return null;
      var seen = ctx.store.doc.intros;
      if (seen && typeof seen === 'object' && Object.prototype.hasOwnProperty.call(seen, e) && typeof seen[e] === 'number') return null;
      var recs = ctx.fn.records();
      var members = ctx.entityMembers[e] || [item.id];
      for (var i = 0; i < members.length; i++) if (recs[members[i]] !== undefined) return null;
      return intro;
    };

    // Intro of the item's entity for the wrong-answer feedback, or null. Pure: ignores seen state and mode.
    session.entityIntro = function (item) {
      if (!item) return null;
      var e = ctx.itemEntities[item.id];
      if (e === undefined) e = item.entity || item.id;
      return introById[e] || null;
    };

    session.markIntroSeen = function (entity) {
      var e = typeof entity === 'string' ? entity : entity && (ctx.itemEntities[entity.id] || entity.entity || entity.id);
      if (typeof e !== 'string' || !introById[e]) return;
      introSeen[e] = true;
      var t = now();
      store.update(function (doc) {
        if (!doc.intros || typeof doc.intros !== 'object' || Array.isArray(doc.intros)) doc.intros = {};
        var has = Object.prototype.hasOwnProperty.call(doc.intros, e);
        if (has && typeof doc.intros[e] === 'number') return;
        Object.defineProperty(doc.intros, e, { value: t, enumerable: true, writable: true, configurable: true });
      });
    };

    session.retryCount = function () {
      return Math.max(0, queue.length - Math.max(session.index, session.total));
    };

    session.current = function () {
      var id = currentId();
      if (id === null) return null;
      var item = byId[id];
      return { item: item, position: session.index + 1, total: queue.length, view: viewFor(item), stimulus: ctx.fn.stimulusOf(item) };
    };

    session.reveal = function () {
      sx.revealed = true;
    };

    session.answer = function (input) {
      var id = currentId();
      if (id === null) return { error: 'finished' };
      if (answeredAt[session.index]) return { error: 'already_answered' };
      var item = byId[id];
      var relearn = isRelearnCopy();
      var verdict;
      var rec;
      var isNewRecord = isNewFor(item);
      var prev = prevOf(item);
      try {
        if (mode === 'placement') {
          var placementModeVar = session.placementMode || ctx.fn.placementMode();
          if (placementModeVar === 'check') {
            // Check mode: grade the answer like a normal session
            verdict = sx.fn.gradeInput(item, input);
            if (!verdict) return { error: 'bad_input' };
            // For gap retry: in placement check mode, treat retry as wrong (no retry allowed)
            if (verdict.verdict === 'retry') {
              verdict = { correct: false, given: verdict.given };
            }
            var known = verdict.correct;
            rec = sx.fn.nextRecord(item, known, relearn);
            verdict = Object.assign({}, verdict, { known: known });
          } else {
            // Self mode: original behavior
            var rating = input && input.rating;
            if (rating !== 'known' && rating !== 'again') return { error: 'bad_input' };
            var known = rating === 'known';
            rec = sx.fn.nextRecord(item, known, relearn);
            verdict = { correct: known, given: known ? 'known' : 'unknown', known: known };
          }
        } else {
          verdict = sx.fn.gradeInput(item, input);
          if (!verdict && ctx.fn.qtimerPending()) verdict = { correct: false, given: '' };
          if (!verdict) return { error: 'bad_input' };
          // For gap retry: don't record, don't advance, don't mark as answered
          if (verdict.verdict === 'retry' && ((mode === 'exam' && !session.training) || ctx.fn.qtimerPending())) {
            verdict = { correct: false, given: verdict.given };
          } else if (verdict.verdict === 'retry') {
            return { verdict: 'retry', retry: true, expected: util.expectedFor(item), explanation: item.explanation || null };
          }
          rec = sx.fn.nextRecord(item, verdict.correct, relearn);
        }
      } catch (e) {
        return { error: 'engine' };
      }
      return sx.fn.applyVerdict(item, verdict, { rec: rec, prev: prev, relearn: relearn, isNewRecord: isNewRecord });
    };

    session.dontKnow = function () {
      var id = currentId();
      if (id === null) return { error: 'finished' };
      if (answeredAt[session.index]) return { error: 'already_answered' };
      if (!session.canDontKnow()) return { error: 'no_dont_know' };
      var item = byId[id];
      var relearn = isRelearnCopy();
      var rec;
      var prev = prevOf(item);
      var isNewRecord = isNewFor(item);
      var verdict = { correct: false, given: '-', dontKnow: true };

      try {
        rec = sx.fn.nextRecord(item, false, relearn);
      } catch (e) {
        return { error: 'engine' };
      }
      return sx.fn.applyVerdict(item, verdict, { rec: rec, prev: prev, relearn: relearn, isNewRecord: isNewRecord });
    };

    session.canDontKnow = function () {
      if (course.dontKnow !== true) return false;
      var placementModeVar = mode === 'placement' ? (session.placementMode || ctx.fn.placementMode()) : null;
      if (mode === 'placement' && placementModeVar === 'self') return false;
      var item = byId[currentId()];
      if (!item) return false;
      if (util.K.SELF_RATED.indexOf(item.type) >= 0) return false;
      if (mode === 'exam' && !session.training) return false;
      return true;
    };

    session.canOverride = function () {
      var la = sx.lastAnswer;
      if (!la || la.index !== session.index || la.verdict.correct) return false;
      if (mode === 'exam' || mode === 'placement' || course.allowOverride === false) return false;
      if (la.verdict.dontKnow) return false;
      if (util.K.TYPED.indexOf(la.item.type) < 0) return false;
      var nearMiss = la.item.type === 'gap' ? la.item.answers : la.item.type === 'numeric' ? [String(la.item.answer)] : null;
      if (!nearMiss || typeof la.verdict.given !== 'string') return true;
      return util.isTypo(la.verdict.given, nearMiss);
    };

    session.overrideLast = function () {
      if (!session.canOverride()) return { error: 'no_override' };
      var la = sx.lastAnswer;
      var item = la.item;
      var rec;
      try {
        var se = ctx.scopedEntityOf[item.id];
        store.update(function (doc) {
          doc.items = doc.items || {};
          if (se !== undefined) {
            Object.keys(la.prev).forEach(function (id) {
              if (la.prev[id] === undefined) delete doc.items[id]; else doc.items[id] = la.prev[id];
            });
          } else if (la.prev === undefined) delete doc.items[item.id]; else doc.items[item.id] = la.prev;
        });
        if (se !== undefined && la.setWrong) delete entityWrong[se];
        rec = sx.fn.nextRecord(item, true, la.relearn);
      } catch (e) {
        return { error: 'engine' };
      }
      if (rec) store.update(function (doc) { Object.keys(rec).forEach(function (id) { doc.items[id] = rec[id]; }); });
      if (!la.relearn) {
        graded[item.id] = true;
        var row = review[review.length - 1];
        if (row && row.id === item.id) row.correct = true;
        if (la.pushed && queue[queue.length - 1] === item.id) {
          queue.pop();
          delete requeued[requeueKey(item)];
        }
      }
      if (la.timer) ctx.fn.qtimerRestore(la.timer);
      var verdict = Object.assign({}, la.verdict, { correct: true });
      sx.lastAnswer = null;
      return result(item, verdict);
    };

    session.next = function () {
      if (session.index < queue.length) session.index++;
      sx.revealed = false;
      session.done = session.index >= queue.length;
      if (groups && !session.done && sx.groupIdx + 1 < groups.length && session.index >= groups[sx.groupIdx + 1].start) {
        sx.fn.enterGroup(sx.groupIdx + 1);
      } else {
        sx.fn.saveDraft(false);
      }
      return session.current();
    };

    session.expire = function () {
      var out = { jumped: false, finished: false };
      if (session.deadline === undefined || session.done || now() < session.deadline) return out;
      if (!groups) {
        sx.fn.skipRange(session.index, queue.length);
        session.index = queue.length;
        session.done = true;
        out.finished = true;
        return out;
      }
      while (now() >= session.deadline) {
        if (sx.groupIdx + 1 >= groups.length) {
          sx.fn.skipRange(session.index, queue.length);
          session.index = queue.length;
          session.done = true;
          out.finished = true;
          return out;
        }
        sx.fn.skipRange(session.index, Math.min(groups[sx.groupIdx + 1].start, queue.length));
        session.index = groups[sx.groupIdx + 1].start;
        sx.revealed = false;
        sx.fn.enterGroup(sx.groupIdx + 1);
        out.jumped = true;
      }
      return out;
    };

    session.release = function () {
      if (lockHolder) ctx.fn.releaseLock(lockHolder);
    };

    session.abandon = function () {
      if (!isTimedExam || sx.draftClosed) return;
      store.update(function (doc) { sx.fn.closeDraft(doc, 'abandoned'); });
    };

    session.finish = function () {
      if (sx.summary) return sx.summary;
      var sum = baseSummary();
      if (mode === 'exam') {
        var scored;
        try {
          scored = sx.fn.examSummary(sum);
        } catch (e) {
          return { error: 'engine' };
        }
        if (!session.training) {
          var result = sx.fn.storeExam(scored, isTimedExam);
          if (result && result.error) return result;
        }
        session.release();
      }
      if (mode === 'placement') {
        store.update(function (doc) {
          doc.settings = doc.settings || {};
          doc.settings.placementDone = true;
        });
      }
      sx.summary = sum;
      return sx.summary;
    };

    if (resume) {
      resume.answers.slice().sort(function (x, y) { return x.i - y.i; }).forEach(function (ans) {
        var rid = queue[ans.i];
        answeredAt[ans.i] = true;
        graded[rid] = ans.c;
        review.push({ id: rid, correct: ans.c, given: ans.g === undefined ? '' : ans.g, expected: util.expectedFor(byId[rid]) });
        draftAnswers[ans.i] = ans.g === undefined ? { i: ans.i, c: ans.c } : { i: ans.i, c: ans.c, g: ans.g };
      });
      if (groups) sx.fn.skipRange(0, groups[sx.groupIdx].start);
      session.index = resume.index;
      while (session.index < queue.length && answeredAt[session.index]) session.index++;
      session.done = session.index >= queue.length;
      if (groups && !session.done && sx.groupIdx + 1 < groups.length && session.index >= groups[sx.groupIdx + 1].start) {
        sx.fn.enterGroup(sx.groupIdx + 1);
      }
      session.expire();
    }
    sx.fn.saveDraft(true);

    return session;
  }

  return { createSession: createSession };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionRun = api;
})(typeof self !== 'undefined' ? self : this);

