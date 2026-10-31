/* types/gap.js — typed-answer (gap) question UI. Globals: preact, htm, DojoTypes. */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  function cls() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  function canSubmit(state) { return state.text.trim() !== ''; }

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var text = p.state.text;
    var state = res && !p.exam ? (res.correct ? 'right' : 'wrong') : '';
    return html`<form class="gap" data-testid="gap-form" onSubmit=${function (e) {
      e.preventDefault();
      if (!res && canSubmit(p.state)) p.onSubmit({ text: text }, text);
    }}>
      <input type="text" inputmode=${p.item && p.item.inputMode ? p.item.inputMode : null} class=${cls('field', state)} value=${text} readOnly=${!!res} aria-readonly=${res ? 'true' : null} autocomplete="off" autocapitalize="off"
        autocorrect="off" spellcheck=${false} aria-label=${t('session.your_answer')} data-testid="gap-input" name="answer"
        ref=${p.inputRef} onInput=${function (e) { p.setState({ text: e.target.value }); }} />
      ${!res ? html`<button type="submit" class="btn primary" disabled=${!canSubmit(p.state)} data-testid="btn-submit">${t('session.check')}</button>` : null}
    </form>`;
  }

  function Extra(p) {
    var res = p.result;
    return res.accepted && res.accepted.length > 1
      ? html`<p data-testid="accepted">${p.t('session.accepted')}: <span class="pre">${res.accepted.join(' / ')}</span></p>`
      : null;
  }

  root.DojoTypes.register('gap', {
    Question: Question,
    canSubmit: canSubmit,
    answerTexts: function (item) { return item.answers || []; },
    initialState: function () { return { text: '' }; },
    Extra: Extra
  });
})(typeof self !== 'undefined' ? self : this);
