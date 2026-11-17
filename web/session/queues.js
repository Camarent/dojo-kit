/* session/queues.js — queue building (daily, practice, weak, placement), group caps and new-item allowance of the study session engine.
 * Exports DojoSessionQueues: create(ctx) -> api.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);
  var isRetired = util.isRetired;
  var UNIT_NEW_PREFIX = util.K.UNIT_NEW_PREFIX;
  var GROUP_NEW_PREFIX = util.K.GROUP_NEW_PREFIX;
  var SESSION_PREFIX = 'session:';
  var DEFAULT_NEW_PER_DAY = util.K.DEFAULT_NEW_PER_DAY;
  var weighted = root.DojoSessionWeightedQueue || (typeof require === 'function' ? require('./weighted-queue.js') : null);
  var topicsMod = root.DojoSessionTopics || (typeof require === 'function' ? require('./topics.js') : null);
  var pick = root.DojoSessionQueuesPick || (typeof require === 'function' ? require('./queues-pick.js') : null);

  // Each group fills the shared bag h from ctx; calls go through h at call time.
  function scopeHelpers(ctx, h) {
    var byId = ctx.byId;
    h.scopedArgs = function () {
      return ctx.hasScope ? { scopedMembers: ctx.scopedMembers } : null;
    };
    // Members of a scoped key: an entity, or a unit key under srs.scope "unit".
    function membersOf(e) { return ctx.entityMembers[e] || ctx.scopedMembers[e]; }
    h.scopedRecords = function (e) {
      var recs = ctx.fn.records();
      var out = {};
      membersOf(e).forEach(function (id) { if (recs[id] !== undefined) out[id] = recs[id]; });
      return out;
    };
    h.scopedMemberList = function (e) {
      return membersOf(e).map(function (id) { return { id: id, retired: isRetired(byId[id]) }; });
    };
    h.entityViewOf = function (e) {
      return ctx.dojo.call('entityView', { members: h.scopedMemberList(e), records: h.scopedRecords(e) });
    };
  }

  function groupCapHelpers(ctx, h) {
    var store = ctx.store;
    h.groupCap = function (g) {
      var o = ctx.fn.groupSettings(g.id);
      if (o.newPerDay !== undefined) return o.newPerDay;
      return typeof g.newPerDay === 'number' ? g.newPerDay : null;
    };
    h.groupOrder = function (g) {
      var o = ctx.fn.groupSettings(g.id);
      return o.newOrder !== undefined ? o.newOrder : (g.newOrder || 'file');
    };
    h.dayStat = function (key) {
      return (((store.doc.stats || {})[key]) || {})[ctx.today()] || 0;
    };
    h.extraNewToday = function () {
      return h.dayStat('extraNewByDay');
    };
    h.extraGroup = function () {
      for (var i = 0; i < ctx.groupList.length; i++) if (ctx.groupList[i].extraNew === true) return ctx.groupList[i];
      return null;
    };
    h.groupUsed = function () {
      var used = {};
      ctx.groupList.forEach(function (g) { used[GROUP_NEW_PREFIX + g.id] = h.dayStat(GROUP_NEW_PREFIX + g.id); });
      return used;
    };
    // Items introduced today in capped groups do not consume the allowance of ungrouped units.
    h.groupedItemsUsedToday = function () {
      var n = 0;
      ctx.groupList.forEach(function (g) {
        if (h.groupCap(g) === null) return;
        (g.units || []).forEach(function (u) { if (ctx.unitGroup[u] === g.id) n += h.dayStat(UNIT_NEW_PREFIX + u); });
      });
      return n;
    };
  }

  function allowanceHelpers(ctx, h) {
    var store = ctx.store;
    h.groupQueueArgs = function () {
      var caps = {};
      var units = {};
      var random = [];
      ctx.groupList.forEach(function (g) {
        var cap = h.groupCap(g);
        if (cap === null) return;
        caps[g.id] = cap;
        units[g.id] = (g.units || []).filter(function (u) { return ctx.unitGroup[u] === g.id; });
        if (h.groupOrder(g) === 'random') random.push(g.id);
      });
      if (!Object.keys(caps).length) return null;
      return { itemEntities: ctx.itemEntities, groupNewCaps: caps, groupUnits: units, randomGroups: random, used: h.groupUsed(), day: ctx.today(), courseId: ctx.course.id || '' };
    };
    // User-level daily new-item cap (applies to units whose course sets no cap).
    h.globalNewPerDay = function () {
      var settings = store.doc.settings || {};
      return typeof settings.newPerDay === 'number' ? settings.newPerDay : DEFAULT_NEW_PER_DAY;
    };
    h.newAllowance = function () {
      var doc = store.doc;
      var today = ctx.today();
      var perDay = h.globalNewPerDay();
      var used = (doc.stats && doc.stats.newByDay && doc.stats.newByDay[today]) || 0;
      var extra = (doc.stats && doc.stats.extraNewByDay && doc.stats.extraNewByDay[today]) || 0;
      if (ctx.groupList.length) {
        used = Math.max(0, used - h.groupedItemsUsedToday());
        if (h.extraGroup() && h.groupCap(h.extraGroup()) !== null) extra = 0;
      }
      return Math.max(0, perDay + extra - used);
    };
  }

  function unitHelpers(ctx, h) {
    var store = ctx.store;
    h.buildUnitNewCaps = function () {
      var caps = {};
      var units = ctx.course.units || [];
      units.forEach(function (unit) {
        var effectiveCap = ctx.fn.unitConfig(unit.id).newPerDay;
        var override = ctx.fn.getUnitSettingsOverride(unit.id);
        if (override.newPerDay !== undefined) effectiveCap = override.newPerDay;
        if (effectiveCap !== null) {
          var usedToday = (((store.doc.stats || {})[UNIT_NEW_PREFIX + unit.id]) || {})[ctx.today()] || 0;
          caps[unit.id] = Math.max(0, Math.floor(effectiveCap) - usedToday);
        }
      });
      return caps;
    };
    h.buildItemUnits = function () {
      var map = {};
      ctx.items.forEach(function (item) {
        if (item.unit) {
          map[item.id] = item.unit;
        }
      });
      return map;
    };
    h.resolveNewOrder = function (unit) {
      if (!unit) return 'file';
      var override = ctx.fn.getUnitSettingsOverride(unit.id);
      return override.newOrder !== undefined ? override.newOrder : ctx.fn.unitConfig(unit.id).newOrder;
    };
    // Items of ids outside examOnly units; ids itself when that leaves nothing.
    h.preferShared = function (ids) {
      var eo = {};
      (ctx.course.units || []).forEach(function (u) { if (u.examOnly === true) eo[u.id] = true; });
      var unitOf = {};
      ctx.items.forEach(function (it) { unitOf[it.id] = it.unit; });
      var shared = h.sharedWithLinked(ids, eo, unitOf);
      return shared.length > 0 ? shared : ids;
    };
    h.unitIsExamOnly = function (unitId) {
      return (ctx.course.units || []).some(function (u) { return u.id === unitId && u.examOnly === true; });
    };
  }

  // Drops onlyTags-excluded ids from a built queue after selection, so caps and refills see the full order.
  function withoutOnlyTags(ctx, q) {
    return Object.assign({}, q, { due: ctx.fn.onlyTagsKeep(q.due), fresh: ctx.fn.onlyTagsKeep(q.fresh) });
  }

  // Courses with srs.scope "unit" build the daily queue in core (buildSession); other courses keep buildQueue.
  function sessionHelpers(ctx, h) {
    var unitSession = null;
    h.hasUnitSession = function () {
      if (unitSession === null) unitSession = (ctx.course.units || []).some(function (u) { return ctx.fn.unitConfig(u.id).scope === 'unit'; });
      return unitSession;
    };
    // buildSession {queue, plan}: course session block, session:* settings overrides, answer times of the stats.
    // Valid stored session:* values only; what the settings screen shows as the saved choice.
    h.sessionOverrides = function () { return sessionOverrides(ctx.store.doc.settings); };
    h.sessionPlan = function () {
      var filter = h.weakFilter();
      var doc = ctx.store.doc;
      var stats = doc.stats || {};
      var overrides = sessionOverrides(doc.settings);
      var meta = ctx.items.map(function (it) {
        return { id: it.id, unit: it.unit, entity: ctx.itemEntities[it.id], tags: it.tags || [], retired: isRetired(it) };
      });
      return ctx.dojo.call('buildSession', {
        units: ctx.course, items: meta, records: ctx.fn.records(), settings: ctx.course.session, overrides: overrides,
        now: ctx.now(), daysLeft: util.K.SESSION_DAYS_LEFT, courseId: ctx.course.id || '',
        introducedToday: (stats.newByDay || {})[ctx.today()] || 0, answerMs: stats.answerMs, filter: filter
      });
    };
    // {due, fresh} of the built session: an id is fresh when no member of its unit has a record.
    h.sessionQueue = function () {
      var out = { due: [], fresh: [] };
      h.sessionPlan().queue.forEach(function (id) {
        var se = ctx.scopedEntityOf[id];
        var rec = se !== undefined ? h.entityViewOf(se) : ctx.fn.records()[id];
        (ctx.dojo.call('isNew', { rec: rec }) ? out.fresh : out.due).push(id);
      });
      return out;
    };
  }

  function queueHelpers(ctx, h) {
    h.rawBuiltQueue = function (sharedOnly, uncapped) {
      if (h.hasUnitSession()) return h.sessionQueue();
      var order = ctx.fn.activeItems().map(function (it) { return it.id; });
      if (sharedOnly) order = h.preferShared(order);
      order = pick.shuffleRandomUnits(ctx, h, order);
      var args = { items: ctx.fn.records(), order: order, now: ctx.now(), newAllowance: h.newAllowance(), unitNewCaps: h.buildUnitNewCaps(), itemUnits: h.buildItemUnits() };
      var ta = h.topicArgs(uncapped); if (ta) { args.topics = ta; args.itemEntities = ctx.itemEntities; args.records = args.items; }
      var sa = h.scopedArgs();
      if (sa) args.scopedMembers = sa.scopedMembers;
      var ga = h.groupQueueArgs();
      if (!ga) return withoutOnlyTags(ctx, ctx.dojo.call('buildQueue', args));
      Object.keys(ga).forEach(function (k) { args[k] = ga[k]; });
      return withoutOnlyTags(ctx, pick.queueWithExtraNew(ctx, h, args, order));
    };
    // Queue without examOnly items unless that would leave the whole queue empty. uncapped: see topicArgs.
    h.builtQueue = function (uncapped) {
      var q = h.rawBuiltQueue(true, uncapped);
      if (q.due.length + q.fresh.length > 0) return q;
      return h.rawBuiltQueue(false, uncapped);
    };
    h.dailyQueue = function (groupId) {
      var q = h.builtQueue();
      var ids = q.due.concat(q.fresh);
      if (ctx.fn.mixDaily) ids = ctx.fn.mixDaily(ids, q.fresh, groupId);
      if (groupId === undefined || groupId === null) return ids;
      var unitOf = {};
      ctx.items.forEach(function (it) { unitOf[it.id] = it.unit; });
      function inGroup(id) { return ctx.unitGroup[unitOf[id]] === groupId; }
      var got = ids.filter(inGroup);
      if (got.length) return got;
      var raw = h.rawBuiltQueue(false);
      return raw.due.concat(raw.fresh).filter(inGroup);
    };
  }

  // Stored session:* values core would reject (wrong type or range) are dropped, so buildSession uses the default.
  var SESSION_KINDS = ['weak', 'new', 'due'];
  function isWhole(v) { return Number.isInteger(v) && v >= 0; }
  var SESSION_RULES = {
    sessionMode: function (v) { return v === 'auto' || v === 'manual'; },
    sessionMix: function (v) { return Array.isArray(v) && v.length > 0 && v.every(function (k) { return SESSION_KINDS.indexOf(k) >= 0; }); },
    knownDistinct: function (v) { return Number.isInteger(v) && v >= 1; },
    sessionCap: isWhole,
    dailyMinutes: isWhole,
    sessionMax: isWhole,
    reviewDays: isWhole,
    perUnitMax: isWhole,
    repeatMax: isWhole,
  };
  function sessionOverrides(settings) {
    var out = {};
    Object.keys(settings || {}).forEach(function (k) {
      if (k.indexOf(SESSION_PREFIX) !== 0) return;
      var name = k.slice(SESSION_PREFIX.length);
      if (!Object.prototype.hasOwnProperty.call(SESSION_RULES, name)) return;
      if (SESSION_RULES[name](settings[k])) out[k] = settings[k];
    });
    return out;
  }

  function create(ctx) {
    var h = {};
    scopeHelpers(ctx, h);
    groupCapHelpers(ctx, h);
    allowanceHelpers(ctx, h);
    unitHelpers(ctx, h);
    sessionHelpers(ctx, h);
    queueHelpers(ctx, h);
    weighted.practiceHelpers(ctx, h);
    weighted.weakHelpers(ctx, h);
    topicsMod.topicHelpers(ctx, h);
    return h;
  }

  var api = { create: create, sessionOverrides: sessionOverrides };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionQueues = api;
})(typeof self !== 'undefined' ? self : this);
