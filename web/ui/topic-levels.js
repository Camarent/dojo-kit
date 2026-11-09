/*
 * ui/topic-levels.js — Per-aspect levels and one combined level for the topic of a catalog item.
 * Globals expected: preact, htm.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  // Aspect rules of the course in declared order; unknown aspects sort after them, then by id.
  function orderedAspects(course, ids) {
    var rules = (course.topics && Array.isArray(course.topics.aspects)) ? course.topics.aspects : [];
    function rank(id) {
      for (var i = 0; i < rules.length; i++) if (rules[i] && rules[i].id === id) return i;
      return rules.length;
    }
    return ids.slice().sort(function (a, b) { return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0); });
  }

  // Title of an aspect from its course rule; the aspect id when the rule has no title.
  function aspectTitle(course, id) {
    var rules = (course.topics && Array.isArray(course.topics.aspects)) ? course.topics.aspects : [];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i] && rules[i].id === id && typeof rules[i].title === 'string' && rules[i].title !== '') return rules[i].title;
    }
    return id;
  }

  // Rows and combined level for the topic of `entity`; null when the course has no topics or the topic has no items.
  // tl: {levels: {entity: {aspects, level}}, aspects: {entity: [aspect ids]}} from the counts module.
  function topicLevelRows(course, entity, tl) {
    if (!course || !course.topics || !tl || !tl.aspects || !tl.aspects[entity]) return null;
    var entry = (tl.levels && tl.levels[entity]) || null;
    var stages = entry ? entry.aspects : {};
    var rows = orderedAspects(course, tl.aspects[entity]).map(function (id) {
      return { id: id, title: aspectTitle(course, id), level: Object.prototype.hasOwnProperty.call(stages, id) ? stages[id] : null };
    });
    return { rows: rows, level: entry ? entry.level : null };
  }

  // Block with one row per aspect (stage, or 'new' when never started) and the combined level (min). null when no topic data.
  function renderTopicLevels(course, entity, tl, t) {
    var v = topicLevelRows(course, entity, tl);
    if (!v) return null;
    var newWord = t('catalog.stage.new');
    return html`<section class="topic-levels" data-testid="topic-levels">
      <p class="muted"><b>${t('catalog.topicLevels')}:</b></p>
      <ul>${v.rows.map(function (r) {
        return html`<li data-testid=${'topic-level-' + r.id}>${r.title}: ${r.level === null ? newWord : String(r.level)}</li>`;
      })}</ul>
      <p class="muted" data-testid="topic-level-combined"><b>${t('catalog.topicLevel')}:</b> ${v.level === null ? newWord : String(v.level)}</p>
    </section>`;
  }

  var api = { topicLevelRows: topicLevelRows, renderTopicLevels: renderTopicLevels };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoTopicLevels = api;
})(typeof self !== 'undefined' ? self : this);
