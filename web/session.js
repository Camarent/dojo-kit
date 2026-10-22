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

  var UNIT_NEW_PREFIX = 'newBy:';
  var GROUP_NEW_PREFIX = 'newBy:g:';
  var DEFAULT_NEW_PER_DAY = 10;
  var DEFAULT_PRACTICE_LIMIT = 20;
  var DEFAULT_WEAK_LIMIT = 10;
  var DEFAULT_LEARNED_STAGE = 4;
  var TYPED = ['gap', 'cloze', 'numeric'];
  var SELF_RATED = ['card'];
  var DRAFT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_ANSWER_G = 200;
  var MAX_IDS_COUNT = 1000;
  var MAX_CLOSED_SIDS = 32;
  var WRITE_THROTTLE_MS = 1000;
  var TICK_INTERVAL_MS = 60000;

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./session/util.js') : null);
  var hashString = util.hashString;
  var mulberry32 = util.mulberry32;
  var shuffledIndexes = util.shuffledIndexes;
  var isRetired = util.isRetired;
  var ensureObject = util.ensureObject;
  var expectedFor = util.expectedFor;
  var isIdList = util.isIdList;
  var orderPerm = util.orderPerm;
  var clozeBlanks = util.clozeBlanks;
  var correctIndexes = util.correctIndexes;
  var optionText = util.optionText;

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

    function applyLadderScale(ladder, unitId) {
      var scale = getUnitSettingsOverride(unitId).ladderScale;
      return scale !== undefined && scale !== 1 && ladder && ladder.length ? scaleLadder(ladder, scale) : ladder;
    }

    function ladderForUnit(unitId) {
      return applyLadderScale(unitConfig(unitId).ladder, unitId);
    }

    function learnedStage() {
      var custom = course.learnedStage;
      if (Number.isInteger(custom) && custom >= 1) return custom;
      return DEFAULT_LEARNED_STAGE;
    }

    function getUnitThreshold(unitId) {
      var courseThreshold = learnedStage();
      var ladder = ladderForUnit(unitId);
      if (!ladder || ladder.length === 0) return courseThreshold;
      var maxStage = ladder.length - 1;
      if (maxStage < courseThreshold) return maxStage;
      return courseThreshold;
    }

    function itemLadderFor(item) {
      return applyLadderScale(dojo.call('ladderForUnit', { course: course, unitId: item.unit, itemType: item.type }), item.unit);
    }

    function dropForItem(item) {
      var override = getUnitSettingsOverride(item.unit);
      if (override.dropOnWrong !== undefined) return override.dropOnWrong;
      return dojo.call('dropForUnit', { course: course, unitId: item.unit, itemType: item.type });
    }

    var UNIT_OVERRIDE_FIELDS = ['newPerDay', 'ladderScale', 'dropOnWrong', 'newOrder'];

    function unitFieldKey(unitId, field) {
      return 'unit:' + unitId + ':' + field;
    }

    // Course-resolved unit config from WASM (no user overrides); user overrides are layered on top in JS.
    function unitConfig(unitId) {
      return dojo.call('unitConfig', { course: course, unitId: unitId });
    }

    function validateUnitOverrideField(k, v) {
      if (k === 'newPerDay') return Number.isInteger(v) && v >= 0 && v <= 50;
      if (k === 'ladderScale') return typeof v === 'number' && isFinite(v) && v >= 0.25 && v <= 4;
      if (k === 'dropOnWrong') return Number.isInteger(v) && v >= 0 && v <= 10;
      if (k === 'newOrder') return v === 'file' || v === 'random';
      return false;
    }

    // Per-field keys `unit:<id>:<field>`; null is a tombstone and reads as absent.
    function getUnitSettingsOverride(unitId) {
      var settings = store.doc.settings || {};
      var result = {};
      UNIT_OVERRIDE_FIELDS.forEach(function (field) {
        var raw = settings[unitFieldKey(unitId, field)];
        if (raw !== undefined && raw !== null && validateUnitOverrideField(field, raw)) result[field] = raw;
      });
      return result;
    }

    function unitSettings(unitId) {
      return getUnitSettingsOverride(unitId);
    }

    function scaleLadder(ladder, scale) {
      if (scale === 1) return ladder;
      var out = ladder.map(function (v) { return v === 0 ? 0 : Math.round(v * scale); });
      for (var i = 1; i < out.length; i++) {
        if (out[i] < out[i - 1]) out[i] = out[i - 1];
      }
      return out;
    }

    function setUnitSetting(unitId, patch) {
      var validUnit = false;
      var units = course.units || [];
      for (var i = 0; i < units.length; i++) {
        if (units[i].id === unitId) {
          validUnit = true;
          break;
        }
      }
      if (!validUnit) return { error: 'unknown_unit' };

      // Validate all fields in the patch first
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k) && patch[k] !== null && !validateUnitOverrideField(k, patch[k])) {
          return { error: 'bad_value' };
        }
      }
      
      var settings = store.doc.settings || {};
      var hasChange = false;
      for (var pk in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, pk)) continue;
        var current = settings[unitFieldKey(unitId, pk)];
        if (patch[pk] === null ? (current !== undefined && current !== null) : current !== patch[pk]) hasChange = true;
      }
      if (!hasChange) return {};

      // Apply changes per-field
      store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings.ts = doc.settings.ts || {};
        for (var pk in patch) {
          if (!Object.prototype.hasOwnProperty.call(patch, pk)) continue;
          var fieldKey = unitFieldKey(unitId, pk);
          if (patch[pk] === null) {
            // Tombstone: store null to mark deletion
            doc.settings[fieldKey] = null;
          } else {
            doc.settings[fieldKey] = patch[pk];
          }
          // Update timestamp for this field key
          doc.settings.ts[fieldKey] = now();
        }
      });
      return {};
    }

    function activeItems() {
      return items.filter(function (it) { return !isRetired(it); });
    }

    function records() {
      return store.doc.items || {};
    }

    // ---- Groups (course.groups): entity-based daily caps decided in WASM; JS passes maps and records stats ----
    var GROUP_OVERRIDE_FIELDS = ['newPerDay', 'newOrder', 'onlyTags', 'extraRandom'];
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

    function scopedArgs() {
      return hasScope ? { scopedMembers: scopedMembers } : null;
    }

    function scopedRecords(e) {
      var recs = records();
      var out = {};
      entityMembers[e].forEach(function (id) { if (recs[id] !== undefined) out[id] = recs[id]; });
      return out;
    }

    function scopedMemberList(e) {
      return entityMembers[e].map(function (id) { return { id: id, retired: isRetired(byId[id]) }; });
    }

    function entityViewOf(e) {
      return dojo.call('entityView', { members: scopedMemberList(e), records: scopedRecords(e) });
    }

    function groupFieldKey(groupId, field) {
      return 'group:' + groupId + ':' + field;
    }

    function validateGroupOverrideField(k, v) {
      if (k === 'newPerDay') return Number.isInteger(v) && v >= 0 && v <= 50;
      if (k === 'newOrder') return v === 'file' || v === 'random';
      if (k === 'onlyTags' || k === 'extraRandom') return typeof v === 'boolean';
      return false;
    }

    // Per-field keys `group:<id>:<field>`; null is a tombstone and reads as absent.
    function groupSettings(groupId) {
      var settings = store.doc.settings || {};
      var result = {};
      GROUP_OVERRIDE_FIELDS.forEach(function (field) {
        var raw = settings[groupFieldKey(groupId, field)];
        if (raw !== undefined && raw !== null && validateGroupOverrideField(field, raw)) result[field] = raw;
      });
      return result;
    }

    function setGroupSetting(groupId, patch) {
      if (!groupById[groupId]) return { error: 'unknown_group' };
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k) && (GROUP_OVERRIDE_FIELDS.indexOf(k) < 0 || (patch[k] !== null && !validateGroupOverrideField(k, patch[k])))) {
          return { error: 'bad_value' };
        }
      }
      var settings = store.doc.settings || {};
      var hasChange = false;
      for (var pk in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, pk)) continue;
        var current = settings[groupFieldKey(groupId, pk)];
        if (patch[pk] === null ? (current !== undefined && current !== null) : current !== patch[pk]) hasChange = true;
      }
      if (!hasChange) return {};
      store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings.ts = doc.settings.ts || {};
        for (var pk in patch) {
          if (!Object.prototype.hasOwnProperty.call(patch, pk)) continue;
          var fieldKey = groupFieldKey(groupId, pk);
          doc.settings[fieldKey] = patch[pk];
          doc.settings.ts[fieldKey] = now();
        }
      });
      return {};
    }

    // Effective daily entity cap: user override > course group newPerDay > null (uncapped).
    function groupCap(g) {
      var o = groupSettings(g.id);
      if (o.newPerDay !== undefined) return o.newPerDay;
      return typeof g.newPerDay === 'number' ? g.newPerDay : null;
    }

    function groupOrder(g) {
      var o = groupSettings(g.id);
      return o.newOrder !== undefined ? o.newOrder : (g.newOrder || 'file');
    }

    function dayStat(key) {
      return (((store.doc.stats || {})[key]) || {})[today()] || 0;
    }

    function extraNewToday() {
      return dayStat('extraNewByDay');
    }

    function extraGroup() {
      for (var i = 0; i < groupList.length; i++) if (groupList[i].extraNew === true) return groupList[i];
      return null;
    }

    function groupUsed() {
      var used = {};
      groupList.forEach(function (g) { used[GROUP_NEW_PREFIX + g.id] = dayStat(GROUP_NEW_PREFIX + g.id); });
      return used;
    }

    // Items introduced today in capped groups do not consume the allowance of ungrouped units.
    function groupedItemsUsedToday() {
      var n = 0;
      groupList.forEach(function (g) {
        if (groupCap(g) === null) return;
        (g.units || []).forEach(function (u) { if (unitGroup[u] === g.id) n += dayStat(UNIT_NEW_PREFIX + u); });
      });
      return n;
    }

    function groupQueueArgs() {
      var caps = {};
      var units = {};
      var random = [];
      groupList.forEach(function (g) {
        var cap = groupCap(g);
        if (cap === null) return;
        caps[g.id] = cap;
        units[g.id] = (g.units || []).filter(function (u) { return unitGroup[u] === g.id; });
        if (groupOrder(g) === 'random') random.push(g.id);
      });
      if (!Object.keys(caps).length) return null;
      return { itemEntities: itemEntities, groupNewCaps: caps, groupUnits: units, randomGroups: random, used: groupUsed(), day: today(), courseId: course.id || '' };
    }

    // User-level daily new-item cap (applies to units whose course sets no cap).
    function globalNewPerDay() {
      var settings = store.doc.settings || {};
      return typeof settings.newPerDay === 'number' ? settings.newPerDay : DEFAULT_NEW_PER_DAY;
    }

    function newAllowance() {
      var doc = store.doc;
      var perDay = globalNewPerDay();
      var used = (doc.stats && doc.stats.newByDay && doc.stats.newByDay[today()]) || 0;
      var extra = (doc.stats && doc.stats.extraNewByDay && doc.stats.extraNewByDay[today()]) || 0;
      if (groupList.length) {
        used = Math.max(0, used - groupedItemsUsedToday());
        if (extraGroup() && groupCap(extraGroup()) !== null) extra = 0;
      }
      return Math.max(0, perDay + extra - used);
    }

    function buildUnitNewCaps() {
      var caps = {};
      var units = course.units || [];
      units.forEach(function (unit) {
        var effectiveCap = unitConfig(unit.id).newPerDay;
        var override = getUnitSettingsOverride(unit.id);
        if (override.newPerDay !== undefined) effectiveCap = override.newPerDay;
        if (effectiveCap !== null) {
          var usedToday = (((store.doc.stats || {})[UNIT_NEW_PREFIX + unit.id]) || {})[today()] || 0;
          caps[unit.id] = Math.max(0, Math.floor(effectiveCap) - usedToday);
        }
      });
      return caps;
    }

    function buildItemUnits() {
      var map = {};
      items.forEach(function (item) {
        if (item.unit) {
          map[item.id] = item.unit;
        }
      });
      return map;
    }

    function resolveNewOrder(unit) {
      if (!unit) return 'file';
      var override = getUnitSettingsOverride(unit.id);
      return override.newOrder !== undefined ? override.newOrder : unitConfig(unit.id).newOrder;
    }

    // Items of ids outside examOnly units; ids itself when that leaves nothing.
    function preferShared(ids) {
      var eo = {};
      (course.units || []).forEach(function (u) { if (u.examOnly === true) eo[u.id] = true; });
      var unitOf = {};
      items.forEach(function (it) { unitOf[it.id] = it.unit; });
      var shared = ids.filter(function (id) { return !eo[unitOf[id]]; });
      return shared.length > 0 ? shared : ids;
    }

    function unitIsExamOnly(unitId) {
      return (course.units || []).some(function (u) { return u.id === unitId && u.examOnly === true; });
    }

    // Queue without examOnly items unless that would leave the whole queue empty.
    function builtQueue() {
      var q = rawBuiltQueue(true);
      if (q.due.length + q.fresh.length > 0) return q;
      return rawBuiltQueue(false);
    }

    function rawBuiltQueue(sharedOnly) {
      var order = activeItems().map(function (it) { return it.id; });
      if (sharedOnly) order = preferShared(order);

      // Shuffle items within each random-order unit's own slots
      var unitLookup = {};
      (course.units || []).forEach(function (u) { unitLookup[u.id] = u; });

      var itemUnit = {};
      items.forEach(function (it) { itemUnit[it.id] = it.unit; });

      // Group positions by unit
      var unitPositions = {};
      order.forEach(function (id, idx) {
        var unitId = itemUnit[id];
        if (!unitPositions[unitId]) unitPositions[unitId] = [];
        unitPositions[unitId].push(idx);
      });
      
      // Shuffle positions within each random-order unit
      var shuffledOrder = order.slice();
      for (var unitId in unitPositions) {
        var positions = unitPositions[unitId];
        var unit = unitLookup[unitId];
        var inCappedGroup = unitGroup[unitId] !== undefined && groupCap(groupById[unitGroup[unitId]]) !== null;
        if (!inCappedGroup && resolveNewOrder(unit) === 'random' && positions.length > 1) {
          var seed = course.id + '|' + today() + '|' + unitId;
          var perm = shuffledIndexes(positions.length, seed);
          positions.forEach(function (pos, i) {
            shuffledOrder[pos] = order[positions[perm[i]]];
          });
        }
      }
      order = shuffledOrder;
      
      var args = { items: records(), order: order, now: now(), newAllowance: newAllowance(), unitNewCaps: buildUnitNewCaps(), itemUnits: buildItemUnits() };
      var sa = scopedArgs();
      if (sa) args.scopedMembers = sa.scopedMembers;
      var ga = groupQueueArgs();
      if (!ga) return dojo.call('buildQueue', args);
      Object.keys(ga).forEach(function (k) { args[k] = ga[k]; });
      var xg = extraGroup();
      var extra = extraNewToday();
      var base = xg ? groupCap(xg) : null;
      if (!xg || base === null || !(extra > 0)) return dojo.call('buildQueue', args);
      var tags = xg.extraTags || [];
      var tagFilter = tags.length > 0 && groupSettings(xg.id).onlyTags === true;
      var extraRandom = groupSettings(xg.id).extraRandom === true;
      if (!tagFilter && !extraRandom) {
        args.groupNewCaps[xg.id] = base + extra;
        return dojo.call('buildQueue', args);
      }
      // Two passes: the base share is picked as usual; entities beyond it are filtered by extraTags and/or drawn at random.
      var q0 = dojo.call('buildQueue', args);
      var inQ0 = {};
      q0.fresh.forEach(function (id) { inQ0[id] = true; });
      var xUnits = args.groupUnits[xg.id];
      var recs = records();
      var tagged = {};
      items.forEach(function (it) {
        if ((it.tags || []).some(function (t) { return tags.indexOf(t) >= 0; })) tagged[itemEntities[it.id]] = true;
      });
      var inGroup = {};
      items.forEach(function (it) { if (xUnits.indexOf(it.unit) >= 0) inGroup[it.id] = true; });
      var order2 = order.filter(function (id) {
        return !inGroup[id] || recs[id] !== undefined || inQ0[id] || !tagFilter || tagged[itemEntities[id]];
      });
      var args2 = Object.assign({}, args, { order: order2 });
      if (extraRandom) {
        var slots = [];
        order2.forEach(function (id, i) { if (inGroup[id] && recs[id] === undefined) slots.push(i); });
        var baseEnt = {};
        q0.fresh.forEach(function (id) { baseEnt[itemEntities[id]] = true; });
        var head = [];
        var rest = [];
        var restOf = {};
        slots.forEach(function (i) {
          var id = order2[i];
          var e = itemEntities[id];
          if (baseEnt[e]) { head.push(id); return; }
          if (!restOf[e]) { restOf[e] = []; rest.push(e); }
          restOf[e].push(id);
        });
        var perm2 = shuffledIndexes(rest.length, (course.id || '') + '|' + today() + '|' + xg.id + '|extra');
        var seq = head.slice();
        perm2.forEach(function (pi) { restOf[rest[pi]].forEach(function (id) { seq.push(id); }); });
        order2 = order2.slice();
        slots.forEach(function (pos, i) { order2[pos] = seq[i]; });
        args2.order = order2;
        args2.randomGroups = (args.randomGroups || []).filter(function (gid) { return gid !== xg.id; });
      }
      var used = args.used[GROUP_NEW_PREFIX + xg.id] || 0;
      var extraLeft = Math.max(0, Math.min(extra, base + extra - used));
      args2.groupNewCaps = Object.assign({}, args.groupNewCaps);
      args2.groupNewCaps[xg.id] = Math.max(0, base - used) + extraLeft + used;
      var q2 = dojo.call('buildQueue', args2);
      var more = q2.fresh.filter(function (id) { return !inQ0[id] && inGroup[id]; });
      var merged = { due: q0.due, fresh: q0.fresh.concat(more) };
      if (q0.drills) merged.drills = Object.assign({}, q0.drills, q2.drills);
      return merged;
    }

    function dailyQueue(groupId) {
      var q = builtQueue();
      var ids = q.due.concat(q.fresh);
      if (groupId === undefined || groupId === null) return ids;
      var unitOf = {};
      items.forEach(function (it) { unitOf[it.id] = it.unit; });
      function inGroup(id) { return unitGroup[unitOf[id]] === groupId; }
      var got = ids.filter(inGroup);
      if (got.length) return got;
      var raw = rawBuiltQueue(false);
      return raw.due.concat(raw.fresh).filter(inGroup);
    }

    function counts() {
      var active = activeItems();
      var recs = records();
      var byUnit = {};
      var due = 0;
      var fresh = 0;
      var learning = 0;
      var learned = 0;
      var thresholdCache = new Map();
      var views = {};
      var dueSeen = {};
      active.forEach(function (it) {
        var u = byUnit[it.unit] || (byUnit[it.unit] = { total: 0, due: 0, fresh: 0, learning: 0, learned: 0 });
        u.total++;
        var rec = recs[it.id];
        var se = scopedEntityOf[it.id];
        if (se !== undefined) {
          if (!(se in views)) views[se] = entityViewOf(se);
          rec = views[se] === null ? undefined : views[se];
        }
        if (dojo.call('isNew', { rec: rec })) {
          u.fresh++; fresh++;
        } else {
          var stage = rec ? rec.s : undefined;
          var unitThreshold = thresholdCache.get(it.unit);
          if (unitThreshold === undefined) {
            unitThreshold = getUnitThreshold(it.unit);
            thresholdCache.set(it.unit, unitThreshold);
          }
          if (stage !== undefined && stage >= unitThreshold) {
            u.learned++; learned++;
          } else {
            u.learning++; learning++;
          }
          if (dojo.call('isDue', { rec: rec, now: now() }) && (se === undefined || !dueSeen[se])) {
            if (se !== undefined) dueSeen[se] = true;
            u.due++; due++;
          }
        }
      });
      var bq = builtQueue();
      var newToday = bq.fresh.length;
      var totals = { total: active.length, fresh: fresh, learning: learning, learned: learned };
      var out = { total: items.length, active: active.length, due: due, fresh: fresh, learning: learning, learned: learned, newToday: newToday, queue: bq.due.length + bq.fresh.length, byUnit: byUnit, totals: totals };
      if (groupList.length || (course.bars && course.bars.length)) {
        var gc = groupCounts();
        out.groups = gc.groups;
        out.bars = gc.bars;
        if (groupList.length) out.summary = summarize(gc.groups, byUnit, bq);
      }
      return out;
    }

    // Home summary of a course with groups, consistent with the group cards: due = group due (entities) + due items of
    // ungrouped units; newToday = group newToday (entities) + fresh items of ungrouped units in today's queue.
    function summarize(groups, byUnit, bq) {
      var due = 0;
      var newToday = 0;
      Object.keys(groups).forEach(function (id) { due += groups[id].due; newToday += groups[id].newToday; });
      var unitOf = {};
      items.forEach(function (it) { unitOf[it.id] = it.unit; });
      Object.keys(byUnit).forEach(function (u) { if (!(u in unitGroup)) due += byUnit[u].due; });
      bq.fresh.forEach(function (id) { if (!(unitOf[id] in unitGroup)) newToday++; });
      return { due: due, newToday: newToday, queue: bq.due.length + bq.fresh.length };
    }

    // Entity-level counts from WASM; the course copy carries the user's per-group newPerDay override.
    function groupCounts() {
      var c = Object.assign({}, course, {
        groups: groupList.map(function (g) {
          var cap = groupCap(g);
          var copy = Object.assign({}, g);
          if (cap === null) delete copy.newPerDay; else copy.newPerDay = cap;
          return copy;
        })
      });
      var meta = items.map(function (it) {
        return { id: it.id, unit: it.unit, entity: itemEntities[it.id], tags: it.tags || [], retired: isRetired(it) };
      });
      var gargs = { course: c, items: meta, records: records(), now: now(), used: groupUsed(), extraNew: extraNewToday() };
      if (hasScope) gargs.scopedEntities = Object.keys(scopedMembers);
      return dojo.call('groupCounts', gargs);
    }

    // Per-entity catalog summary from WASM `entityStates`: [{id, members, started, minStage, due, learned, atLearned}].
    function entityStates() {
      var meta = items.map(function (it) { return { id: it.id, entity: itemEntities[it.id], retired: isRetired(it) }; });
      var eargs = { items: meta, records: records(), now: now(), learnedStage: learnedStage() };
      if (hasScope) eargs.scopedEntities = Object.keys(scopedMembers);
      return dojo.call('entityStates', eargs);
    }

    function matches(item, opts) {
      if (opts.units && opts.units.indexOf(item.unit) < 0) return false;
      if (opts.types && opts.types.indexOf(item.type) < 0) return false;
      if (opts.tags && !(item.tags || []).some(function (t) { return opts.tags.indexOf(t) >= 0; })) return false;
      return true;
    }

    function practiceQueue(opts) {
      var recs = records();
      var t = now();
      var rows = activeItems().filter(function (it) { return matches(it, opts); }).map(function (it, i) {
        var rec = recs[it.id];
        var due = dojo.call('isDue', { rec: rec, now: t });
        return { id: it.id, due: due ? 0 : 1, last: (rec && rec.last) || 0, i: i };
      });
      rows.sort(function (a, b) { return a.due - b.due || a.last - b.last || a.i - b.i; });
      var all = rows.map(function (r) { return r.id; });
      var shared = preferShared(all);
      return shared.slice(0, opts.limit || DEFAULT_PRACTICE_LIMIT);
    }

    // Weakest ids among shared items; among all valid ones when no shared item is weak.
    function weakIds(valid, limit) {
      var all = Object.keys(valid);
      var shared = preferShared(all);
      if (shared.length < all.length) {
        var sv = {};
        shared.forEach(function (id) { sv[id] = true; });
        var ids = dojo.call('weakest', { items: records(), limit: limit, validIds: sv });
        if (ids.length > 0) return ids;
      }
      return dojo.call('weakest', { items: records(), limit: limit, validIds: valid });
    }
    function weakValidIds() {
      var valid = {}, recs = records(), seenEntity = {};
      activeItems().forEach(function (it) {
        var se = scopedEntityOf[it.id];
        if (se !== undefined) {
          var r = recs[it.id];
          if (seenEntity[se] || !r || !(r.bad > 0)) return;
          seenEntity[se] = true;
        }
        valid[it.id] = true;
      });
      return valid;
    }
    function weakQueue(opts) {
      var valid = weakValidIds();
      return weakIds(valid, opts.limit || DEFAULT_WEAK_LIMIT);
    }
    function weakList(limit) {
      var valid = weakValidIds();
      var ids = weakIds(valid, limit);
      return ids.map(function (id) { return { id: id, prompt: byId[id] ? byId[id].prompt : '' }; });
    }
    function placementQueue(opts) {
      var mode = placementMode();
      var perUnit = opts.perUnit || placementPerUnit();
      var sessionSeed = opts.seed;
      
      if (mode === 'self') {
        var sampled = [];
        var units = course.units || [];
        units.forEach(function (unit) {
          if (unit.placement === false) return;
          var unitItems = activeItems().filter(function (it) { return it.unit === unit.id; });
          if (unitItems.length === 0) return;
          var count = Math.min(perUnit, unitItems.length);
          var indices = shuffledIndexes(unitItems.length, sessionSeed + '|' + unit.id).slice(0, count);
          indices.forEach(function (idx) { sampled.push(unitItems[idx].id); });
        });
        return sampled;
      }
      
      // Check mode: skip card items, mix types, interleave units
      var SELF_RATED_TYPES = ['card'];
      var units = course.units || [];
      var includedUnits = units.filter(function (unit) { return unit.placement !== false; });
      
      // Filter items: active, not self-rated, in included units
      var allItems = activeItems().filter(function (it) {
        return SELF_RATED_TYPES.indexOf(it.type) < 0 && 
               includedUnits.some(function (u) { return u.id === it.unit; });
      });
      
      if (allItems.length === 0) return [];
      
      // Group by unit
      var itemsByUnit = {};
      allItems.forEach(function (item) {
        if (!itemsByUnit[item.unit]) itemsByUnit[item.unit] = [];
        itemsByUnit[item.unit].push(item);
      });
      
      // For each unit, group by type
      var byUnitAndType = {};
      Object.keys(itemsByUnit).forEach(function (unitId) {
        byUnitAndType[unitId] = {};
        itemsByUnit[unitId].forEach(function (item) {
          if (!byUnitAndType[unitId][item.type]) byUnitAndType[unitId][item.type] = [];
          byUnitAndType[unitId][item.type].push(item);
        });
      });
      
      // Sample per unit with mixed types via round-robin
      var sampledByUnit = {};
      var unitIds = Object.keys(byUnitAndType);
      
      unitIds.forEach(function (unitId) {
        var types = Object.keys(byUnitAndType[unitId]);
        var maxForUnit = Math.min(perUnit, itemsByUnit[unitId].length);
        
        // Deterministic type order from seed
        var typeOrder = types.slice();
        var typeSeed = hashString(sessionSeed + '|' + unitId);
        var typeRand = mulberry32(typeSeed);
        typeOrder.sort(function (a, b) {
          var ra = typeRand();
          var rb = typeRand();
          return ra < rb ? -1 : ra > rb ? 1 : 0;
        });
        
        // Collect items round-robin by type
        var collected = [];
        var typePos = {};
        types.forEach(function (t) { typePos[t] = 0; });
        
        var typeIndex = 0;
        while (collected.length < maxForUnit) {
          var typeKey = typeOrder[typeIndex % typeOrder.length];
          var items = byUnitAndType[unitId][typeKey];
          var pos = typePos[typeKey];
          
          if (pos < items.length) {
            collected.push(items[pos]);
            typePos[typeKey] = pos + 1;
          }
          
          typeIndex++;
          // If we've looped through all types and none had items, break
          if (typeIndex >= typeOrder.length * 2) break;
        }
        
        sampledByUnit[unitId] = collected;
      });
      
      // Interleave units using round-robin
      var result = [];
      var unitPos = {};
      unitIds.forEach(function (uid) { unitPos[uid] = 0; });
      
      var anyRemaining = true;
      while (anyRemaining) {
        anyRemaining = false;
        unitIds.forEach(function (uid) {
          var samples = sampledByUnit[uid];
          var pos = unitPos[uid];
          if (pos < samples.length) {
            result.push(samples[pos].id);
            unitPos[uid] = pos + 1;
            anyRemaining = true;
          }
        });
      }
      
      return result;
    }

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
      var candidates = activeItems().filter(function (it) { return SELF_RATED.indexOf(it.type) < 0; })
        .map(function (it) { return { id: it.id, unit: it.unit, tags: it.tags || [], type: it.type, stimulus: it.stimulus || null, examOnly: unitIsExamOnly(it.unit) }; });
      return dojo.call('sample', { candidates: candidates, sections: exam.sections || [], seed: String(now()) });
    }

    function acquireWakeLock() {
      var holder = { lock: null, released: false };
      try {
        if (!nav || !nav.wakeLock || typeof nav.wakeLock.request !== 'function') return holder;
        var p = nav.wakeLock.request('screen');
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
      if (mode === 'daily') return { ids: dailyQueue(opts.groupId) };
      if (mode === 'practice') return { ids: practiceQueue(opts) };
      if (mode === 'weak') return { ids: weakQueue(opts) };
      if (mode === 'placement') {
        var pOpts = Object.assign({}, opts, { seed: opts.seed !== undefined ? String(opts.seed) : String(now()) });
        return { ids: preferShared(placementQueue(pOpts)), placement: true, seed: pOpts.seed };
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
      var groupIdx = 0;
      if (groups) {
        groupIdx = resume ? resume.group : 0;
        session.group = { index: groupIdx, count: groups.length };
      }
      var lockHolder = mode === 'exam' && plan.deadline !== undefined ? acquireWakeLock() : null;

      var queue = plan.ids.slice();
      var startedAt = resume ? now() - resume.elapsedMs : now();
      var revealed = false;
      var answeredAt = {};
      var graded = {};
      var review = [];
      var requeued = {};
      var entityWrong = {}; // scoped entities that already dropped once in this session
      var skipped = []; // Track items skipped due to timer expiry
      var summary = null;
      var lastAnswer = null;
      var introduced = {}; // Track which items have shown their intro (for introNew feature)
      var introSeen = Object.create(null); // entities whose intro card was dismissed in this session
      var isTimedExam = mode === 'exam' && !plan.training && plan.deadline !== undefined;
      var draftAnswers = {};
      var draftClosed = false;
      var draftDirty = false;
      var lastWriteAt = -Infinity;

      function stableGiven(g) {
        return typeof g === 'string' ? g.substring(0, MAX_ANSWER_G) : '';
      }

      function remainingList() {
        var nowMs = now();
        if (!groups) return [Math.max(0, session.deadline - nowMs)];
        return groups.map(function (g, gi) {
          if (gi < groupIdx) return 0;
          if (gi === groupIdx) return Math.max(0, session.deadline - nowMs);
          return g.minutes * 60000;
        });
      }

      function buildDraft() {
        var answers = Object.keys(draftAnswers).map(Number).sort(function (x, y) { return x - y; }).map(function (i) {
          return draftAnswers[i];
        });
        var draft = {
          sid: session.id,
          examId: plan.exam.id,
          ids: queue.slice(),
          sections: plan.sections,
          index: session.index,
          group: groups ? groupIdx : 0,
          remainingMs: remainingList(),
          elapsedMs: Math.max(0, now() - startedAt),
          answers: answers,
          startedAt: resume ? resume.startedAt : startedAt,
          updatedAt: now()
        };
        return draft;
      }

      function saveDraft(force) {
        if (!isTimedExam || draftClosed) return;
        var t = now();
        if (!force && t - lastWriteAt < WRITE_THROTTLE_MS) { draftDirty = true; return; }
        var draft = buildDraft();
        lastWriteAt = t;
        draftDirty = false;
        store.update(function (doc) {
          var prev = doc.examDraft;
          if (prev && typeof prev === 'object' && prev.sid === session.id && prev.closed) return;
          if (prev && Array.isArray(prev.closedSids)) {
            if (prev.closedSids.some(function (c) { return c && c.sid === session.id; })) return;
            draft.closedSids = prev.closedSids;
          }
          doc.examDraft = draft;
        });
      }

      function closeDraft(doc, reason) {
        draftClosed = true;
        closeSlot(doc, session.id, reason, now());
      }

      session.saveDraft = function () { saveDraft(true); };

      session.tickDraft = function () {
        if (!isTimedExam || draftClosed) return;
        var since = now() - lastWriteAt;
        if ((draftDirty && since >= WRITE_THROTTLE_MS) || since >= TICK_INTERVAL_MS) saveDraft(true);
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
        if (item.type === 'card') return revealed ? { back: item.back } : {};
        return {};
      }

      session.current = function () {
        var id = currentId();
        if (id === null) return null;
        var item = byId[id];
        return { item: item, position: session.index + 1, total: queue.length, view: viewFor(item), stimulus: stimulusOf(item) };
      };

      session.reveal = function () {
        revealed = true;
      };

      function gradeInput(item, input) {
        if (!input || typeof input !== 'object') return null;
        if (item.type === 'choice') {
          if (!Number.isInteger(input.index) || input.index < 0 || input.index >= item.options.length) return null;
          var ok = correctIndexes(item).some(function (a) {
            return dojo.call('checkChoice', { answer: a, selected: input.index });
          });
          return { correct: ok, given: optionText(item, input.index) };
        }
        if (item.type === 'gap') {
          if (typeof input.text !== 'string') return null;
          var args = { answers: item.answers, input: input.text, opts: normalizeOpts(item) };
          // Use gapVerdict if retry readings are defined
          if (item.retry && item.retry.length > 0) {
            args.retry = item.retry;
            var verdict = dojo.call('gapVerdict', args);
            if (verdict === 'retry') {
              return { verdict: 'retry', correct: false, given: input.text };
            }
            return { correct: verdict === 'ok', given: input.text };
          }
          return { correct: dojo.call('checkGap', args), given: input.text };
        }
        if (item.type === 'multi' || item.type === 'match' || item.type === 'order' || item.type === 'cloze' || item.type === 'numeric') {
          return gradeNew(item, input);
        }
        if (input.rating !== 'known' && input.rating !== 'again') return null;
        return { correct: input.rating === 'known', given: input.rating };
      }

      function gradeNew(item, input) {
        var seed = session.id + '|' + item.id;
        var r;
        if (item.type === 'multi') {
          var perm = shuffledIndexes(item.options.length, seed);
          if (!isIdList(input.ids, perm.length, true)) return null;
          var sel = input.ids.map(function (id) { return perm[id]; });
          var okM = dojo.call('checkMulti', { correct: item.correct, selected: sel });
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
          var lp = shuffledIndexes(item.pairs.length, seed + '|L');
          var rights = rightsOf(item);
          var rp = shuffledIndexes(rights.length, seed + '|R');
          if (!isIdList(input.mapping, rights.length, false) || input.mapping.length !== lp.length) return null;
          var mapping = [];
          input.mapping.forEach(function (rid, pos) { mapping[lp[pos]] = rp[rid]; });
          r = dojo.call('checkMatch', { pairCount: item.pairs.length, mapping: mapping });
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
          var op = orderPerm(item.steps.length, seed);
          if (!isIdList(input.sequence, op.length, true) || input.sequence.length !== op.length) return null;
          var seq = input.sequence.map(function (id) { return op[id]; });
          r = dojo.call('checkOrder', { stepCount: op.length, sequence: seq });
          return {
            correct: r.correct,
            given: seq.map(function (i, k) { return (k + 1) + '. ' + item.steps[i]; }).join('; '),
            detail: { firstWrong: r.firstWrong === undefined ? null : r.firstWrong }
          };
        }
        if (item.type === 'cloze') {
          var blanks = clozeBlanks(item);
          if (!Array.isArray(input.inputs) || input.inputs.length !== blanks.length) return null;
          if (!input.inputs.every(function (x) { return typeof x === 'string'; })) return null;
          r = dojo.call('checkCloze', { blanks: blanks, inputs: input.inputs, opts: normalizeOpts(item) });
          return { correct: r.correct, given: input.inputs.join(' | '), detail: { results: r.results } };
        }
        if (typeof input.text !== 'string') return null;
        r = dojo.call('checkNumeric', { answer: item.answer, tolerance: item.tolerance || 0, input: input.text });
        return { correct: r.correct, given: input.text, detail: { parsed: r.parsed === undefined ? null : r.parsed } };
      }

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

      // Writes for one scoped entity: {memberId: record} (possibly empty). A repeated wrong in the same session goes
      // through relearn so the entity drops once.
      function scopedWrites(item, e, correct, relearn) {
        var unit = scopedUnit[e];
        var args = {
          members: scopedMemberList(e), records: scopedRecords(e), now: now(), correct: correct,
          ladder: ladderForUnit(unit)
        };
        if (mode === 'placement') {
          args.mode = 'placement';
          args.known = correct;
          args.seed = hashString(session.seed + '|' + e).toString();
          return dojo.call('applyEntity', args);
        }
        var override = getUnitSettingsOverride(unit);
        args.dropOnWrong = override.dropOnWrong !== undefined ? override.dropOnWrong : unitConfig(unit).dropOnWrong;
        args.mode = relearn || entityWrong[e] ? 'relearn' : (mode === 'daily' ? 'answer' : 'practice');
        if (args.mode === 'relearn' && !correct) return {};
        return dojo.call('applyEntity', args);
      }

      // Records to store for one answer: {id: record} or null.
      function nextRecord(item, correct, relearn) {
        var se = scopedEntityOf[item.id];
        if (se !== undefined) return scopedWrites(item, se, correct, relearn);
        var one = nextItemRecord(item, correct, relearn);
        if (!one) return null;
        var out = {};
        out[item.id] = one;
        return out;
      }

      function nextItemRecord(item, correct, relearn) {
        var rec = records()[item.id];
        var ladder = itemLadderFor(item);
        var base = { rec: rec === undefined ? null : rec, now: now(), ladder: ladder };
        if (mode === 'placement') {
          var known = correct;
          var itemSeed = hashString(session.seed + '|' + item.id).toString();
          return dojo.call('applyPlacement', { rec: rec === undefined ? null : rec, known: known, now: now(), ladder: ladder, seed: itemSeed });
        }
        if (relearn) {
          if (!correct || !rec || rec.s !== 0) return null;
          return dojo.call('applyRelearn', base);
        }
        base.correct = correct;
        base.drop = dropForItem(item);
        return dojo.call(mode === 'daily' ? 'applyAnswer' : 'applyPractice', base);
      }

      function commit(item, writes, countsNew) {
        var day = today();
        store.update(function (doc) {
          if (writes) {
            doc.items = doc.items || {};
            Object.keys(writes).forEach(function (id) { doc.items[id] = writes[id]; });
          }
          if (mode === 'placement') return;
          doc.stats = doc.stats || {};
          doc.stats.days = doc.stats.days || {};
          doc.stats.days[day] = (doc.stats.days[day] || 0) + 1;
          if (countsNew) {
            doc.stats.newByDay = ensureObject(doc.stats.newByDay);
            doc.stats.newByDay[day] = (doc.stats.newByDay[day] || 0) + 1;
            var gid = unitGroup[item.unit];
            if (gid !== undefined) {
              var mates = entityMembers[itemEntities[item.id]] || [];
              var started = scopedEntityOf[item.id] === undefined && mates.some(function (m) { return m !== item.id && doc.items && doc.items[m] !== undefined; });
              if (!started) {
                var gKey = GROUP_NEW_PREFIX + gid;
                doc.stats[gKey] = ensureObject(doc.stats[gKey]);
                doc.stats[gKey][day] = (doc.stats[gKey][day] || 0) + 1;
              }
            }
            if (item.unit) {
              var unitKey = UNIT_NEW_PREFIX + item.unit;
              doc.stats[unitKey] = ensureObject(doc.stats[unitKey]);
              doc.stats[unitKey][day] = (doc.stats[unitKey][day] || 0) + 1;
            }
          }
        });
        if (mode !== 'placement') store.noteAnswer();
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
              verdict = gradeInput(item, input);
              if (!verdict) return { error: 'bad_input' };
              // For gap retry: in placement check mode, treat retry as wrong (no retry allowed)
              if (verdict.verdict === 'retry') {
                verdict = { correct: false, given: verdict.given };
              }
              var known = verdict.correct;
              rec = nextRecord(item, known, relearn);
              verdict = Object.assign({}, verdict, { known: known });
            } else {
              // Self mode: original behavior
              var rating = input && input.rating;
              if (rating !== 'known' && rating !== 'again') return { error: 'bad_input' };
              var known = rating === 'known';
              rec = nextRecord(item, known, relearn);
              verdict = { correct: known, given: known ? 'known' : 'unknown', known: known };
            }
          } else {
            verdict = gradeInput(item, input);
            if (!verdict) return { error: 'bad_input' };
            // For gap retry: don't record, don't advance, don't mark as answered
            if (verdict.verdict === 'retry' && mode === 'exam' && !session.training) {
              verdict = { correct: false, given: verdict.given };
            } else if (verdict.verdict === 'retry') {
              return { verdict: 'retry', retry: true, expected: expectedFor(item), explanation: item.explanation || null };
            }
            rec = nextRecord(item, verdict.correct, relearn);
          }
        } catch (e) {
          return { error: 'engine' };
        }
        return applyVerdict(item, verdict, rec, prev, relearn, isNewRecord);
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
          rec = nextRecord(item, false, relearn);
        } catch (e) {
          return { error: 'engine' };
        }
        return applyVerdict(item, verdict, rec, prev, relearn, isNewRecord);
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

      function applyVerdict(item, verdict, rec, prev, relearn, isNewRecord) {
        commit(item, rec, mode === 'daily' && !relearn && isNewRecord);
        var setWrong = false;
        var se = scopedEntityOf[item.id];
        if (se !== undefined && mode !== 'placement' && !verdict.correct && !entityWrong[se]) {
          entityWrong[se] = true;
          setWrong = true;
        }
        answeredAt[session.index] = true;
        session.answered++;
        var pushed = false;
        if (!relearn && mode !== 'placement') pushed = recordGrade(item, verdict);
        lastAnswer = mode === 'placement' ? null : { index: session.index, item: item, prev: prev, relearn: relearn, verdict: verdict, pushed: pushed, setWrong: setWrong };
        if (isTimedExam) {
          draftAnswers[session.index] = { i: session.index, c: !!verdict.correct, g: stableGiven(verdict.given) };
          saveDraft(true);
        }
        return result(item, verdict);
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
        var la = lastAnswer;
        if (!la || la.index !== session.index || la.verdict.correct) return false;
        if (mode === 'exam' || mode === 'placement' || course.allowOverride === false) return false;
        if (la.verdict.dontKnow) return false;
        return TYPED.indexOf(la.item.type) >= 0;
      };

      session.overrideLast = function () {
        if (!session.canOverride()) return { error: 'no_override' };
        var la = lastAnswer;
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
          rec = nextRecord(item, true, la.relearn);
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
        lastAnswer = null;
        return result(item, verdict);
      };

      function enterGroup(g) {
        groupIdx = g;
        session.group = { index: g, count: groups.length };
        session.deadline = now() + groups[g].minutes * 60000;
        saveDraft(true);
      }

      session.next = function () {
        if (session.index < queue.length) session.index++;
        revealed = false;
        session.done = session.index >= queue.length;
        if (groups && !session.done && groupIdx + 1 < groups.length && session.index >= groups[groupIdx + 1].start) {
          enterGroup(groupIdx + 1);
        } else {
          saveDraft(false);
        }
        return session.current();
      };

      function skipRange(from, to) {
        for (var k = from; k < to; k++) {
          if (!answeredAt[k]) skipped.push(queue[k]);
        }
      }

      session.expire = function () {
        var out = { jumped: false, finished: false };
        if (session.deadline === undefined || session.done || now() < session.deadline) return out;
        if (!groups) {
          skipRange(session.index, queue.length);
          session.index = queue.length;
          session.done = true;
          out.finished = true;
          return out;
        }
        while (now() >= session.deadline) {
          if (groupIdx + 1 >= groups.length) {
            skipRange(session.index, queue.length);
            session.index = queue.length;
            session.done = true;
            out.finished = true;
            return out;
          }
          skipRange(session.index, Math.min(groups[groupIdx + 1].start, queue.length));
          session.index = groups[groupIdx + 1].start;
          revealed = false;
          enterGroup(groupIdx + 1);
          out.jumped = true;
        }
        return out;
      };

      session.release = function () {
        if (lockHolder) releaseLock(lockHolder);
      };

      session.abandon = function () {
        if (!isTimedExam || draftClosed) return;
        store.update(function (doc) { closeDraft(doc, 'abandoned'); });
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

      function examSummary(sum) {
        var results = plan.ids.map(function (id) { return { id: id, correct: graded[id] === true }; });
        var exam = plan.exam;
        var args = { results: results, total: plan.ids.length };
        if (typeof exam.passMark === 'number') args.passMark = exam.passMark;
        if (exam.pass !== undefined) args.pass = exam.pass;
        if (exam.scoring && exam.scoring.length) {
          args.scoring = exam.scoring;
          args.sections = plan.sections;
          if (exam.passPoints !== undefined && exam.passPoints !== null) args.passPoints = exam.passPoints;
        }
        var scored = dojo.call('score', args);
        sum.raw = scored.raw;
        sum.fraction = scored.fraction;
        sum.pass = scored.pass;
        sum.short = plan.warnings || [];
        if (scored.parts && scored.parts.length) {
          sum.parts = scored.parts;
          sum.totalPoints = scored.totalPoints;
          if (args.passPoints !== undefined) sum.passPoints = args.passPoints;
        }
        if (exam.note) sum.note = exam.note;
        if (plan.examId !== undefined) sum.examId = plan.examId;
        if (session.training) sum.training = true;
        if (scored.estimate === true) sum.estimate = true;
        return scored;
      }

      function storeExam(scored, alsoClose) {
        var entry = { date: today(), raw: scored.raw, total: scored.total, fraction: scored.fraction, pass: scored.pass, mode: 'exam' };
        if (plan.examId !== undefined) entry.examId = plan.examId;
        if (scored.parts && scored.parts.length) {
          entry.parts = scored.parts;
          entry.totalPoints = scored.totalPoints;
        }
        if (scored.estimate === true) entry.estimate = true;
        var key = 'exam-' + now();
        var sid = session.id;
        var blocked = false;
        store.update(function (doc) {
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

      session.finish = function () {
        if (summary) return summary;
        var sum = baseSummary();
        if (mode === 'exam') {
          var scored;
          try {
            scored = examSummary(sum);
          } catch (e) {
            return { error: 'engine' };
          }
          if (!session.training) {
            var result = storeExam(scored, isTimedExam);
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
        summary = sum;
        return summary;
      };

      if (resume) {
        resume.answers.slice().sort(function (x, y) { return x.i - y.i; }).forEach(function (ans) {
          var rid = queue[ans.i];
          answeredAt[ans.i] = true;
          graded[rid] = ans.c;
          review.push({ id: rid, correct: ans.c, given: ans.g === undefined ? '' : ans.g, expected: expectedFor(byId[rid]) });
          draftAnswers[ans.i] = ans.g === undefined ? { i: ans.i, c: ans.c } : { i: ans.i, c: ans.c, g: ans.g };
        });
        if (groups) skipRange(0, groups[groupIdx].start);
        session.index = resume.index;
        while (session.index < queue.length && answeredAt[session.index]) session.index++;
        session.done = session.index >= queue.length;
        if (groups && !session.done && groupIdx + 1 < groups.length && session.index >= groups[groupIdx + 1].start) {
          enterGroup(groupIdx + 1);
        }
        session.expire();
      }
      saveDraft(true);

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

    function isInt(n, lo, hi) {
      return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi;
    }

    function validateDraft(draft, exam) {
      if (!draft || typeof draft !== 'object' || draft.closed !== undefined) return false;
      if (typeof draft.sid !== 'string' || !draft.sid) return false;
      if (!exam || !exam.sections || draft.examId !== exam.id) return false;
      if (!Array.isArray(draft.ids) || !draft.ids.length || draft.ids.length > MAX_IDS_COUNT) return false;
      for (var i = 0; i < draft.ids.length; i++) {
        if (typeof draft.ids[i] !== 'string' || !byId[draft.ids[i]]) return false;
      }
      if (!Array.isArray(draft.sections) || draft.sections.length !== exam.sections.length) return false;
      for (var j = 0; j < draft.sections.length; j++) {
        var sec = draft.sections[j];
        if (!sec || typeof sec.title !== 'string' || !isInt(sec.start, 0, draft.ids.length) || !isInt(sec.count, 0, draft.ids.length)) return false;
      }
      var groups = timingGroups(exam, draft.sections);
      if (!groups && !exam.minutes) return false;
      var n = groups ? groups.length : 1;
      if (!Array.isArray(draft.remainingMs) || draft.remainingMs.length !== n) return false;
      var maxMs = exam.minutes ? exam.minutes * 60000 : 0;
      for (var k = 0; k < n; k++) {
        var limitMs = groups ? groups[k].minutes * 60000 : maxMs;
        if (typeof draft.remainingMs[k] !== 'number' || !isFinite(draft.remainingMs[k]) || draft.remainingMs[k] < 0) return false;
        if (draft.remainingMs[k] > limitMs) draft.remainingMs[k] = limitMs;
      }
      if (!isInt(draft.group, 0, n - 1)) return false;
      if (!isInt(draft.index, 0, draft.ids.length)) return false;
      if (typeof draft.elapsedMs !== 'number' || !isFinite(draft.elapsedMs) || draft.elapsedMs < 0) return false;
      if (typeof draft.startedAt !== 'number' || typeof draft.updatedAt !== 'number') return false;
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
