/* types/match.js — match question UI. Globals: preact, htm, DojoTypes, DojoExt. */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var cls = root.DojoTypes.cls;
  var renderText = root.DojoTypes.renderText;

  function canSubmit(state) {
    return state.mapping.every(function (m) { return m !== null; });
  }

  function initialState(view) {
    return { mapping: view.lefts.map(function () { return null; }) };
  }

  function renderRows(p, handleSelect) {
    var t = p.t;
    var res = p.result;
    var mapping = p.state.mapping;
    var rights = p.view.rights;
    return p.view.lefts.map(function (left, i) {
      var selected = mapping[i];
      var stateClass = '';
      if (res && !p.exam && res.detail && res.detail.wrong) {
        if (res.detail.wrong.indexOf(left.label) >= 0) {
          stateClass = 'wrong';
        }
      }
      return html`<div key=${left.id} class=${cls('match-row', stateClass)} data-testid=${'match-row-' + i}>
        <span class="match-left">${renderText(left.label)}</span>
        <select class="match-select" data-testid=${'match-select-' + i} aria-label=${left.label} data-autofocus=${i === 0 ? 'true' : undefined} disabled=${!!res}
          value=${selected === null || selected === undefined ? '' : String(selected)} onChange=${function (e) { handleSelect(i, e); }}>
          <option value="">${t('q.match.choose')}</option>
          ${rights.map(function (r) {
            return html`<option key=${r.id} value=${r.id}>${renderText(r.label)}</option>`;
          })}
        </select>
      </div>`;
    });
  }

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var fullState = p.state;
    var mapping = fullState.mapping;
    var lefts = p.view.lefts;

    function handleSelect(i, e) {
      var value = e.target.value;
      var newMapping = mapping.slice();
      newMapping[i] = value === '' ? null : Number(value);
      p.setState({ mapping: newMapping });
    }

    function handleReset() {
      p.setState({ mapping: lefts.map(function () { return null; }) });
    }

    function handleSubmit(e) {
      e.preventDefault();
      if (!res && canSubmit(fullState)) {
        p.onSubmit({ mapping: mapping }, mapping);
      }
    }

    var rows = renderRows(p, handleSelect);

    var submitDisabled = !!res || !canSubmit(fullState);

    var AnswerBlock = root.DojoAnswerBlock.AnswerBlock;
    var hint = html`<p class="match-hint muted">${t('q.match.hint')}</p>`;
    var actions = html`<div class="match-actions row wrap">
        <button type="button" class="btn" disabled=${!!res} data-testid="match-reset" onClick=${handleReset}>
          ${t('q.match.reset')}
        </button>
        <button type="submit" class="btn primary" disabled=${submitDisabled} data-testid="btn-submit">
          ${t('session.check')}
        </button>
      </div>`;
    // The form owns submit (Enter and the submit button); the block lays out the slots inside it.
    return html`<form class="match" data-testid="match" onSubmit=${handleSubmit}>${AnswerBlock({
      cls: 'match-block', testid: 'match-block', prompt: hint, fields: rows, submit: actions })}</form>`;
  }

  function Extra(p) {
    var res = p.result;
    if (!res || p.exam || !res.detail || !res.detail.wrong || res.detail.wrong.length === 0) return null;
    return html`<p data-testid="wrongPairs">${p.t('q.result.wrongPairs')}: <span class="pre">${res.detail.wrong.join(', ')}</span></p>`;
  }

  root.DojoTypes.register('match', {
    Question: Question,
    canSubmit: canSubmit,
    answerTexts: function (item) { return (item.pairs || []).map(function (p) { return p.right; }); },
    initialState: initialState,
    Extra: Extra
  });
})(typeof self !== 'undefined' ? self : this);
