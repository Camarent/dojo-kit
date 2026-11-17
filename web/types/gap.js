/* types/gap.js — typed-answer (gap) question UI. Globals: preact, htm, DojoTypes. */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);

  function cls() {
    return Array.prototype.filter.call(arguments, Boolean).join(' ');
  }

  function canSubmit(state) { return state.text.trim() !== ''; }
  function submitOf(state) { return { input: { text: state.text }, picked: state.text }; }

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var text = p.state.text;
    var state = res && !p.exam ? (res.correct ? 'right' : 'wrong') : '';
    var AnswerBlock = root.DojoAnswerBlock.AnswerBlock;
    function submit() {
      if (res) return;
      // An empty or whitespace answer is never graded: show the inline hint instead.
      if (!canSubmit(p.state)) { p.setState({ emptyTried: true }); return; }
      p.onSubmit({ text: text }, text);
    }
    var emptyLine = !res && p.state.emptyTried && !canSubmit(p.state)
      ? html`<p class="gap-empty" data-testid="gap-empty" role="status">${t('session.emptyAnswer')}</p>` : null;
    var field = html`<form class="gap" data-testid="gap-form" onSubmit=${function (e) {
      e.preventDefault();
      submit();
    }}>
      <input type="text" inputmode=${p.item && p.item.inputMode ? p.item.inputMode : null} class=${cls('field', state)} value=${text} readOnly=${!!res} aria-readonly=${res ? 'true' : null} autocomplete="off" autocapitalize="off"
        autocorrect="off" spellcheck=${false} aria-label=${t('session.your_answer')} data-testid="gap-input" name="answer"
        ref=${p.inputRef} onInput=${function (e) { p.setState({ text: e.target.value }); }} />
      ${emptyLine}
    </form>`;
    var button = !res ? html`<button type="button" class="btn primary" data-testid="btn-submit"
      onClick=${submit}>${t('session.check')}</button>` : null;
    return AnswerBlock({ cls: 'gap-block', testid: 'gap', fields: field, submit: button });
  }

  // Each accepted answer renders like the expected-answer feedback line (DojoExt.textAll): ruby on marked kanji.
  function acceptedNodes(list) {
    var ext = root.DojoExt;
    var out = [];
    list.forEach(function (s, i) {
      if (i) out.push(' / ');
      out.push(ext && ext.textAll ? ext.textAll(s) : s);
    });
    return out;
  }

  function Extra(p) {
    var res = p.result;
    return res.accepted && res.accepted.length > 1
      ? html`<p data-testid="accepted">${p.t('session.accepted')}: <span class="pre">${acceptedNodes(res.accepted)}</span></p>`
      : null;
  }

  root.DojoTypes.register('gap', {
    Question: Question,
    canSubmit: canSubmit,
    submitOf: submitOf,
    answerTexts: function (item) { return item.answers || []; },
    initialState: function () { return { text: '', emptyTried: false }; },
    Extra: Extra
  });
})(typeof self !== 'undefined' ? self : this);
