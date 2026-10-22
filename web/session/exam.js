/* session/exam.js — exam catalogue, wake lock, plan building, draft validation and draft slots of the study session engine.
 * Exports DojoSessionExam: create(ctx) -> api.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var SELF_RATED = util.K.SELF_RATED;
  var DRAFT_EXPIRY_MS = util.K.DRAFT_EXPIRY_MS;
  var MAX_ANSWER_G = util.K.MAX_ANSWER_G;
  var MAX_IDS_COUNT = util.K.MAX_IDS_COUNT;
  var MAX_CLOSED_SIDS = util.K.MAX_CLOSED_SIDS;

  function create(ctx) {
    var dojo = ctx.dojo;
    var store = ctx.store;
    var course = ctx.course;
    var byId = ctx.byId;
    var now = ctx.now;

    function examList() {
      var list = [];
      if (course.exam) list.push(Object.assign({ id: 'default' }, course.exam));
      (course.exams || []).forEach(function (e) { list.push(e); });
      return list;
    }

    function findExam(examId) {
      var list = examList();
      if (examId === undefined || examId === null) return list[0] || null;
      for (var i = 0; i < list.length; i++) if (list[i].id === examId) return list[i];
      return null;
    }

    function timingGroups(exam, ranges) {
      if (!exam.timing || !exam.timing.length) return null;
      var byTitle = {};
      (ranges || []).forEach(function (r) { byTitle[r.title] = r; });
      var groups = [];
      exam.timing.forEach(function (g) {
        var lo = Infinity;
        var hi = -1;
        g.sections.forEach(function (title) {
          var r = byTitle[title];
          if (!r || !r.count) return;
          lo = Math.min(lo, r.start);
          hi = Math.max(hi, r.start + r.count);
        });
        if (hi > lo) groups.push({ start: lo, end: hi, minutes: g.minutes });
      });
      groups.sort(function (a, b) { return a.start - b.start; });
      return groups.length ? groups : null;
    }

    function describeExam(e) {
      var out = { id: e.id, sections: (e.sections || []).map(function (s) { return s.title; }) };
      if (e.title) out.title = e.title;
      if (e.note) out.note = e.note;
      if (e.minutes) out.minutes = e.minutes;
      if (e.timing && e.timing.length) {
        out.groups = e.timing.map(function (g) { return { sections: g.sections.slice(), minutes: g.minutes }; });
        out.minutes = e.timing.reduce(function (sum, g) { return sum + g.minutes; }, 0);
      }
      out.timed = !!out.minutes;
      return out;
    }

    function exams() {
      return examList().map(describeExam);
    }

    function examQueue(exam) {
      var candidates = ctx.fn.activeItems().filter(function (it) { return SELF_RATED.indexOf(it.type) < 0; })
        .map(function (it) { return { id: it.id, unit: it.unit, tags: it.tags || [], type: it.type, stimulus: it.stimulus || null, examOnly: ctx.fn.unitIsExamOnly(it.unit) }; });
      return dojo.call('sample', { candidates: candidates, sections: exam.sections || [], seed: String(now()) });
    }

    function acquireWakeLock() {
      var holder = { lock: null, released: false };
      try {
        if (!ctx.nav || !ctx.nav.wakeLock || typeof ctx.nav.wakeLock.request !== 'function') return holder;
        var p = ctx.nav.wakeLock.request('screen');
        if (p && typeof p.then === 'function') {
          p.then(function (lock) {
            holder.lock = lock;
            if (holder.released) releaseLock(holder);
          }, function () {});
        }
      } catch (e) { /* wake lock is best effort */ }
      return holder;
    }

    function releaseLock(holder) {
      holder.released = true;
      var lock = holder.lock;
      holder.lock = null;
      try {
        if (lock && typeof lock.release === 'function') {
          var r = lock.release();
          if (r && typeof r.catch === 'function') r.catch(function () {});
        }
      } catch (e) { /* best effort */ }
    }

    function buildPlan(mode, opts) {
      if (mode === 'daily') return { ids: ctx.fn.dailyQueue(opts.groupId) };
      if (mode === 'practice') return { ids: ctx.fn.practiceQueue(opts) };
      if (mode === 'weak') return { ids: ctx.fn.weakQueue(opts) };
      if (mode === 'placement') {
        var pOpts = Object.assign({}, opts, { seed: opts.seed !== undefined ? String(opts.seed) : String(now()) });
        return { ids: ctx.fn.preferShared(ctx.fn.placementQueue(pOpts)), placement: true, seed: pOpts.seed };
      }
      var exam = opts.exam;
      var resume = opts.resume;
      var plan;
      if (resume) {
        plan = { ids: resume.ids.slice(), exam: exam, sections: resume.sections, training: false, resume: resume };
        if (opts.examId !== undefined || exam.id !== 'default') plan.examId = exam.id;
        var rGroups = timingGroups(exam, plan.sections);
        if (rGroups) plan.groups = rGroups;
        plan.deadline = now() + resume.remainingMs[rGroups ? resume.group : 0];
        return plan;
      }
      var sampled = examQueue(exam);
      plan = { ids: sampled.ids, exam: exam, sections: sampled.sections || [], training: !!opts.training };
      if (opts.examId !== undefined || exam.id !== 'default') plan.examId = exam.id;
      if (sampled.short.length) plan.warnings = sampled.short;
      if (plan.training) return plan;
      var groups = timingGroups(exam, plan.sections);
      if (groups) {
        plan.groups = groups;
        plan.deadline = now() + groups[0].minutes * 60000;
      } else if (exam.minutes) {
        plan.deadline = now() + exam.minutes * 60000;
      }
      return plan;
    }

    function isInt(n, lo, hi) {
      return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi;
    }

    function validDraftHead(draft) {
      if (!draft || typeof draft !== 'object' || draft.closed !== undefined) return false;
      return typeof draft.sid === 'string' && !!draft.sid;
    }

    function validDraftExam(draft, exam) {
      return !!exam && !!exam.sections && draft.examId === exam.id;
    }

    function validDraftIds(draft) {
      if (!Array.isArray(draft.ids) || !draft.ids.length || draft.ids.length > MAX_IDS_COUNT) return false;
      for (var i = 0; i < draft.ids.length; i++) {
        if (typeof draft.ids[i] !== 'string' || !byId[draft.ids[i]]) return false;
      }
      return true;
    }

    function validDraftSections(draft, exam) {
      if (!Array.isArray(draft.sections) || draft.sections.length !== exam.sections.length) return false;
      for (var j = 0; j < draft.sections.length; j++) {
        var sec = draft.sections[j];
        if (!sec || typeof sec.title !== 'string' || !isInt(sec.start, 0, draft.ids.length) || !isInt(sec.count, 0, draft.ids.length)) return false;
      }
      return true;
    }

    function validDraftRemaining(draft, exam, groups, n) {
      if (!Array.isArray(draft.remainingMs) || draft.remainingMs.length !== n) return false;
      var maxMs = exam.minutes ? exam.minutes * 60000 : 0;
      for (var k = 0; k < n; k++) {
        var limitMs = groups ? groups[k].minutes * 60000 : maxMs;
        if (typeof draft.remainingMs[k] !== 'number' || !isFinite(draft.remainingMs[k]) || draft.remainingMs[k] < 0) return false;
        if (draft.remainingMs[k] > limitMs) draft.remainingMs[k] = limitMs;
      }
      return true;
    }

    function validDraftPosition(draft, n) {
      if (!isInt(draft.group, 0, n - 1)) return false;
      if (!isInt(draft.index, 0, draft.ids.length)) return false;
      if (typeof draft.elapsedMs !== 'number' || !isFinite(draft.elapsedMs) || draft.elapsedMs < 0) return false;
      return typeof draft.startedAt === 'number' && typeof draft.updatedAt === 'number';
    }

    function validDraftAnswers(draft) {
      if (!Array.isArray(draft.answers)) return false;
      var seen = {};
      for (var a = 0; a < draft.answers.length; a++) {
        var ans = draft.answers[a];
        if (!ans || typeof ans !== 'object' || !isInt(ans.i, 0, draft.ids.length - 1) || seen[ans.i]) return false;
        if (typeof ans.c !== 'boolean') return false;
        if (ans.g !== undefined && (typeof ans.g !== 'string' || ans.g.length > MAX_ANSWER_G)) return false;
        seen[ans.i] = true;
      }
      return true;
    }

    function validateDraft(draft, exam) {
      if (!validDraftHead(draft)) return false;
      if (!validDraftExam(draft, exam)) return false;
      if (!validDraftIds(draft)) return false;
      if (!validDraftSections(draft, exam)) return false;
      var groups = timingGroups(exam, draft.sections);
      if (!groups && !exam.minutes) return false;
      var n = groups ? groups.length : 1;
      if (!validDraftRemaining(draft, exam, groups, n)) return false;
      if (!validDraftPosition(draft, n)) return false;
      return validDraftAnswers(draft);
    }

    function closeSlot(doc, sid, reason, t) {
      var prev = doc.examDraft && typeof doc.examDraft === 'object' ? doc.examDraft : null;
      var list = [];
      if (prev && Array.isArray(prev.closedSids)) {
        list = prev.closedSids.filter(function (c) { return c && typeof c.sid === 'string' && typeof c.updatedAt === 'number' && c.sid !== sid; });
      }
      list.push({ sid: sid, updatedAt: t });
      list.sort(function (x, y) { return x.updatedAt - y.updatedAt || (x.sid < y.sid ? -1 : x.sid > y.sid ? 1 : 0); });
      if (list.length > MAX_CLOSED_SIDS) list = list.slice(list.length - MAX_CLOSED_SIDS);
      if (prev && !prev.closed && typeof prev.sid === 'string' && prev.sid !== sid) {
        prev.closedSids = list;
        prev.updatedAt = Math.max(prev.updatedAt, t + 1);
        return;
      }
      doc.examDraft = { sid: sid, updatedAt: t, closed: reason, closedSids: list };
    }

    function examDraft() {
      var doc = store.doc;
      var slot = doc && doc.examDraft;
      if (!slot || typeof slot !== 'object' || slot.closed !== undefined || typeof slot.sid !== 'string') return null;
      var closedSids = Array.isArray(slot.closedSids) ? slot.closedSids : [];
      for (var i = 0; i < closedSids.length; i++) {
        if (closedSids[i] && closedSids[i].sid === slot.sid) return null;
      }
      var exam = typeof slot.examId === 'string' ? findExam(slot.examId) : null;
      if (exam && validateDraft(slot, exam) && now() - slot.updatedAt <= DRAFT_EXPIRY_MS) return slot;
      if (typeof slot.updatedAt === 'number') {
        var sid = slot.sid;
        store.update(function (d) {
          if (d.examDraft && d.examDraft.sid === sid && !d.examDraft.closed) closeSlot(d, sid, 'expired', now());
        });
      }
      return null;
    }

    function discardDraft(sid) {
      store.update(function (d) { closeSlot(d, sid, 'abandoned', now()); });
    }

    return {
      examList: examList,
      findExam: findExam,
      timingGroups: timingGroups,
      describeExam: describeExam,
      exams: exams,
      examQueue: examQueue,
      acquireWakeLock: acquireWakeLock,
      releaseLock: releaseLock,
      buildPlan: buildPlan,
      isInt: isInt,
      validateDraft: validateDraft,
      closeSlot: closeSlot,
      examDraft: examDraft,
      discardDraft: discardDraft
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionExam = api;
})(typeof self !== 'undefined' ? self : this);
