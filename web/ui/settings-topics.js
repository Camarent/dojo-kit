/*
 * ui/settings-topics.js — renderTopicsSettings: questions per topic review session (one question per topic; 0 = no limit).
 * Globals expected: preact, htm. create() returns { renderTopicsSettings }; null unless the course has `topics`.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var KEY = 'topics:sessionCap';
  var WEAK_KEY = 'session:weakFilter';
  var MAX = 500;

  function create() {
    // Settings value wins when it is a number; otherwise the course value; otherwise 0 (no limit).
    function courseCap(course) {
      var c = (course.topics || {}).sessionCap;
      return typeof c === 'number' ? c : 0;
    }

    function renderTopicsSettings(p, self) {
      var course = p.course || {};
      if (!course.topics) return null;
      var settings = (p.store.doc && p.store.doc.settings) || {};
      var raw = settings[KEY];
      var cap = typeof raw === 'number' ? raw : courseCap(course);
      return html`<section class="group topics-settings" data-testid="topics-settings">
        <h2>${p.t('settings.topics.cap')}</h2>
        <p class="muted">${p.t('settings.topics.hint')}</p>
        <div class="setting-row">
          <input type="number" class="field" id="topics-cap" data-testid="topics-cap" aria-label=${p.t('settings.topics.cap')}
            min="0" max=${MAX} step="1" value=${cap} placeholder=${String(courseCap(course))}
            onChange=${function (e) {
              var raw = e.target.value;
              var n = Number(raw);
              if (raw !== '' && Number.isInteger(n) && n >= 0 && n <= MAX) self.setSetting(KEY, n);
            }} />
          <button type="button" class="btn" data-testid="topics-cap-reset" onClick=${function () { self.setSetting(KEY, null); }}>${p.t('settings.topics.default')}</button>
        </div>
        ${renderWeakFilter(p, self, settings[WEAK_KEY])}
      </section>`;
    }

    // Readable aspect name from the home chip keys; the course title wins, the raw id only when no key exists.
    function aspectName(p, a) {
      if (a.title) return a.title;
      var key = 'home.weak.aspect.' + a.id;
      var name = p.t(key);
      return name === key ? a.id : name;
    }

    // Weak mode filter: topic and aspect pickers, stored as {topic?, aspect?} under session:weakFilter; empty choice = no filter.
    function renderWeakFilter(p, self, stored) {
      var opts = p.engine && p.engine.weakFilterOptions ? p.engine.weakFilterOptions() : null;
      if (!opts) return null;
      var cur = stored && typeof stored === 'object' ? stored : {};
      function save(field, value) {
        var next = { topic: cur.topic || '', aspect: cur.aspect || '' };
        next[field] = value;
        self.setSetting(WEAK_KEY, next.topic || next.aspect ? next : null);
      }
      function picker(field, testid, label, options) {
        return html`<label class="setting-row">${label}
          <select class="field" id=${testid} name=${testid} data-testid=${testid} value=${cur[field] || ''} onChange=${function (e) { save(field, e.target.value); }}>
            <option value="">${p.t('settings.weak.any')}</option>
            ${options.map(function (o) { return html`<option value=${o.id} selected=${(cur[field] || '') === o.id}>${o.title || o.id}</option>`; })}
          </select>
        </label>`;
      }
      return html`<div data-testid="weak-filter">
        <h3>${p.t('settings.weak.title')}</h3>
        ${picker('topic', 'weak-filter-topic', p.t('settings.weak.topic'), opts.topics.map(function (e, i) { return { id: e, title: '#' + (i + 1) }; }))}
        ${picker('aspect', 'weak-filter-aspect', p.t('settings.weak.aspect'), opts.aspects.map(function (a) { return { id: a.id, title: aspectName(p, a) }; }))}
      </div>`;
    }

    return { renderTopicsSettings: renderTopicsSettings };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsTopics = api;
})(typeof self !== 'undefined' ? self : this);
