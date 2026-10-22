/* types/card.js — flash card question UI. Globals: preact, htm, DojoTypes, DojoExt. */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};

  function renderText(str) {
    return DojoExt.text ? DojoExt.text(str) : str;
  }

  function Question(p) {
    var t = p.t;
    var back = p.view.back;
    var res = p.result;
    if (back === undefined) {
      return html`<div class="card-slot"><button type="button" class="btn primary" data-testid="btn-show" data-autofocus="true"
        onClick=${function () { p.onReveal(); }}>${t('session.show')}</button></div>`;
    }
    return html`<div class="card-slot">
      <p class="back" data-testid="card-back">${renderText(back)}</p>
      <div class="row">
        <button type="button" class="btn danger-soft" disabled=${!!res} data-testid="btn-again" data-refocus="true"
          onClick=${function () { p.onSubmit({ rating: 'again' }, 'again'); }}>${t('session.again')}</button>
        <button type="button" class="btn good-soft" disabled=${!!res} data-testid="btn-known"
          onClick=${function () { p.onSubmit({ rating: 'known' }, 'known'); }}>${t('session.known')}</button>
      </div>
    </div>`;
  }

  root.DojoTypes.register('card', {
    Question: Question,
    canSubmit: function () { return true; },
    initialState: function () { return {}; },
    verdict: function (res, t) { return res.correct ? t('session.known') : t('session.again'); },
    hideExpected: true,
    selfRated: true
  });
})(typeof self !== 'undefined' ? self : this);
