/* types/numeric.js — numeric question UI. Globals: preact, htm, DojoTypes, DojoExt. */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};

  function cls() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  function renderText(str) {
    return DojoExt.text ? DojoExt.text(str) : str;
  }

  function inputMode(st) {
    return st && st.hideText === true && Array.isArray(st.audio) && st.audio.length > 0 ? 'numeric' : 'decimal';
  }

  function canSubmit(state) { return state.text.trim() !== ''; }

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var text = p.state.text;
    var view = p.view;
    var stateClass = res && !p.exam ? (res.correct ? 'right' : 'wrong') : '';
    var unitLabel = view.unitLabel;
    return html`<form class="numeric" data-testid="numeric-form" onSubmit=${function (e) {
      e.preventDefault();
      if (!res && canSubmit(p.state)) p.onSubmit({ text: text }, text);
    }}>
      <div class="numeric-row">
        <input type="text" inputmode=${inputMode(p.stimulus)} class=${cls('field', stateClass)} value=${text} readOnly=${!!res} aria-readonly=${res ? 'true' : null} autocomplete="off" autocapitalize="off"
          autocorrect="off" spellcheck=${false} aria-label=${t('session.your_answer')} data-testid="numeric-input" name="answer"
          ref=${p.inputRef} onInput=${function (e) { p.setState({ text: e.target.value }); }} />
        ${unitLabel ? html`<span class="unit-label">${renderText(unitLabel)}</span>` : null}
      </div>
      ${!res ? html`<button type="submit" class="btn primary" disabled=${!canSubmit(p.state)} data-testid="btn-submit">${t('session.check')}</button>` : null}
    </form>`;
  }

  function Extra(p) {
    var res = p.result;
    var detail = res && res.detail;
    var t = p.t;
    if (p.exam || !detail) return null;
    if (detail.parsed !== null) {
      return html`<p data-testid="numeric-readAs">${t('q.numeric.readAs', { value: String(detail.parsed) })}</p>`;
    }
    if (res.timedOut) return null;
    return html`<p data-testid="numeric-invalid">${t('q.numeric.invalid')}</p>`;
  }

  root.DojoTypes.register('numeric', {
    Question: Question,
    canSubmit: canSubmit,
    initialState: function () { return { text: '' }; },
    Extra: Extra,
    inputMode: inputMode
  });
})(typeof self !== 'undefined' ? self : this);
