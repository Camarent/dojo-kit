/* types/cloze.js — cloze (fill blanks inside a sentence) question UI. Globals: preact, htm, DojoTypes, DojoExt. */
(function (root) {
  'use strict';

  var h = preact.h;
  var html = htm.bind(h);
  var cls = root.DojoTypes.cls;
  var renderText = root.DojoTypes.renderText;

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

  function blankMark(t, ok) {
    if (ok === null || ok === undefined) return null;
    return html`<span class="cloze-mark" role="img"
      aria-label=${t(ok ? 'q.result.blankRight' : 'q.result.blankWrong')}>${ok ? '✓' : '✗'}</span>`;
  }

  // Answered without a mark (exam): the field is read-only and says it is not checked.
  function isUnchecked(c, ok) {
    return !!c.res && (ok === null || ok === undefined);
  }

  function blankClass(ok, locked) {
    return cls('cloze-field', ok === true && 'right', ok === false && 'wrong', locked && 'locked');
  }

  function blankField(c, n, fill) {
    var value = c.inputs[n] || '';
    var ok = c.marks ? c.marks[n] : null;
    var locked = isUnchecked(c, ok);
    return html`<span class="cloze-blank" key=${'b' + n}>
        <input type="text" class=${blankClass(ok, locked)}
          id=${'cloze-input-' + n} data-testid=${'cloze-input-' + n} name=${'blank-' + n} value=${value} readOnly=${!!c.res} aria-readonly=${c.res ? 'true' : null}
          style=${fill ? null : { '--blank-w': Math.max(value.length + 2, 6) + 'ch' }}
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck=${false}
          aria-label=${c.t('q.cloze.blank', { n: n + 1 })} ref=${n === 0 ? c.p.inputRef : null}
          onInput=${function (e) {
            var next = c.inputs.slice();
            next[n] = e.target.value;
            c.p.setState({ inputs: next });
          }} />
        ${locked ? html`<span class="cloze-caption" data-testid=${'cloze-caption-' + n}>${c.t('q.cloze.locked')}</span>` : blankMark(c.t, ok)}
      </span>`;
  }

  // Locked part: shown in a read-only field, skipped by tab order and never the first focus target.
  function lockedField(seg, key) {
    var text = seg.locked;
    return html`<input type="text" class="cloze-field locked" key=${key} name=${'locked-' + key} value=${text}
      readonly=${true} tabIndex=${-1} aria-readonly="true" aria-label=${text}
      autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck=${false} />`;
  }

  // Text of a view segment: locked parts carry `locked`; `text` is the older shape.
  function segText(seg) { return seg.locked !== undefined ? seg.locked : seg.text; }

  function renderGrouped(c, segments) {
    function renderBlank(n, fill) { return blankField(c, n, fill); }
    var groups = [];
    var currentGroup = [];

    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg.blank !== undefined) {
        currentGroup.push(seg);
        groups.push(currentGroup);
        currentGroup = [];
      } else if (seg.locked !== undefined) {
        // A locked part ends the group before it and opens the next one.
        if (currentGroup.length > 0) groups.push(currentGroup);
        currentGroup = [seg];
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
        } else if (seg.locked !== undefined) {
          textParts.push(lockedField(seg, keyPrefix + 'l' + textIndex));
          textIndex++;
        } else {
          textParts.push(h('span', { key: keyPrefix + 't' + textIndex }, renderText(textIndex === 0 && typeof segText(seg) === 'string' ? segText(seg).replace(/^ +/, '') : segText(seg))));
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

  function Question(p) {
    var t = p.t;
    var res = p.result;
    var inputs = p.state.inputs;
    var c = {
      p: p,
      t: t,
      res: res,
      inputs: inputs,
      marks: res && !p.exam && res.detail ? res.detail.results : null
    };

    var blanksCount = p.view.segments.filter(function (seg) { return seg.blank !== undefined; }).length;
    var isMultiBlank = blanksCount >= 2;

    var AnswerBlock = root.DojoAnswerBlock.AnswerBlock;
    var hint = html`<p class="cloze-hint">${t('q.cloze.hint')}</p>`;
    var submit = !res ? html`<button type="button" class="btn primary" disabled=${!canSubmit(p.state)} data-testid="btn-submit"
      onClick=${function () { p.onSubmit({ inputs: inputs }, inputs); }}>${t('session.check')}</button>` : null;

    if (isMultiBlank) {
      return AnswerBlock({ cls: 'cloze', testid: 'cloze', prompt: hint, submit: submit,
        fields: html`<div class="cloze-groups">${renderGrouped(c, p.view.segments)}</div>` });
    } else {
      var sentence = html`<p class="cloze-sentence">${p.view.segments.map(function (seg, i) {
        if (seg.blank !== undefined) return blankField(c, seg.blank);
        if (seg.locked !== undefined) return lockedField(seg, 'l' + i);
        return h('span', { key: 't' + i }, renderText(segText(seg)));
      })}</p>`;
      return AnswerBlock({ cls: 'cloze', testid: 'cloze', prompt: hint, submit: submit, fields: sentence });
    }
  }

  root.DojoTypes.register('cloze', {
    Question: Question,
    canSubmit: canSubmit,
    submitOf: function (state) { return { input: { inputs: state.inputs }, picked: state.inputs }; },
    answerTexts: function (item) {
      return (item.parts || []).filter(function (p) { return Array.isArray(p); }).map(function (p) { return p[0]; });
    },
    initialState: initialState,
    onKey: onKey
  });
})(typeof self !== 'undefined' ? self : this);
