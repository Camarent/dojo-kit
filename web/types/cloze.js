/* types/cloze.js — cloze (fill blanks inside a sentence) question UI. Globals: preact, htm, DojoTypes, DojoExt. */
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

  function canSubmit(state) {
    return state.inputs.every(function (v) { return v.trim() !== ''; });
  }

  function initialState(view) {
    var inputs = [];
    for (var i = 0; i < view.blanks; i++) inputs.push('');
    return { inputs: inputs };
  }

  function onKey(e, p) {
    var el = e.target;
    var m = /^cloze-input-(\d+)$/.exec(el && el.id || '');
    if (p.result || e.key !== 'Enter' || !m) return null;
    var n = Number(m[1]);
    if (n < p.view.blanks - 1) {
      var next = el.ownerDocument.getElementById('cloze-input-' + (n + 1));
      if (next) {
        e.preventDefault();
        next.focus();
      }
      return null;
    }
    return canSubmit(p.state) ? { input: { inputs: p.state.inputs }, picked: p.state.inputs } : null;
  }

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var inputs = p.state.inputs;
    var marks = res && !p.exam && res.detail ? res.detail.results : null;

    function renderBlank(n, fill) {
      var value = inputs[n] || '';
      var ok = marks ? marks[n] : null;
      return html`<span class="cloze-blank" key=${'b' + n}>
        <input type="text" class=${cls('cloze-field', ok === true && 'right', ok === false && 'wrong')}
          id=${'cloze-input-' + n} data-testid=${'cloze-input-' + n} name=${'blank-' + n} value=${value} readOnly=${!!res} aria-readonly=${res ? 'true' : null}
          style=${fill ? null : { '--blank-w': Math.max(value.length + 2, 6) + 'ch' }}
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck=${false}
          aria-label=${t('q.cloze.blank', { n: n + 1 })} ref=${n === 0 ? p.inputRef : null}
          onInput=${function (e) {
            var next = inputs.slice();
            next[n] = e.target.value;
            p.setState({ inputs: next });
          }} />
        ${ok === null || ok === undefined ? null : html`<span class="cloze-mark" role="img"
          aria-label=${t(ok ? 'q.result.blankRight' : 'q.result.blankWrong')}>${ok ? '✓' : '✗'}</span>`}
      </span>`;
    }

    function renderGrouped(segments) {
      var groups = [];
      var currentGroup = [];

      for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (seg.blank !== undefined) {
          currentGroup.push(seg);
          groups.push(currentGroup);
          currentGroup = [];
        } else {
          currentGroup.push(seg);
        }
      }

      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }

      return groups.map(function (group, gi) {
        var textParts = [];
        var blankEl = null;
        var keyPrefix = 'g' + gi + '-';
        var textIndex = 0;

        for (var j = 0; j < group.length; j++) {
          var seg = group[j];
          if (seg.blank !== undefined) {
            blankEl = renderBlank(seg.blank, true);
          } else {
            textParts.push(h('span', { key: keyPrefix + 't' + textIndex }, renderText(textIndex === 0 && typeof seg.text === 'string' ? seg.text.replace(/^ +/, '') : seg.text)));
            textIndex++;
          }
        }

        if (blankEl !== null) {
          return html`<div class="cloze-group" key=${'g' + gi}><span class="cloze-label">${textParts}</span>${blankEl}</div>`;
        } else {
          return html`<div class="cloze-group cloze-group-text" key=${'g' + gi}>${textParts}</div>`;
        }
      });
    }

    var blanksCount = p.view.segments.filter(function (seg) { return seg.blank !== undefined; }).length;
    var isMultiBlank = blanksCount >= 2;

    if (isMultiBlank) {
      return html`<div class="cloze" data-testid="cloze">
        <p class="cloze-hint">${t('q.cloze.hint')}</p>
        <div class="cloze-groups">${renderGrouped(p.view.segments)}</div>
        ${!res ? html`<button type="button" class="btn primary" disabled=${!canSubmit(p.state)} data-testid="btn-submit"
          onClick=${function () { p.onSubmit({ inputs: inputs }, inputs); }}>${t('session.check')}</button>` : null}
      </div>`;
    } else {
      return html`<div class="cloze" data-testid="cloze">
        <p class="cloze-hint">${t('q.cloze.hint')}</p>
        <p class="cloze-sentence">${p.view.segments.map(function (seg, i) {
          return seg.blank === undefined ? h('span', { key: 't' + i }, renderText(seg.text)) : renderBlank(seg.blank);
        })}</p>
        ${!res ? html`<button type="button" class="btn primary" disabled=${!canSubmit(p.state)} data-testid="btn-submit"
          onClick=${function () { p.onSubmit({ inputs: inputs }, inputs); }}>${t('session.check')}</button>` : null}
      </div>`;
    }
  }

  root.DojoTypes.register('cloze', {
    Question: Question,
    canSubmit: canSubmit,
    answerTexts: function (item) {
      return (item.parts || []).filter(function (p) { return typeof p !== 'string'; }).map(function (p) { return p[0]; });
    },
    initialState: initialState,
    onKey: onKey
  });
})(typeof self !== 'undefined' ? self : this);
