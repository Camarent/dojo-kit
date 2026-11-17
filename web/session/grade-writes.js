/* session/grade-writes.js — record writes of a study session: scoped-entity records and the stored answer commit.
 * Exports DojoSessionGradeWrites: { scopedWrites(g, spec), commit(g, spec) }; g = { ctx, sx }.
 */
(function (root) {
  'use strict';

  var util = root.DojoSessionUtil || (typeof require === 'function' ? require('./util.js') : null);

  // Writes for one scoped entity: {memberId: record} (possibly empty). A repeated wrong in the same session goes
  // through relearn so the entity drops once.
  // spec: { entity, correct, relearn, answeredId }; answeredId is the member the learner answered; core puts qok/qbad/qlast on it.
  function scopedWrites(g, spec) {
    var ctx = g.ctx;
    var sx = g.sx;
    var e = spec.entity;
    var unit = ctx.scopedUnit[e];
    var cfg = ctx.fn.unitConfig(unit);
    var args = {
      members: ctx.fn.scopedMemberList(e), records: ctx.fn.scopedRecords(e), now: ctx.now(), correct: spec.correct,
      ladder: ctx.fn.ladderForUnit(unit), jumpTo: cfg.jumpTo, wrongFloor: cfg.wrongFloor, answered: spec.answeredId
    };
    if (sx.mode === 'placement') {
      args.mode = 'placement';
      args.known = spec.correct;
      args.seed = util.hashString(sx.session.seed + '|' + e).toString();
      return ctx.dojo.call('applyEntity', args);
    }
    var override = ctx.fn.getUnitSettingsOverride(unit);
    args.dropOnWrong = override.dropOnWrong !== undefined ? override.dropOnWrong : cfg.dropOnWrong;
    args.mode = spec.relearn || sx.entityWrong[e] ? 'relearn' : (sx.mode === 'daily' ? 'answer' : 'practice');
    if (args.mode === 'relearn' && !spec.correct) return {};
    return ctx.dojo.call('applyEntity', args);
  }

  function bumpCounter(stats, key, day) {
    stats[key] = util.ensureObject(stats[key]);
    stats[key][day] = (stats[key][day] || 0) + 1;
  }

  function groupStarted(ctx, doc, item) {
    var mates = ctx.entityMembers[ctx.itemEntities[item.id]] || [];
    return ctx.scopedEntityOf[item.id] === undefined && mates.some(function (m) { return m !== item.id && doc.items && doc.items[m] !== undefined; });
  }

  function countNewItem(ctx, doc, item, day) {
    doc.stats.newByDay = util.ensureObject(doc.stats.newByDay);
    doc.stats.newByDay[day] = (doc.stats.newByDay[day] || 0) + 1;
    var gid = ctx.unitGroup[item.unit];
    if (gid !== undefined && !groupStarted(ctx, doc, item)) bumpCounter(doc.stats, util.K.GROUP_NEW_PREFIX + gid, day);
    if (item.unit) bumpCounter(doc.stats, util.K.UNIT_NEW_PREFIX + item.unit, day);
  }

  // spec: { item, writes, countsNew, ms }; writes: {id: record} or null; ms: answer duration or undefined.
  function commit(g, spec) {
    var ctx = g.ctx;
    var sx = g.sx;
    var day = ctx.today();
    var writes = spec.writes;
    ctx.store.update(function (doc) {
      if (writes) {
        doc.items = doc.items || {};
        Object.keys(writes).forEach(function (id) { doc.items[id] = writes[id]; });
      }
      if (sx.mode === 'placement') return;
      doc.stats = doc.stats || {};
      doc.stats.days = doc.stats.days || {};
      doc.stats.days[day] = (doc.stats.days[day] || 0) + 1;
      if (spec.ms !== undefined) doc.stats.answerMs = ctx.dojo.call('pushAnswerMs', { durations: doc.stats.answerMs, ms: spec.ms });
      if (spec.countsNew) countNewItem(ctx, doc, spec.item, day);
    });
    if (sx.mode !== 'placement') ctx.store.noteAnswer();
  }

  var api = { scopedWrites: scopedWrites, commit: commit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionGradeWrites = api;
})(typeof self !== 'undefined' ? self : this);
