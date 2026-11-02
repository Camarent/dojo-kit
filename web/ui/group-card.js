/*
 * ui/group-card.js — GroupCard component (one exam group on the Home screen).
 * Extracted from ui/home.js. Exposed as root.DojoGroupCard, or module.exports under node.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  var DojoSession = root.DojoSession || (typeof require !== 'undefined' ? require('./session.js') : null) || {};
  var DojoCommon = root.DojoCommon || (typeof require !== 'undefined' ? require('./common.js') : null) || {};

  var renderText = DojoCommon.renderText;

  // Use tagInfo from DojoSession if available, otherwise define it
  var tagInfo = DojoSession.tagInfo || function(course, tag) {
    var e = course && course.tagLabels && Object.prototype.hasOwnProperty.call(course.tagLabels, tag) ? course.tagLabels[tag] : null;
    var label = typeof e === 'string' ? e : e && typeof e.label === 'string' ? e.label : '';
    return { label: label || String(tag).toUpperCase(), internal: !!(e && typeof e === 'object' && e.kind === 'internal') };
  };

  function countsOf(g) {
    return { total: g.total || 0, due: g.due || 0, fresh: g.fresh || 0, newToday: g.newToday || 0 };
  }

  function extraNewButtons(p, g) {
    return html`<div class="row wrap extra-new-buttons" data-testid=${'group-' + g.id + '-extra'}>
          <button type="button" class="btn small" data-testid=${'btn-extra-5-' + g.id} onClick=${function () { p.onMoreNew(5); }}>${p.t('home.moreNew', { n: 5 })}</button>
          <button type="button" class="btn small" data-testid=${'btn-extra-10-' + g.id} onClick=${function () { p.onMoreNew(10); }}>${p.t('home.moreNew', { n: 10 })}</button>
          <button type="button" class="btn small" data-testid=${'btn-extra-20-' + g.id} onClick=${function () { p.onMoreNew(20); }}>${p.t('home.moreNew', { n: 20 })}</button>
        </div>`;
  }

  function randomToggle(p, g, label) {
    return html`<label class="chip toggles" data-testid=${'toggle-random-' + g.id}>
          <input type="checkbox"
            checked=${g.extraRandom === true}
            id=${'group-toggle-random-' + g.id}
            aria-label=${label}
            name=${'random-' + g.id}
            onChange=${function () { p.onGroupSetting(g.id, 'extraRandom', g.extraRandom === true ? null : true); }} />
          <span>${label}</span>
        </label>`;
  }

  function onlyTagsToggle(p, g, label) {
    return html`<label class="chip toggles" data-testid=${'toggle-onlyTags-' + g.id}>
          <input type="checkbox"
            checked=${g.onlyTags === true}
            id=${'group-toggle-onlyTags-' + g.id}
            aria-label=${label}
            name=${'onlyTags-' + g.id}
            onChange=${function () { p.onGroupSetting(g.id, 'onlyTags', g.onlyTags === true ? null : true); }} />
          <span>${label}</span>
        </label>`;
  }

  function GroupCard(p) {
    var t = p.t;
    var g = p.group;
    var isExtraNew = g.extraNew === true;
    var hasTags = !!(g.extraTags && g.extraTags.length > 0);
    var c = countsOf(g);
    var canStart = c.due + c.newToday > 0;
    var randomLabel = t('home.group.randomOrder');
    var onlyTagsLabel = hasTags
      ? t('home.group.onlyTags', { tag: g.extraTags.map(function (tag) { return tagInfo({ tagLabels: p.tagLabels }, tag).label; }).join(', ') })
      : '';
    return html`<li key=${g.id} class="group-card" data-testid=${'group-' + g.id}>
      <h3 class="group-title">${renderText(g.title)}</h3>
      <div class="group-counts">
        <span class="group-stat" data-testid=${'group-' + g.id + '-due'}>${t('home.group.stat.due')} <b class="group-due">${c.due}</b></span>
        <span class="group-stat" data-testid=${'group-' + g.id + '-new'}>${t('home.group.stat.new')} <b>${c.newToday}</b></span>
      </div>
      <p class="muted group-notstarted" data-testid=${'group-' + g.id + '-notstarted'}>${t('home.group.notStarted', { n: c.fresh, total: c.total })}</p>
      <div class="group-actions">
        <button type="button" class="btn primary" disabled=${!canStart}
          data-testid=${'btn-start-group-' + g.id}
          onClick=${function () { p.onStart('daily', { groupId: g.id }); }}>
          ${t('home.group.start')}${canStart ? html`<span class="group-start-count"> · ${c.due + c.newToday}</span>` : null}
        </button>
        ${isExtraNew ? extraNewButtons(p, g) : null}
      </div>
      ${isExtraNew || hasTags ? html`<div class="group-toggles">
        ${isExtraNew ? randomToggle(p, g, randomLabel) : null}
        ${hasTags ? onlyTagsToggle(p, g, onlyTagsLabel) : null}
      </div>` : null}
    </li>`;
  }

  var api = { GroupCard: GroupCard };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoGroupCard = api;
})(typeof self !== 'undefined' ? self : this);
