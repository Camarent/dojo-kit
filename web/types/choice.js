/* types/choice.js — single-choice question UI. Globals: preact, htm, DojoTypes, DojoExt. */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var DojoExt = root.DojoExt || {};

  function cls() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  function correctIndexes(item) {
    return Array.isArray(item.answer) ? item.answer : [item.answer];
  }

  function renderText(text) {
    return DojoExt.text ? DojoExt.text(text) : text;
  }

  function Question(p) {
    var right = correctIndexes(p.item);
    return html`<ul class="opts" data-testid="options" data-arrow-own>${p.view.options.map(function (o, i) {
      var state = '';
      if (p.result) {
        if (p.exam) state = o.index === p.picked ? 'picked' : '';
        else if (right.indexOf(o.index) >= 0) state = 'right';
        else if (o.index === p.picked) state = 'wrong';
      }
      var mark = null;
      if (p.result && !p.exam) {
        if (right.indexOf(o.index) >= 0) mark = html`<span class="opt-mark" aria-hidden="true">\u2713</span><span class="sr-only"> ${p.t('session.correct')}</span>`;
        else if (o.index === p.picked) mark = html`<span class="opt-mark" aria-hidden="true">\u2717</span><span class="sr-only"> ${p.t('session.wrong')}</span>`;
      }
      return html`<li key=${o.index}><button type="button" class=${cls('opt', state)} disabled=${!!p.result}
        data-testid=${'option-' + i} data-index=${o.index} data-autofocus=${i === 0 ? 'true' : undefined} aria-pressed=${o.index === p.picked ? 'true' : 'false'}
        onClick=${function () { p.onSubmit({ index: o.index }, o.index); }}>
        <span class="key" aria-hidden="true">${i + 1}</span><span class="opt-text">${renderText(o.label)}</span>${mark}</button></li>`;
    })}</ul>`;
  }

  function focusedOption(e, p) {
    var d = e.target && e.target.getAttribute && e.target.getAttribute('data-index');
    if (d === null || d === undefined) return -1;
    return p.view.options.findIndex(function (o) { return o.index === Number(d); });
  }

  function onKey(e, p) {
    if (p.result || DojoTypes.keyBlocked(e)) return null;
    var key = e.key;
    var options = p.view.options;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      if (p.exam) return null;
      var cur = focusedOption(e, p);
      var next = cur < 0 ? 0 : (cur + (key === 'ArrowUp' ? options.length - 1 : 1)) % options.length;
      var doc = e.target && e.target.ownerDocument;
      var btn = doc && doc.querySelector('[data-testid="option-' + next + '"]');
      if (btn) { btn.focus(); e.preventDefault(); }
      return null;
    }
    if (key === 'Enter' || key === ' ') {
      var at = p.exam ? -1 : focusedOption(e, p);
      if (at < 0) return null;
      return { input: { index: options[at].index }, picked: options[at].index };
    }
    if (!/^[1-9]$/.test(key)) return null;
    var opt = options[Number(key) - 1];
    return opt ? { input: { index: opt.index }, picked: opt.index } : null;
  }

  root.DojoTypes.register('choice', {
    Question: Question,
    canSubmit: function () { return true; },
    answerTexts: function (item) {
      var idxs = Array.isArray(item.answer) ? item.answer : [item.answer];
      return idxs.map(function (i) { return item.options && item.options[i]; });
    },
    initialState: function () { return {}; },
    onKey: onKey
  });
})(typeof self !== 'undefined' ? self : this);
