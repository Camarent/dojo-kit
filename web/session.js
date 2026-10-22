/*
 * session.js — study session engine (no DOM). Scheduling and grading go through the wasm API.
 * DojoSession.createEngine({ dojo, store, content, now, today, random }) -> engine
 *   engine.counts()          -> { total, active, due, newToday, byUnit:{unit:{total,due,fresh}} }
 *   engine.start(mode, opts) -> session | { error }   mode: daily | practice | weak | exam
 * Session: { id, mode, total, index, done, deadline?, warnings?, current(), reveal(), answer(input), next(), finish() }
 *   answer: choice { index } (original option index), gap { text }, multi { ids }, match { mapping }, order { sequence }, cloze { inputs }, numeric { text } (ids = view position ids), card { rating: 'known' | 'again' }
 *   session.entityIntro(item) -> intro | null (entity intro for wrong-answer feedback; no seen/record checks)
 *   session.introFor(item) -> intro | null (daily only, course.introNew, content.intros by entity, no record in the entity, not in doc.intros); session.markIntroSeen(entity) writes doc.intros[entity] = now once. Neither touches records or the new allowance
 *   DojoSession.tagInfo(course, tag) -> { label, internal } from course.tagLabels (string or {label?, kind?})
 *   engine.exams()           -> [{ id, title?, note?, minutes?, sections:[title], timed, groups }]  (legacy course.exam = id 'default')
 *   engine.examDraft()        -> validated open draft or null (an invalid/older-than-7-days slot is tombstoned 'expired')
 *   engine.discardDraft(sid)  -> tombstone 'abandoned'
 *   start('exam', { examId?, training?, resume? }): training = untimed, per-answer feedback, nothing written to doc.exams; resume restores from draft.
 * Timed exam sessions write doc.examDraft (throttled 1 s; session.tickDraft() flushes pending/60 s, session.saveDraft() forces, session.abandon() tombstones); finish() tombstones 'finished' atomically with doc.exams.
 * Exam session extras: examId, training, group? ({ index, count }), expire() -> { jumped, finished } (timer groups), release() (wake lock).
 *   With exam.timing the deadline is per group; session.deadline is the current group's deadline.
 * Errors are returned as { error: code }: empty, no_exam, unknown_mode, engine, bad_input, already_answered, finished, finished_elsewhere.
 * Progress is changed only through store.update(fn); the engine never writes storage itself.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./session/util.js') : null);

  var queuesMod = root.DojoSessionQueues || (typeof require === 'function' ? require('./session/queues.js') : null);

  var countsMod = root.DojoSessionCounts || (typeof require === 'function' ? require('./session/counts.js') : null);

  var examMod = root.DojoSessionExam || (typeof require === 'function' ? require('./session/exam.js') : null);

  var gradeMod = root.DojoSessionGrade || (typeof require === 'function' ? require('./session/grade.js') : null);

  var examRunMod = root.DojoSessionExamRun || (typeof require === 'function' ? require('./session/exam-run.js') : null);

  var overridesMod = root.DojoSessionOverrides || (typeof require === 'function' ? require('./session/overrides.js') : null);

  var mulberry32 = util.mulberry32;
  var shuffledIndexes = util.shuffledIndexes;
  var isRetired = util.isRetired;
  var ensureObject = util.ensureObject;
  var expectedFor = util.expectedFor;
  var orderPerm = util.orderPerm;
  var optionText = util.optionText;

  var DEFAULT_NEW_PER_DAY = util.K.DEFAULT_NEW_PER_DAY;
  var DEFAULT_PRACTICE_LIMIT = util.K.DEFAULT_PRACTICE_LIMIT;
  var DEFAULT_WEAK_LIMIT = util.K.DEFAULT_WEAK_LIMIT;
  var DEFAULT_LEARNED_STAGE = util.K.DEFAULT_LEARNED_STAGE;
  var TYPED = util.K.TYPED;
  var SELF_RATED = util.K.SELF_RATED;
  var WRITE_THROTTLE_MS = util.K.WRITE_THROTTLE_MS;
  var TICK_INTERVAL_MS = util.K.TICK_INTERVAL_MS;

  function createEngine(deps) {
    var dojo = deps.dojo;
    var store = deps.store;
    var content = deps.content;
    var now = deps.now;
    var today = deps.today;
    var random = deps.random;
    var nav = deps.navigator !== undefined ? deps.navigator : (typeof navigator !== 'undefined' ? navigator : null);
    var course = content.course || {};
    var items = content.items || [];
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    var introById = Object.create(null);
    (content.intros || []).forEach(function (i) { if (i && typeof i.id === 'string') introById[i.id] = i; });
    var stimById = {};
    (content.stimuli || []).forEach(function (st) { stimById[st.id] = st; });

    // ctx: engine context for extracted modules `create(ctx)`; read getters and ctx.store.doc at call time; other engine functions via ctx.fn.<name>.
    var ctx = {
      dojo: dojo, store: store, content: content, course: course, items: items, byId: byId,
      introById: introById, stimById: stimById, nav: nav, now: now, today: today, random: random,
      get groupList() { return groupList; }, get groupById() { return groupById; }, get unitGroup() { return unitGroup; },
      get itemEntities() { return itemEntities; }, get entityMembers() { return entityMembers; },
      get scopedMembers() { return scopedMembers; }, get scopedEntityOf() { return scopedEntityOf; },
      get scopedUnit() { return scopedUnit; }, get hasScope() { return hasScope; },
      fn: {
        placementPerUnit: placementPerUnit,
        placementMode: placementMode,
        stimulusOf: stimulusOf,
        hasAudioLines: hasAudioLines,
        normalizeOpts: normalizeOpts,
        learnedStage: learnedStage,
        activeItems: activeItems,
        records: records,
        start: start,
        newSessionId: newSessionId,
        createSession: createSession,
        moreNew: moreNew,
        stage: stage,
        record: record,
        placement: placement
      }
    };
    var overrides = overridesMod.create(ctx);
    ctx.fn.unitFieldKey = overrides.unitFieldKey;
    var unitFieldKey = overrides.unitFieldKey;
    ctx.fn.unitConfig = overrides.unitConfig;
    var unitConfig = overrides.unitConfig;
    ctx.fn.validateUnitOverrideField = overrides.validateUnitOverrideField;
    var validateUnitOverrideField = overrides.validateUnitOverrideField;
    ctx.fn.getUnitSettingsOverride = overrides.getUnitSettingsOverride;
    var getUnitSettingsOverride = overrides.getUnitSettingsOverride;
    ctx.fn.unitSettings = overrides.unitSettings;
    var unitSettings = overrides.unitSettings;
    ctx.fn.scaleLadder = overrides.scaleLadder;
    var scaleLadder = overrides.scaleLadder;
    ctx.fn.setUnitSetting = overrides.setUnitSetting;
    var setUnitSetting = overrides.setUnitSetting;
    ctx.fn.applyLadderScale = overrides.applyLadderScale;
    var applyLadderScale = overrides.applyLadderScale;
    ctx.fn.ladderForUnit = overrides.ladderForUnit;
    var ladderForUnit = overrides.ladderForUnit;
    ctx.fn.getUnitThreshold = overrides.getUnitThreshold;
    var getUnitThreshold = overrides.getUnitThreshold;
    ctx.fn.itemLadderFor = overrides.itemLadderFor;
    var itemLadderFor = overrides.itemLadderFor;
    ctx.fn.dropForItem = overrides.dropForItem;
    var dropForItem = overrides.dropForItem;
    ctx.fn.groupFieldKey = overrides.groupFieldKey;
    var groupFieldKey = overrides.groupFieldKey;
    ctx.fn.validateGroupOverrideField = overrides.validateGroupOverrideField;
    var validateGroupOverrideField = overrides.validateGroupOverrideField;
    ctx.fn.groupSettings = overrides.groupSettings;
    var groupSettings = overrides.groupSettings;
    ctx.fn.setGroupSetting = overrides.setGroupSetting;
    var setGroupSetting = overrides.setGroupSetting;
    var queues = queuesMod.create(ctx);
    ctx.fn.scopedArgs = queues.scopedArgs;
    ctx.fn.scopedRecords = queues.scopedRecords;
    var scopedRecords = queues.scopedRecords;
    ctx.fn.scopedMemberList = queues.scopedMemberList;
    var scopedMemberList = queues.scopedMemberList;
    ctx.fn.entityViewOf = queues.entityViewOf;
    var entityViewOf = queues.entityViewOf;
    ctx.fn.groupCap = queues.groupCap;
    ctx.fn.groupOrder = queues.groupOrder;
    ctx.fn.dayStat = queues.dayStat;
    ctx.fn.extraNewToday = queues.extraNewToday;
    ctx.fn.extraGroup = queues.extraGroup;
    ctx.fn.groupUsed = queues.groupUsed;
    ctx.fn.groupedItemsUsedToday = queues.groupedItemsUsedToday;
    ctx.fn.groupQueueArgs = queues.groupQueueArgs;
    ctx.fn.globalNewPerDay = queues.globalNewPerDay;
    var globalNewPerDay = queues.globalNewPerDay;
    ctx.fn.newAllowance = queues.newAllowance;
    ctx.fn.buildUnitNewCaps = queues.buildUnitNewCaps;
    ctx.fn.buildItemUnits = queues.buildItemUnits;
    ctx.fn.resolveNewOrder = queues.resolveNewOrder;
    ctx.fn.preferShared = queues.preferShared;
    var preferShared = queues.preferShared;
    ctx.fn.unitIsExamOnly = queues.unitIsExamOnly;
    var unitIsExamOnly = queues.unitIsExamOnly;
    ctx.fn.builtQueue = queues.builtQueue;
    ctx.fn.rawBuiltQueue = queues.rawBuiltQueue;
    ctx.fn.dailyQueue = queues.dailyQueue;
    var dailyQueue = queues.dailyQueue;
    ctx.fn.matches = queues.matches;
    ctx.fn.practiceQueue = queues.practiceQueue;
    var practiceQueue = queues.practiceQueue;
    ctx.fn.weakIds = queues.weakIds;
    ctx.fn.weakValidIds = queues.weakValidIds;
    ctx.fn.weakQueue = queues.weakQueue;
    var weakQueue = queues.weakQueue;
    ctx.fn.weakList = queues.weakList;
    var weakList = queues.weakList;
    ctx.fn.placementQueue = queues.placementQueue;
    var placementQueue = queues.placementQueue;
    var countsApi = countsMod.create(ctx);
    ctx.fn.counts = countsApi.counts;
    var counts = countsApi.counts;
    ctx.fn.summarize = countsApi.summarize;
    ctx.fn.groupCounts = countsApi.groupCounts;
    ctx.fn.entityStates = countsApi.entityStates;
    var entityStates = countsApi.entityStates;
    var examApi = examMod.create(ctx);
    ctx.fn.examList = examApi.examList;
    ctx.fn.findExam = examApi.findExam;
    ctx.fn.timingGroups = examApi.timingGroups;
    ctx.fn.describeExam = examApi.describeExam;
    ctx.fn.exams = examApi.exams;
    ctx.fn.examQueue = examApi.examQueue;
    ctx.fn.acquireWakeLock = examApi.acquireWakeLock;
    ctx.fn.releaseLock = examApi.releaseLock;
    ctx.fn.buildPlan = examApi.buildPlan;
    ctx.fn.isInt = examApi.isInt;
    ctx.fn.validateDraft = examApi.validateDraft;
    ctx.fn.closeSlot = examApi.closeSlot;
    ctx.fn.examDraft = examApi.examDraft;
    ctx.fn.discardDraft = examApi.discardDraft;
    var findExam = examApi.findExam;
    var validateDraft = examApi.validateDraft;
    var buildPlan = examApi.buildPlan;
    var exams = examApi.exams;
    var examDraft = examApi.examDraft;
    var discardDraft = examApi.discardDraft;

    function placementPerUnit() {
      return (course.placement && course.placement.perUnit) || 5;
    }

    function placementMode() {
      return (course.placement && course.placement.mode) || 'check';
    }

    function stimulusOf(item) {
      return item && item.stimulus && Object.prototype.hasOwnProperty.call(stimById, item.stimulus) ? stimById[item.stimulus] : null;
    }

    function hasAudioLines(item) {
      var sp = item && item.speak;
      if (typeof sp === 'string') return sp.trim() !== '';
      if (sp && Array.isArray(sp.lines)) {
        for (var i = 0; i < sp.lines.length; i++) {
          var l = sp.lines[i];
          if (l && typeof l.text === 'string' && l.text.trim() !== '') return true;
        }
      }
      return false;
    }

    function normalizeOpts(item) {
      return item.normalize || course.normalize || null;
    }

    function learnedStage() {
      var custom = course.learnedStage;
      if (Number.isInteger(custom) && custom >= 1) return custom;
      return DEFAULT_LEARNED_STAGE;
    }

    function activeItems() {
      return items.filter(function (it) { return !isRetired(it); });
    }

    function records() {
      return store.doc.items || {};
    }

    // ---- Groups (course.groups): entity-based daily caps decided in WASM; JS passes maps and records stats ----
    var groupList = Array.isArray(course.groups) ? course.groups : [];
    var groupById = {};
    var unitGroup = {};
    groupList.forEach(function (g) {
      groupById[g.id] = g;
      (g.units || []).forEach(function (u) { if (!(u in unitGroup)) unitGroup[u] = g.id; });
    });
    var itemEntities = Object.create(null);
    var entityMembers = Object.create(null);
    items.forEach(function (it) {
      var e = it.entity || it.id;
      itemEntities[it.id] = e;
      (entityMembers[e] = entityMembers[e] || []).push(it.id);
    });

    // ---- Topic-level SRS (srs.scope "entity"): the unit config is resolved in WASM; an entity is scoped when all of its
    // active members' units resolve "entity". Scoped entities are graded and queued as one (WASM applyEntity / buildQueue).
    var scopedMembers = Object.create(null); // entity -> active ids in file order
    var scopedEntityOf = Object.create(null); // item id -> scoped entity
    var scopedUnit = Object.create(null); // entity -> unit of its first active member
    (function () {
      var wants = (course.srs && course.srs.scope === 'entity') || (course.units || []).some(function (u) { return u.srs && u.srs.scope === 'entity'; });
      if (!wants) return;
      var unitScoped = {};
      (course.units || []).forEach(function (u) { unitScoped[u.id] = unitConfig(u.id).scope === 'entity'; });
      Object.keys(entityMembers).forEach(function (e) {
        var act = entityMembers[e].filter(function (id) { return !isRetired(byId[id]); });
        if (!act.length || !act.every(function (id) { return unitScoped[byId[id].unit] === true; })) return;
        scopedMembers[e] = act;
        scopedUnit[e] = byId[act[0]].unit;
        act.forEach(function (id) { scopedEntityOf[id] = e; });
      });
    })();
    var hasScope = Object.keys(scopedMembers).length > 0;

    function start(mode, opts) {
      if (['daily', 'practice', 'weak', 'exam', 'placement'].indexOf(mode) < 0) return { error: 'unknown_mode' };
      var o = Object.assign({}, opts || {});
      if (mode === 'exam') {
        var found = findExam(o.examId);
        if (!found || !found.sections) return { error: 'no_exam' };
        o.exam = found;
        if (o.resume) {
          if (o.training || !validateDraft(o.resume, o.exam)) return { error: 'bad_input' };
        }
      }
      if (mode === 'placement' && !course.placement) return { error: 'no_placement' };
      var plan;
      try {
        plan = buildPlan(mode, o);
      } catch (e) {
        return { error: 'engine' };
      }
      if (!plan.ids.length) return { error: 'empty' };
      return createSession(mode, plan);
    }

    function newSessionId(mode) {
      return mode + '-' + now() + '-' + Math.floor(random() * 4294967296).toString(36);
    }

    function createSession(mode, plan) {
      var resume = plan.resume;
      var session = {
        id: resume ? resume.sid : newSessionId(mode),
        mode: mode,
        total: plan.ids.length,
        initialTotal: plan.ids.length,
        index: 0,
        done: false,
        answered: resume ? resume.answers.length : 0
      };
      if (plan.deadline !== undefined) session.deadline = plan.deadline;
      if (mode === 'placement') {
        session.seed = plan.seed;
        session.placementMode = placementMode();
      }
      if (plan.warnings) session.warnings = plan.warnings;
      if (mode === 'exam') {
        if (plan.examId !== undefined) session.examId = plan.examId;
        session.training = !!plan.training;
      }
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
      var skipped = []; // Track items skipped due to timer expiry
      var introduced = {}; // Track which items have shown their intro (for introNew feature)
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
      sx.fn.rightsOf = rightsOf;
      sx.fn.remainingList = remainingList;
      sx.fn.result = result;
      sx.fn.recordGrade = recordGrade;
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
        if ((sx.draftDirty && since >= WRITE_THROTTLE_MS) || since >= TICK_INTERVAL_MS) sx.fn.saveDraft(true);
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
        if (stimulusOf(item) !== null || hasAudioLines(item)) return false;
        introduced[item.id] = true;
        return true;
      };

      // Intro card for the item's entity, or null. Pure: nothing is written until markIntroSeen.
      session.introFor = function (item) {
        if (!course.introNew || mode !== 'daily' || !item) return null;
        var e = itemEntities[item.id];
        if (e === undefined) e = item.entity || item.id;
        var intro = introById[e];
        if (!intro || introSeen[e]) return null;
        var seen = store.doc.intros;
        if (seen && typeof seen === 'object' && Object.prototype.hasOwnProperty.call(seen, e) && typeof seen[e] === 'number') return null;
        var recs = records();
        var members = entityMembers[e] || [item.id];
        for (var i = 0; i < members.length; i++) if (recs[members[i]] !== undefined) return null;
        return intro;
      };

      // Intro of the item's entity for the wrong-answer feedback, or null. Pure: ignores seen state and mode.
      session.entityIntro = function (item) {
        if (!item) return null;
        var e = itemEntities[item.id];
        if (e === undefined) e = item.entity || item.id;
        return introById[e] || null;
      };

      session.markIntroSeen = function (entity) {
        var e = typeof entity === 'string' ? entity : entity && (itemEntities[entity.id] || entity.entity || entity.id);
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

      function rightsOf(item) {
        return item.pairs.map(function (p) { return p.right; }).concat(item.distractors || []);
      }

      function viewFor(item) {
        if (item.type === 'choice') {
          var order = shuffledIndexes(item.options.length, session.id + '|' + item.id);
          return { options: order.map(function (orig) { return { label: optionText(item, orig), index: orig }; }) };
        }
        var seed = session.id + '|' + item.id;
        if (item.type === 'multi') {
          return { options: shuffledIndexes(item.options.length, seed).map(function (orig, pos) { return { label: item.options[orig], id: pos }; }) };
        }
        if (item.type === 'match') {
          var lp = shuffledIndexes(item.pairs.length, seed + '|L');
          var rp = shuffledIndexes(rightsOf(item).length, seed + '|R');
          return {
            lefts: lp.map(function (orig, pos) { return { label: item.pairs[orig].left, id: pos }; }),
            rights: rp.map(function (orig, pos) { return { label: rightsOf(item)[orig], id: pos }; })
          };
        }
        if (item.type === 'order') {
          return { steps: orderPerm(item.steps.length, seed).map(function (orig, pos) { return { label: item.steps[orig], id: pos }; }) };
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

      session.current = function () {
        var id = currentId();
        if (id === null) return null;
        var item = byId[id];
        return { item: item, position: session.index + 1, total: queue.length, view: viewFor(item), stimulus: stimulusOf(item) };
      };

      session.reveal = function () {
        sx.revealed = true;
      };

      function isNewFor(item) {
        var se = scopedEntityOf[item.id];
        return se !== undefined ? entityViewOf(se) === null : records()[item.id] === undefined;
      }

      function scopedPrev(e) {
        var snap = {};
        var recs = records();
        entityMembers[e].forEach(function (id) { snap[id] = recs[id]; });
        return snap;
      }

      function requeueKey(item) {
        var se = scopedEntityOf[item.id];
        return se !== undefined ? 'e:' + se : item.id;
      }

      function result(item, graded_) {
        if (mode === 'exam' && !session.training) return { recorded: true };
        if (mode === 'placement') {
          var placementModeVar = session.placementMode || placementMode();
          if (placementModeVar === 'check') {
            var out = { correct: graded_.correct, expected: expectedFor(item), explanation: item.explanation || null };
            if (graded_.dontKnow) out.given = graded_.given;
            if (item.type === 'gap') out.accepted = item.answers.slice();
            if (graded_.detail) out.detail = graded_.detail;
            return out;
          } else {
            // Self mode: original behavior - no feedback
            return { recorded: true };
          }
        }
        var out = { correct: graded_.correct, expected: expectedFor(item), explanation: item.explanation || null };
        if (graded_.dontKnow) out.given = graded_.given;
        if (item.type === 'gap') out.accepted = item.answers.slice();
        if (graded_.detail) out.detail = graded_.detail;
        return out;
      }

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
            var placementModeVar = session.placementMode || placementMode();
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
            if (!verdict) return { error: 'bad_input' };
            // For gap retry: don't record, don't advance, don't mark as answered
            if (verdict.verdict === 'retry' && mode === 'exam' && !session.training) {
              verdict = { correct: false, given: verdict.given };
            } else if (verdict.verdict === 'retry') {
              return { verdict: 'retry', retry: true, expected: expectedFor(item), explanation: item.explanation || null };
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

      function prevOf(item) {
        var se = scopedEntityOf[item.id];
        return se !== undefined ? scopedPrev(se) : records()[item.id];
      }

      function recordGrade(item, verdict) {
        graded[item.id] = verdict.correct;
        review.push({ id: item.id, correct: verdict.correct, given: verdict.given, expected: expectedFor(item) });
        var rk = requeueKey(item);
        if (!verdict.correct && mode !== 'exam' && !requeued[rk]) {
          requeued[rk] = true;
          queue.push(item.id);
          return true;
        }
        return false;
      }

      session.canDontKnow = function () {
        if (course.dontKnow !== true) return false;
        var placementModeVar = mode === 'placement' ? (session.placementMode || placementMode()) : null;
        if (mode === 'placement' && placementModeVar === 'self') return false;
        var item = byId[currentId()];
        if (!item) return false;
        if (SELF_RATED.indexOf(item.type) >= 0) return false;
        if (mode === 'exam' && !session.training) return false;
        return true;
      };

      session.canOverride = function () {
        var la = sx.lastAnswer;
        if (!la || la.index !== session.index || la.verdict.correct) return false;
        if (mode === 'exam' || mode === 'placement' || course.allowOverride === false) return false;
        if (la.verdict.dontKnow) return false;
        return TYPED.indexOf(la.item.type) >= 0;
      };

      session.overrideLast = function () {
        if (!session.canOverride()) return { error: 'no_override' };
        var la = sx.lastAnswer;
        var item = la.item;
        var rec;
        try {
          var se = scopedEntityOf[item.id];
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

      function baseSummary() {
        var correct = review.filter(function (r) { return r.correct; }).length;
        return {
          mode: mode,
          correct: correct,
          total: session.total,
          answered: review.length,
          skipped: skipped.slice(),
          durationMs: now() - startedAt,
          review: review.slice()
        };
      }

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
          review.push({ id: rid, correct: ans.c, given: ans.g === undefined ? '' : ans.g, expected: expectedFor(byId[rid]) });
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

    function moreNew(n) {
      var add = Math.floor(n);
      if (!(add > 0)) return;
      var day = today();
      store.update(function (doc) {
        doc.stats = doc.stats || {};
        doc.stats.extraNewByDay = ensureObject(doc.stats.extraNewByDay);
        doc.stats.extraNewByDay[day] = (doc.stats.extraNewByDay[day] || 0) + add;
      });
    }

    function stage(item) {
      var rec = records()[item.id];
      if (rec === undefined || dojo.call('isNew', { rec: rec })) return 'new';
      return rec.s >= 2 ? 'review' : 'learning';
    }

    function record(item) {
      return records()[item.id];
    }

    function placement() {
      var st = store.doc && store.doc.settings;
      return { available: !!course.placement, done: !!(st && st.placementDone) };
    }

    return { counts: counts, entityStates: entityStates, start: start, exams: exams, placement: placement, moreNew: moreNew, stage: stage, record: record, expected: expectedFor, examDraft: examDraft, discardDraft: discardDraft, unitSettings: unitSettings, unitLadder: ladderForUnit, unitConfig: unitConfig, globalNewPerDay: globalNewPerDay, setUnitSetting: setUnitSetting, groupSettings: groupSettings, setGroupSetting: setGroupSetting, weakList: weakList };
  }

  /** Display info for a tag from course.tagLabels (string or {label?, kind?}): { label, internal }; label defaults to the uppercased tag. */
  function tagInfo(course, tag) {
    var labels = course && course.tagLabels;
    var entry = labels && Object.prototype.hasOwnProperty.call(labels, tag) ? labels[tag] : undefined;
    var label = null;
    var internal = false;
    if (typeof entry === 'string') label = entry;
    else if (entry && typeof entry === 'object') {
      if (typeof entry.label === 'string') label = entry.label;
      internal = entry.kind === 'internal';
    }
    return { label: label !== null && label !== '' ? label : String(tag).toUpperCase(), internal: internal };
  }

  var api = { createEngine: createEngine, tagInfo: tagInfo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSession = api;
})(typeof self !== 'undefined' ? self : this);
