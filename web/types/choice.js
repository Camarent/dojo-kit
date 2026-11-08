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

  function optionState(p, o, right) {
    if (!p.result) return '';
    if (p.exam) return o.index === p.picked ? 'picked' : '';
    if (right.indexOf(o.index) >= 0) return 'right';
    if (o.index === p.picked) return 'wrong';
    return '';
  }

  function optionMark(p, o, right) {
    if (!p.result || p.exam) return null;
    if (right.indexOf(o.index) >= 0) return html`<span class="opt-mark" aria-hidden="true">\u2713</span><span class="sr-only"> ${p.t('session.correct')}</span>`;
    if (o.index === p.picked) return html`<span class="opt-mark" aria-hidden="true">\u2717</span><span class="sr-only"> ${p.t('session.wrong')}</span>`;
    return null;
  }

  function Question(p) {
    var right = correctIndexes(p.item);
    var AnswerBlock = root.DojoAnswerBlock.AnswerBlock;
    var options = html`<ul class="opts" data-testid="options" data-arrow-own>${p.view.options.map(function (o, i) {
      var state = optionState(p, o, right);
      var mark = optionMark(p, o, right);
      return html`<li key=${o.index}><button type="button" class=${cls('opt', state)} disabled=${!!p.result}
        data-testid=${'option-' + i} data-index=${o.index} data-autofocus=${i === 0 ? 'true' : undefined} aria-pressed=${o.index === p.picked ? 'true' : 'false'}
        onClick=${function () { p.onSubmit({ index: o.index }, o.index); }}>
        <span class="key" aria-hidden="true">${i + 1}</span><span class="opt-text">${renderText(o.label)}</span>${mark}</button></li>`;
    })}</ul>`;
    return AnswerBlock({ cls: 'choice', testid: 'choice', fields: options });
  }

  function focusedOption(e, p) {
    var d = e.target && e.target.getAttribute && e.target.getAttribute('data-index');
    if (d === null || d === undefined) return -1;
    return p.view.options.findIndex(function (o) { return o.index === Number(d); });
  }

  function moveFocus(e, p, key) {
    if (p.exam) return null;
    var options = p.view.options;
    var cur = focusedOption(e, p);
    var next = cur < 0 ? 0 : (cur + (key === 'ArrowUp' ? options.length - 1 : 1)) % options.length;
    var doc = e.target && e.target.ownerDocument;
    var btn = doc && doc.querySelector('[data-testid="option-' + next + '"]');
    if (btn) { btn.focus(); e.preventDefault(); }
    return null;
  }

  function pickFocused(e, p) {
    var options = p.view.options;
    var at = p.exam ? -1 : focusedOption(e, p);
    if (at < 0) return null;
    return { input: { index: options[at].index }, picked: options[at].index };
  }

  function onKey(e, p) {
    if (p.result || DojoTypes.keyBlocked(e)) return null;
    var key = e.key;
    if (key === 'ArrowUp' || key === 'ArrowDown') return moveFocus(e, p, key);
    if (key === 'Enter' || key === ' ') return pickFocused(e, p);
    if (!/^[1-9]$/.test(key)) return null;
    var opt = p.view.options[Number(key) - 1];
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
