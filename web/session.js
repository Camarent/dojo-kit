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

  var runMod = root.DojoSessionRun || (typeof require === 'function' ? require('./session/run.js') : null);

  var overridesMod = root.DojoSessionOverrides || (typeof require === 'function' ? require('./session/overrides.js') : null);

  var mulberry32 = util.mulberry32;
  var isRetired = util.isRetired;
  var ensureObject = util.ensureObject;
  var expectedFor = util.expectedFor;

  var DEFAULT_NEW_PER_DAY = util.K.DEFAULT_NEW_PER_DAY;
  var DEFAULT_PRACTICE_LIMIT = util.K.DEFAULT_PRACTICE_LIMIT;
  var DEFAULT_WEAK_LIMIT = util.K.DEFAULT_WEAK_LIMIT;
  var DEFAULT_LEARNED_STAGE = util.K.DEFAULT_LEARNED_STAGE;

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
    var runApi = runMod.create(ctx);
    ctx.fn.createSession = runApi.createSession;
    var createSession = runApi.createSession;
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
