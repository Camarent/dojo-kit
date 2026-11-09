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

  function dep(name, file) {
    return root[name] || (typeof require === 'function' ? require(file) : null);
  }

  var util = dep('DojoSessionUtil', './session/util.js');
  var queuesMod = dep('DojoSessionQueues', './session/queues.js');
  var placementQueueMod = dep('DojoSessionPlacementQueue', './session/placement-queue.js');
  var countsMod = dep('DojoSessionCounts', './session/counts.js');
  var examMod = dep('DojoSessionExam', './session/exam.js');
  var runMod = dep('DojoSessionRun', './session/run.js');
  var qtimerMod = dep('DojoSessionQtimer', './session/qtimer.js');
  var weightedMod = dep('DojoSessionWeightedQueue', './session/weighted-queue.js');
  var clipFlagsMod = dep('DojoSessionClipFlags', './session/clip-flags.js');
  var overridesMod = dep('DojoSessionOverrides', './session/overrides.js');
  var isRetired = util.isRetired;
  var ensureObject = util.ensureObject;
  var expectedFor = util.expectedFor;
  var DEFAULT_LEARNED_STAGE = util.K.DEFAULT_LEARNED_STAGE;

  function placementPerUnit(ctx) {
    return (ctx.course.placement && ctx.course.placement.perUnit) || 5;
  }

  function placementMode(ctx) {
    return (ctx.course.placement && ctx.course.placement.mode) || 'check';
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

  function learnedStage(ctx) {
    var custom = ctx.course.learnedStage;
    if (Number.isInteger(custom) && custom >= 1) return custom;
    return DEFAULT_LEARNED_STAGE;
  }

  function records(ctx) {
    return ctx.store.doc.items || {};
  }

  function newSessionId(ctx, mode) {
    return mode + '-' + ctx.now() + '-' + Math.floor(ctx.random() * 4294967296).toString(36);
  }

  function moreNew(ctx, n) {
    var add = Math.floor(n);
    if (!(add > 0)) return;
    var day = ctx.today();
    ctx.store.update(function (doc) {
      doc.stats = doc.stats || {};
      doc.stats.extraNewByDay = ensureObject(doc.stats.extraNewByDay);
      doc.stats.extraNewByDay[day] = (doc.stats.extraNewByDay[day] || 0) + add;
    });
  }

  function stage(ctx, item) {
    var rec = records(ctx)[item.id];
    if (rec === undefined || ctx.dojo.call('isNew', { rec: rec })) return 'new';
    return rec.s >= 2 ? 'review' : 'learning';
  }

  function placement(ctx) {
    var st = ctx.store.doc && ctx.store.doc.settings;
    return { available: !!ctx.course.placement, done: !!(st && st.placementDone) };
  }

  // st: mutable engine state read by the ctx getters (groups, entities, topic scope, flags, qtimer).
  function makeCtx(deps, st) {
    var content = deps.content;
    var items = content.items || [];
    var byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    var introById = Object.create(null);
    (content.intros || []).forEach(function (i) { if (i && typeof i.id === 'string') introById[i.id] = i; });
    var stimById = {};
    (content.stimuli || []).forEach(function (s) { stimById[s.id] = s; });
    st.stimById = stimById;
    // ctx: engine context for extracted modules `create(ctx)`; read getters and ctx.store.doc at call time; other engine functions via ctx.fn.<name>.
    return {
      dojo: deps.dojo, store: deps.store, content: content, course: content.course || {}, items: items, byId: byId,
      introById: introById, stimById: stimById, nav: deps.navigator !== undefined ? deps.navigator : (typeof navigator !== 'undefined' ? navigator : null),
      now: deps.now, today: deps.today, random: deps.random,
      get groupList() { return st.groupList; }, get groupById() { return st.groupById; }, get unitGroup() { return st.unitGroup; },
      get itemEntities() { return st.itemEntities; }, get entityMembers() { return st.entityMembers; },
      get scopedMembers() { return st.scopedMembers; }, get scopedEntityOf() { return st.scopedEntityOf; },
      get scopedUnit() { return st.scopedUnit; }, get hasScope() { return st.hasScope; },
      clipMeta: function (id) { return root.DojoAudio && root.DojoAudio.clipMeta ? root.DojoAudio.clipMeta(id) : null; },
      fn: {}
    };
  }

  // Groups (course.groups): entity-based daily caps decided in WASM; JS passes maps and records stats.
  function initGroups(ctx, st) {
    st.groupList = Array.isArray(ctx.course.groups) ? ctx.course.groups : [];
    st.groupById = {};
    st.unitGroup = {};
    st.groupList.forEach(function (g) {
      st.groupById[g.id] = g;
      (g.units || []).forEach(function (u) { if (!(u in st.unitGroup)) st.unitGroup[u] = g.id; });
    });
    st.itemEntities = Object.create(null);
    st.entityMembers = Object.create(null);
    ctx.items.forEach(function (it) {
      var e = it.entity || it.id;
      st.itemEntities[it.id] = e;
      (st.entityMembers[e] = st.entityMembers[e] || []).push(it.id);
    });
  }

  function scopeWanted(course) {
    return (course.srs && course.srs.scope === 'entity') || (course.units || []).some(function (u) { return u.srs && u.srs.scope === 'entity'; });
  }

  function fillScope(ctx, st) {
    var unitScoped = {};
    (ctx.course.units || []).forEach(function (u) { unitScoped[u.id] = ctx.fn.unitConfig(u.id).scope === 'entity'; });
    Object.keys(st.entityMembers).forEach(function (e) {
      var act = st.entityMembers[e].filter(function (id) { return !isRetired(ctx.byId[id]); });
      if (!act.length || !act.every(function (id) { return unitScoped[ctx.byId[id].unit] === true; })) return;
      st.scopedMembers[e] = act;
      st.scopedUnit[e] = ctx.byId[act[0]].unit;
      act.forEach(function (id) { st.scopedEntityOf[id] = e; });
    });
  }

  // Topic-level SRS (srs.scope "entity"): the unit config is resolved in WASM; an entity is scoped when all of its
  // active members' units resolve "entity". Scoped entities are graded and queued as one (WASM applyEntity / buildQueue).
  function initScope(ctx, st) {
    st.scopedMembers = Object.create(null); // entity -> active ids in file order
    st.scopedEntityOf = Object.create(null); // item id -> scoped entity
    st.scopedUnit = Object.create(null); // entity -> unit of its first active member
    if (scopeWanted(ctx.course)) fillScope(ctx, st);
    st.hasScope = Object.keys(st.scopedMembers).length > 0;
  }

  function validateStart(ctx, mode, o) {
    if (['daily', 'practice', 'weak', 'exam', 'placement'].indexOf(mode) < 0) return 'unknown_mode';
    if (mode === 'placement' && !ctx.course.placement) return 'no_placement';
    if (mode !== 'exam') return null;
    var found = ctx.fn.findExam(o.examId);
    if (!found || !found.sections) return 'no_exam';
    o.exam = found;
    if (o.resume && (o.training || !ctx.fn.validateDraft(o.resume, o.exam))) return 'bad_input';
    return null;
  }

  function start(ctx, st, mode, opts) {
    var o = Object.assign({}, opts || {});
    var err = validateStart(ctx, mode, o);
    if (err) return { error: err };
    var plan;
    try {
      plan = ctx.fn.buildPlan(mode, o);
    } catch {
      return { error: 'engine' };
    }
    if (!plan.ids.length) return { error: 'empty' };
    var session = ctx.fn.createSession(mode, plan);
    if (st.qtimer && !session.error && (mode === 'daily' || mode === 'practice' || mode === 'weak')) st.qtimer.attach(session);
    return session;
  }

  function baseFns(ctx, st) {
    return {
      placementPerUnit: function () { return placementPerUnit(ctx); },
      placementMode: function () { return placementMode(ctx); },
      stimulusOf: function (item) {
        var s = item && item.stimulus && Object.prototype.hasOwnProperty.call(st.stimById, item.stimulus) ? st.stimById[item.stimulus] : null;
        return st.flags.filterStimulus(s);
      },
      hasAudioLines: hasAudioLines,
      normalizeOpts: function (item) { return item.normalize || ctx.course.normalize || null; },
      learnedStage: function () { return learnedStage(ctx); },
      activeItems: function () { return ctx.items.filter(function (it) { return !isRetired(it); }); },
      records: function () { return records(ctx); },
      start: function (mode, opts) { return start(ctx, st, mode, opts); },
      newSessionId: function (mode) { return newSessionId(ctx, mode); },
      moreNew: function (n) { return moreNew(ctx, n); },
      stage: function (item) { return stage(ctx, item); },
      record: function (item) { return records(ctx)[item.id]; },
      placement: function () { return placement(ctx); }
    };
  }

  function wireQtimer(ctx, st) {
    var qtimer = qtimerMod ? qtimerMod.create(ctx) : null;
    st.qtimer = qtimer;
    ctx.fn.qtimerAfter = qtimer ? qtimer.afterVerdict : function () {};
    ctx.fn.qtimerClear = qtimer ? qtimer.clear : function () {};
    ctx.fn.qtimerSnapshot = qtimer ? qtimer.snapshot : function () { return null; };
    ctx.fn.qtimerRestore = qtimer ? qtimer.restore : function () {};
    ctx.fn.qtimerPending = qtimer ? qtimer.pending : function () { return false; };
  }

  function wireModules(ctx) {
    var fn = ctx.fn;
    Object.assign(fn, overridesMod.create(ctx));
    Object.assign(fn, weightedMod.create(ctx));
    Object.assign(fn, queuesMod.create(ctx));
    Object.assign(fn, placementQueueMod.create(ctx));
    Object.assign(fn, runMod.create(ctx));
    Object.assign(fn, countsMod.create(ctx));
    Object.assign(fn, examMod.create(ctx));
  }

  function publicApi(fn, flags) {
    var names = ['counts', 'entityStates', 'topicLevels', 'start', 'exams', 'placement', 'moreNew', 'stage', 'record', 'examDraft', 'discardDraft',
      'unitSettings', 'unitConfig', 'globalNewPerDay', 'setUnitSetting', 'groupSettings', 'setGroupSetting', 'weakList'];
    var out = { expected: expectedFor, unitLadder: fn.ladderForUnit, flagClip: flags.setFlag, isClipFlagged: flags.isFlagged, flaggedClips: flags.flagged };
    names.forEach(function (n) { out[n] = fn[n]; });
    return out;
  }

  function createEngine(deps) {
    var st = {};
    var ctx = makeCtx(deps, st);
    Object.assign(ctx.fn, baseFns(ctx, st));
    initGroups(ctx, st);
    st.hasScope = false;
    st.flags = clipFlagsMod.create(ctx);
    if (root.DojoAudio && root.DojoAudio.bindHeard) root.DojoAudio.bindHeard({ get: st.flags.heardAt, set: st.flags.markHeard });
    wireQtimer(ctx, st);
    wireModules(ctx);
    initScope(ctx, st);
    Object.freeze(ctx.fn);
    return publicApi(ctx.fn, st.flags);
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
