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

  // Split prompt by '___' and return array of text pieces and slots, or null if count doesn't match
  function splitPrompt(prompt, n) {
    if (typeof prompt !== 'string') return null;
    var parts = prompt.split('___');
    if (parts.length !== n + 1) return null;
    var result = [], starSlot = -1;
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) result.push(null); // slot marker
      var piece = parts[i];
      if (i > 0 && starSlot < 0 && piece.charAt(0) === '★') { // star right after slot
        starSlot = i - 1;
        piece = piece.slice(1);
      }
      if (piece.length > 0) result.push(piece);
    }
    result.starSlot = starSlot;
    return result;
  }

  // Render a sentence with slots for the new UX
  function renderSentence(ctx, sentencePieces) {
    var t = ctx.t, res = ctx.res, placed = ctx.placed, byId = ctx.byId, mark = ctx.mark;
    var slots = [], n = 0;
    sentencePieces.forEach(function (piece) { slots.push(piece === null ? n++ : -1); });

    return html`<p class="order-sentence" data-testid="prompt">
      ${sentencePieces.map(function(piece, idx) {
        if (piece === null) {
          var k = slots[idx];
          var id = placed[k];
          var isStar = sentencePieces.starSlot === k;
          var star = html`<span class="order-star" aria-hidden="true">★</span>`;
          if (id !== undefined && byId[id]) {
            var label = t('q.order.position', { n: k + 1 });
            return html`<button type="button" class=${cls('order-slot', mark(k))}
              data-testid=${'order-slot-' + k} aria-label=${label + ': ' + byId[id].label}
              disabled=${!!res} onClick=${function () { ctx.unplace(k); }}>
              ${isStar ? star : null}<span class="order-text">${renderText(byId[id].label)}</span></button>`;
          } else {
            return html`<span class=${cls('order-slot', 'empty')} data-testid=${'order-slot-' + k} role="img" aria-label=${t('q.order.position', { n: k + 1 })}>${isStar ? star : null}</span>`;
          }
        } else {
          return html`<span class="order-text">${renderText(piece)}</span>`;
        }
      })}
    </p>`;
  }

  // Render the old numbered-list fallback
  function renderList(ctx) {
    var placed = ctx.placed, byId = ctx.byId, res = ctx.res, mark = ctx.mark;
    return html`<ol class="order-placed-list" data-testid="order-placed-list">
      ${placed.map(function (id, k) {
        if (!byId[id]) return null;
        var label = ctx.t('q.order.position', { n: k + 1 });
        return html`<li key=${id}><button type="button" class=${cls('order-step', 'order-placed', mark(k))}
          data-testid=${'order-placed-' + k} data-refocus=${ctx.flag(ctx.focusOn === 'placed' && k === 0)} aria-label=${label + ': ' + byId[id].label} disabled=${!!res}
          onClick=${function () { ctx.unplace(k); }}>
          <span class="order-position" aria-hidden="true">${k + 1}</span>
          <span class="order-text">${renderText(byId[id].label)}</span></button></li>`;
      })}
    </ol>`;
  }

  // Render the pool of unplaced words
  function renderPool(ctx) {
    var steps = ctx.steps, placed = ctx.placed, firstUnplaced = ctx.firstUnplaced;
    return html`<ul class="order-unplaced" data-testid="order-unplaced">
      ${steps.map(function (s, i) {
        return placed.indexOf(s.id) >= 0 ? null : html`<li key=${s.id}><button type="button" class="order-step"
          data-testid=${'order-item-' + i} data-autofocus=${ctx.flag(i === firstUnplaced)}
          data-refocus=${ctx.flag(i === firstUnplaced)} disabled=${!!ctx.res} onClick=${function () { ctx.place(s.id); }}>
          <span class="order-text">${renderText(s.label)}</span></button></li>`;
      })}
    </ul>`;
  }

  // Render action buttons (reset, check)
  function renderActions(ctx) {
    var t = ctx.t, res = ctx.res, checkDisabled = ctx.checkDisabled;
    return html`<div class="row pair order-actions">
      <button type="button" class="btn" disabled=${!!res} data-testid="order-reset"
        onClick=${function () { ctx.setState({ placed: [] }); }}>${t('q.order.reset')}</button>
      <button type="button" class="btn primary" disabled=${checkDisabled} data-testid="btn-submit"
        data-refocus=${ctx.flag(ctx.focusOn === 'check')}
        onClick=${function () { if (!res && canSubmit(ctx.state)) ctx.onSubmit({ sequence: ctx.state.placed.slice() }, ctx.state.placed.slice()); }}>${t('session.check')}</button>
    </div>`;
  }

  function ownsPrompt(item, view) {
    if (!item || !item.prompt) return false;
    return splitPrompt(item.prompt, view.steps.length) !== null;
  }

  function buildCtx(p, placed, steps, byId, res, checkDisabled, firstUnplaced, firstWrong) {
    var focusOn = firstUnplaced >= 0 ? 'step' : (checkDisabled ? 'placed' : 'check');
    return {
      t: p.t,
      res: res,
      placed: placed,
      steps: steps,
      byId: byId,
      state: p.state,
      place: function (id) { p.setState({ placed: placed.concat([id]) }); },
      unplace: function (k) { p.setState({ placed: placed.slice(0, k).concat(placed.slice(k + 1)) }); },
      setState: p.setState,
      onSubmit: p.onSubmit,
      focusOn: focusOn,
      checkDisabled: checkDisabled,
      firstUnplaced: firstUnplaced,
      flag: function (on) { return on ? 'true' : undefined; },
      mark: function (k) {
        if (firstWrong === undefined) return '';
        if (firstWrong === null || k < firstWrong) return 'right';
        return k === firstWrong ? 'wrong' : '';
      }
    };
  }

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var placed = p.state.placed;
    var steps = p.view.steps;
    var byId = {};
    steps.forEach(function (s) { byId[s.id] = s; });
    var firstWrong = res && !p.exam && res.detail ? res.detail.firstWrong : undefined;
    var firstUnplaced = -1;
    steps.forEach(function (s, i) { if (firstUnplaced < 0 && placed.indexOf(s.id) < 0) firstUnplaced = i; });
    var checkDisabled = !!res || !canSubmit(p.state);
    var ctx = buildCtx(p, placed, steps, byId, res, checkDisabled, firstUnplaced, firstWrong);
    var sentencePieces = p.item && p.item.prompt ? splitPrompt(p.item.prompt, steps.length) : null;

    if (sentencePieces !== null) {
      return html`<div class="order sentence" data-testid="order">
        <p class="muted order-hint">${t('q.order.hint')}</p>
        ${renderSentence(ctx, sentencePieces)}
        ${renderPool(ctx)}
        ${renderActions(ctx)}
      </div>`;
    }
    return html`<div class="order" data-testid="order">
      <p class="muted order-hint">${t('q.order.hint')}</p>
      ${renderPool(ctx)}
      ${renderList(ctx)}
      ${renderActions(ctx)}
    </div>`;
  }

  function Extra(p) {
    var d = p.result && p.result.detail;
    return d && d.firstWrong !== null && d.firstWrong !== undefined
      ? html`<p data-testid="order-first-wrong">${p.t('q.result.firstWrong', { n: d.firstWrong + 1 })}</p>`
      : null;
  }

  function onKey(e, p) {
    if (p.result || DojoTypes.keyBlocked(e)) return null;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return null;
    var container = e.target.closest('[data-testid="order"]');
    if (!container) return null;
    var buttons = container.querySelectorAll('button');
    var enabled = [];
    for (var i = 0; i < buttons.length; i++) if (!buttons[i].disabled) enabled.push(buttons[i]);
    if (enabled.length === 0) return null;
    var cur = enabled.indexOf(e.target);
    var next = cur < 0 ? 0 : (cur + (e.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length;
    enabled[next].focus(); e.preventDefault();
    return null;
  }

  root.DojoTypes.register('order', {
    Question: Question,
    canSubmit: canSubmit,
    initialState: initialState,
    Extra: Extra,
    onKey: onKey,
    ownsPrompt: ownsPrompt,
    splitPrompt: splitPrompt
  });
})(typeof self !== 'undefined' ? self : this);
