/* types/order.js — order (put steps in order) question UI. Globals: preact, htm, DojoTypes, DojoExt. */
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

  function canSubmit(state) { return state.placed.length === state.total; }

  function initialState(view) { return { placed: [], total: view.steps.length }; }

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var placed = p.state.placed;
    var steps = p.view.steps;
    var byId = {};
    steps.forEach(function (s) { byId[s.id] = s; });
    var firstWrong = res && !p.exam && res.detail ? res.detail.firstWrong : undefined;

    function place(id) { p.setState({ placed: placed.concat([id]) }); }
    function unplace(k) { p.setState({ placed: placed.slice(0, k).concat(placed.slice(k + 1)) }); }

    var firstUnplaced = -1;
    steps.forEach(function (s, i) { if (firstUnplaced < 0 && placed.indexOf(s.id) < 0) firstUnplaced = i; });
    var checkDisabled = !!res || !canSubmit(p.state);
    var focusOn = firstUnplaced >= 0 ? 'step' : (checkDisabled ? 'placed' : 'check');
    function flag(on) { return on ? 'true' : undefined; }

    function mark(k) {
      if (firstWrong === undefined) return '';
      if (firstWrong === null || k < firstWrong) return 'right';
      return k === firstWrong ? 'wrong' : '';
    }

    return html`<div class="order" data-testid="order">
      <p class="muted order-hint">${t('q.order.hint')}</p>
      <ul class="order-unplaced">
        ${steps.map(function (s, i) {
          return placed.indexOf(s.id) >= 0 ? null : html`<li key=${s.id}><button type="button" class="order-step"
            data-testid=${'order-item-' + i} data-autofocus=${flag(i === firstUnplaced)}
            data-refocus=${flag(i === firstUnplaced)} disabled=${!!res} onClick=${function () { place(s.id); }}>
            <span class="order-text">${renderText(s.label)}</span></button></li>`;
        })}
      </ul>
      <ol class="order-placed-list">
        ${placed.map(function (id, k) {
          var label = t('q.order.position', { n: k + 1 });
          return html`<li key=${id}><button type="button" class=${cls('order-step', 'order-placed', mark(k))}
            data-testid=${'order-placed-' + k} data-refocus=${flag(focusOn === 'placed' && k === 0)} aria-label=${label + ': ' + byId[id].label} disabled=${!!res}
            onClick=${function () { unplace(k); }}>
            <span class="order-position" aria-hidden="true">${k + 1}</span>
            <span class="order-text">${renderText(byId[id].label)}</span></button></li>`;
        })}
      </ol>
      <div class="row">
        <button type="button" class="btn" disabled=${!!res} data-testid="order-reset"
          onClick=${function () { p.setState({ placed: [] }); }}>${t('q.order.reset')}</button>
        <button type="button" class="btn primary" disabled=${checkDisabled} data-testid="btn-submit"
          data-refocus=${flag(focusOn === 'check')}
          onClick=${function () { if (!res && canSubmit(p.state)) p.onSubmit({ sequence: placed.slice() }, placed.slice()); }}>${t('session.check')}</button>
      </div>
    </div>`;
  }

  function Extra(p) {
    var d = p.result && p.result.detail;
    return d && d.firstWrong !== null && d.firstWrong !== undefined
      ? html`<p data-testid="order-first-wrong">${p.t('q.result.firstWrong', { n: d.firstWrong + 1 })}</p>`
      : null;
  }

  root.DojoTypes.register('order', {
    Question: Question,
    canSubmit: canSubmit,
    initialState: initialState,
    Extra: Extra
  });
})(typeof self !== 'undefined' ? self : this);
