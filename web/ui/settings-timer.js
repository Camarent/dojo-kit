/*
 * ui/settings-timer.js — renderTimerSettings: base seconds (2..30) of the per-question timer.
 * Globals expected: preact, htm. create() returns { renderTimerSettings }; null unless the course or a unit has `timer`.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  function create() {
    function hasTimer(course) {
      return !!(course && (course.timer || (course.units || []).some(function (u) { return u && u.timer; })));
    }

    function renderTimerSettings(p, self) {
      var course = p.course || {};
      if (!hasTimer(course)) return null;
      var settings = (p.store.doc && p.store.doc.settings) || {};
      var raw = settings['timer:baseMs'];
      var fallback = course.timer && typeof course.timer.baseMs === 'number' ? course.timer.baseMs : 8000;
      var ms = typeof raw === 'number' && isFinite(raw) ? raw : fallback;
      var sec = Math.round(Math.min(30000, Math.max(2000, ms)) / 1000);
      return html`<section class="group timer-settings" data-testid="timer-settings">
        <h2>${p.t('settings.timer')}</h2>
        <p class="muted">${p.t('settings.timer.hint')}</p>
        <div class="setting-row">
          <label for="timer-base">${p.t('settings.timer.base')}: <output data-testid="timer-base-value">${sec}</output></label>
          <input type="range" class="field" id="timer-base" data-testid="timer-base" min="2" max="30" step="1" value=${sec}
            onChange=${function (e) { var n = parseFloat(e.target.value); if (isFinite(n)) self.setSetting('timer:baseMs', Math.min(30, Math.max(2, Math.round(n))) * 1000); }} />
        </div>
      </section>`;
    }

    return { renderTimerSettings: renderTimerSettings };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSettingsTimer = api;
})(typeof self !== 'undefined' ? self : this);
