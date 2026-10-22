/* types/multi.js — select-all-that-apply question UI. Globals: preact, htm, DojoTypes, DojoExt. */
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

  function canSubmit(state) { return state.selected.length > 0; }

  function toggled(selected, id) {
    return selected.indexOf(id) >= 0
      ? selected.filter(function (s) { return s !== id; })
      : selected.concat([id]);
  }

  function isRight(res, o, picked) {
    var d = res.detail;
    return d.missing.indexOf(o.label) >= 0 || (picked && d.extra.indexOf(o.label) < 0);
  }

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var selected = p.state.selected;
    var judged = res && !p.exam && res.detail;
    return html`<div class="multi" data-testid="multi">
      ${res ? null : html`<p class="muted" data-testid="multi-hint">${t('q.multi.hint')}</p>`}
      <ul class="opts" data-testid="options">${p.view.options.map(function (o, i) {
        var on = selected.indexOf(o.id) >= 0;
        var state = '';
        if (judged) state = isRight(res, o, on) ? 'right' : (on ? 'wrong' : '');
        else if (res && on) state = 'picked';
        return html`<li key=${o.id}><button type="button" class=${cls('opt', 'multi-opt', state)} disabled=${!!res}
          data-testid=${'option-' + i} data-id=${o.id} data-autofocus=${i === 0 ? 'true' : undefined} aria-pressed=${on ? 'true' : 'false'}
          onClick=${function () { p.setState({ selected: toggled(selected, o.id) }); }}>
          <span class="key" aria-hidden="true">${i + 1}</span><span class="opt-text">${renderText(o.label)}</span>
          <span class="multi-mark" aria-hidden="true">${on ? '✓' : ''}</span></button></li>`;
      })}</ul>
      <button type="button" class="btn primary" disabled=${!!res || !canSubmit(p.state)} data-testid="btn-submit"
        onClick=${function () { if (!res && canSubmit(p.state)) p.onSubmit({ ids: selected }, selected); }}>${t('session.check')}</button>
    </div>`;
  }

  function onKey(e, p) {
    var tag = e.target && e.target.tagName;
    if (p.result || !/^[1-9]$/.test(e.key) || tag === 'INPUT' || tag === 'TEXTAREA') return null;
    var opt = p.view.options[Number(e.key) - 1];
    if (opt) p.setState({ selected: toggled(p.state.selected, opt.id) });
    return null;
  }

  function list(title, labels) {
    return labels && labels.length
      ? html`<div class="multi-list"><b>${title}</b><ul>${labels.map(function (l, i) { return html`<li key=${i}>${l}</li>`; })}</ul></div>`
      : null;
  }

  function Extra(p) {
    var d = p.result.detail;
    if (!d) return null;
    return html`<div class="multi-extra" data-testid="multi-extra">
      ${list(p.t('q.result.missing'), d.missing)}${list(p.t('q.result.extra'), d.extra)}
    </div>`;
  }

  root.DojoTypes.register('multi', {
    Question: Question,
    canSubmit: canSubmit,
    initialState: function () { return { selected: [] }; },
    onKey: onKey,
    Extra: Extra
  });
})(typeof self !== 'undefined' ? self : this);
