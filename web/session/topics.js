/* session/topics.js — topic review for the study session engine: one item per topic in the daily queue (contract: topic rule).
 * Exports DojoSessionTopics: topicHelpers(ctx, h) adds h.topicArgs(uncapped) -> null | {aspects, pools, cap}, h.topicsSessionCap() -> n | null,
 *   h.sharedWithLinked(ids, examOnlyUnits, unitOf) -> ids.
 */
(function (root) {
  'use strict';

  // Positive integer cap or null (0 and non-numbers mean unlimited).
  function capOf(n) {
    return typeof n === 'number' && n >= 1 ? Math.floor(n) : null;
  }

  function topicHelpers(ctx, h) {
    var aspects = null;

    function aspectsOfCourse() {
      if (!aspects) {
        var items = ctx.items.map(function (it) { return { id: it.id, unit: it.unit, tags: it.tags || [] }; });
        aspects = ctx.dojo.call('itemAspects', { course: ctx.course, items: items });
      }
      return aspects;
    }

    // Settings value wins when it is a number (0 = unlimited); otherwise the course value.
    h.topicsSessionCap = function () {
      var s = (ctx.store.doc.settings || {})['topics:sessionCap'];
      if (typeof s === 'number') return capOf(s);
      return capOf((ctx.course.topics || {}).sessionCap);
    };
    // uncapped: cap null, the home count (one item per topic over the whole queue, not one session).
    // pools: course topics.poolAspects (aspect ids that keep one item per topic each); [] when absent.
    h.topicArgs = function (uncapped) {
      if (!ctx.course.topics) return null;
      return { aspects: aspectsOfCourse(), pools: ctx.course.topics.poolAspects || [], cap: uncapped ? null : h.topicsSessionCap() };
    };
    // Keeps the first id of each topic x aspect pool (pool aspects only); ids unchanged without poolAspects.
    h.poolFilter = function (ids) {
      var pools = ctx.course.topics && ctx.course.topics.poolAspects;
      if (!pools || pools.length === 0) return ids;
      var asp = aspectsOfCourse();
      var seen = {};
      return ids.filter(function (id) {
        if (pools.indexOf(asp[id]) < 0) return true;
        var key = ctx.itemEntities[id] + '|' + asp[id];
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
    };
    // Shared ids, plus examOnly ids whose topic (entity) also has a shared id; with topics only.
    h.sharedWithLinked = function (ids, examOnlyUnits, unitOf) {
      var shared = ids.filter(function (id) { return !examOnlyUnits[unitOf[id]]; });
      if (!ctx.course.topics) return shared;
      var sharedEntity = {};
      shared.forEach(function (id) { sharedEntity[ctx.itemEntities[id]] = true; });
      return ids.filter(function (id) {
        return !examOnlyUnits[unitOf[id]] || sharedEntity[ctx.itemEntities[id]] === true;
      });
    };
  }

  var api = { topicHelpers: topicHelpers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionTopics = api;
})(typeof self !== 'undefined' ? self : this);
