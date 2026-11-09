/* session/topics.js — topic review for the study session engine: one item per topic in the daily queue (contract: topic rule).
 * Exports DojoSessionTopics: topicHelpers(ctx, h) adds h.topicArgs(uncapped) -> null | {aspects, cap}, h.topicsSessionCap() -> n | null,
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
    h.topicArgs = function (uncapped) {
      if (!ctx.course.topics) return null;
      return { aspects: aspectsOfCourse(), cap: uncapped ? null : h.topicsSessionCap() };
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
