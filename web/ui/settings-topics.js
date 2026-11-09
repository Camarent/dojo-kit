/*
 * ui/settings-topics.js — renderTopicsSettings: questions per topic review session (one question per topic; 0 = no limit).
 * Globals expected: preact, htm. create() returns { renderTopicsSettings }; null unless the course has `topics`.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var KEY = 'topics:sessionCap';
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
      </section>`;
    }

    return { renderTopicsSettings: renderTopicsSettings };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsTopics = api;
})(typeof self !== 'undefined' ? self : this);
