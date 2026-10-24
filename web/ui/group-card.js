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

  function GroupCard(p) {
    var t = p.t;
    var g = p.group;
    var isExtraNew = g.extraNew === true;
    var total = g.total || 0;
    var due = g.due || 0;
    var fresh = g.fresh || 0;
    var newToday = g.newToday || 0;
    var canStart = due + newToday > 0;
    var randomLabel = t('home.group.randomOrder');
    var onlyTagsLabel = g.extraTags && g.extraTags.length > 0
      ? t('home.group.onlyTags', { tag: g.extraTags.map(function (tag) { return tagInfo({ tagLabels: p.tagLabels }, tag).label; }).join(', ') })
      : '';
    return html`<li key=${g.id} class="group-card" data-testid=${'group-' + g.id}>
      <h3 class="group-title">${renderText(g.title)}</h3>
      <div class="group-counts">
        <span class="group-stat" data-testid=${'group-' + g.id + '-due'}>${t('home.group.stat.due')} <b class="group-due">${due}</b></span>
        <span class="group-stat" data-testid=${'group-' + g.id + '-new'}>${t('home.group.stat.new')} <b>${newToday}</b></span>
      </div>
      <p class="muted group-notstarted" data-testid=${'group-' + g.id + '-notstarted'}>${t('home.group.notStarted', { n: fresh, total: total })}</p>
      <div class="group-actions">
        <button type="button" class="btn primary" disabled=${!canStart} 
          data-testid=${'btn-start-group-' + g.id}
          onClick=${function () { p.onStart('daily', { groupId: g.id }); }}>
          ${t('home.group.start')}${due + newToday > 0 ? html`<span class="group-start-count"> · ${due + newToday}</span>` : null}
        </button>
        ${isExtraNew ? html`<div class="row wrap extra-new-buttons" data-testid=${'group-' + g.id + '-extra'}>
          <button type="button" class="btn small" data-testid=${'btn-extra-5-' + g.id} onClick=${function () { p.onMoreNew(5); }}>${t('home.moreNew', { n: 5 })}</button>
          <button type="button" class="btn small" data-testid=${'btn-extra-10-' + g.id} onClick=${function () { p.onMoreNew(10); }}>${t('home.moreNew', { n: 10 })}</button>
          <button type="button" class="btn small" data-testid=${'btn-extra-20-' + g.id} onClick=${function () { p.onMoreNew(20); }}>${t('home.moreNew', { n: 20 })}</button>
        </div>` : null}
      </div>
      ${isExtraNew || (g.extraTags && g.extraTags.length > 0) ? html`<div class="group-toggles">
        ${isExtraNew ? html`<label class="chip toggles" data-testid=${'toggle-random-' + g.id}>
          <input type="checkbox"
            checked=${g.extraRandom === true}
            id=${'group-toggle-random-' + g.id}
            aria-label=${randomLabel}
            name=${'random-' + g.id}
            onChange=${function () { p.onGroupSetting(g.id, 'extraRandom', g.extraRandom === true ? null : true); }} />
          <span>${randomLabel}</span>
        </label>` : null}
        ${g.extraTags && g.extraTags.length > 0 ? html`<label class="chip toggles" data-testid=${'toggle-onlyTags-' + g.id}>
          <input type="checkbox"
            checked=${g.onlyTags === true}
            id=${'group-toggle-onlyTags-' + g.id}
            aria-label=${onlyTagsLabel}
            name=${'onlyTags-' + g.id}
            onChange=${function () { p.onGroupSetting(g.id, 'onlyTags', g.onlyTags === true ? null : true); }} />
          <span>${onlyTagsLabel}</span>
        </label>` : null}
      </div>` : null}
    </li>`;
  }

  var api = { GroupCard: GroupCard };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoGroupCard = api;
})(typeof self !== 'undefined' ? self : this);
