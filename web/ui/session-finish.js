/*
 * ui/session-finish.js — SessionFinish block: the four numbers of a finished practice run.
 * Globals expected: preact, htm, DojoCommon.
 * create(deps) returns { SessionFinish }. Props: { t, finish } where finish is the core sessionFinish result
 * { answered, right, weakLeft, nextDue, denominator }. A run never starts a new round by itself.
 */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  // nextDue is a timestamp in the core clock unit (ms); null when nothing is recorded.
  // Empty state is a muted label, not a stat value: a long label in <b> overflows a phone tile.
  function nextDueValue(t, nextDue) {
    if (nextDue === null || nextDue === undefined) return html`<small class="muted">${t('finish.none')}</small>`;
    return html`<b>${new Date(nextDue).toLocaleString()}</b>`;
  }

  function create() {

    function SessionFinish(p) {
      var t = p.t;
      var f = p.finish;
      return html`<section class="stats session-finish" data-testid="session-finish">
        <h2>${t('finish.title')}</h2>
        <div class="stat" data-testid="finish-answered"><b>${f.answered}</b><span>${t('finish.answered')}</span></div>
        <div class="stat" data-testid="finish-right"><b>${f.right}</b><span>${t('finish.right')}</span></div>
        <div class="stat" data-testid="finish-weak-left"><b>${f.weakLeft}</b><span>${t('finish.weakLeft', { n: f.weakLeft })}</span></div>
        <div class="stat" data-testid="finish-next-due">${nextDueValue(t, f.nextDue)}<span>${t('finish.nextDue')}</span></div>
        <p class="notice" data-testid="finish-no-round">${t('finish.noRound')}</p>
      </section>`;
    }

    return { SessionFinish: SessionFinish };
  }

  var api = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionFinish = api;
})(typeof self !== 'undefined' ? self : this);
