/*
 * ui/clip-text.js — DojoClipText.render(s, t, lang): feedback lines with the heard clip's sentence and its translation.
 * s = session screen state ({ result, cur, audioMark }); nothing unless answered, not exam, clip heard during this item.
 * Plain text nodes only (ASR/MT text is untrusted).
 */
(function (root) {
  'use strict';

  var h = typeof preact !== 'undefined' ? preact.h : null;

  // The audio API when the state is answered and not exam, else null.
  function audioFor(s, audio) {
    var A = audio || root.DojoAudio;
    return s && s.result && A && A.heardClip && A.clipMeta ? A : null;
  }

  // Metadata of the clip heard during this item, or null.
  function heardMeta(A, s, st) {
    var id = A.heardClip(st.id, s.audioMark);
    return id ? A.clipMeta(id) : null;
  }

  // Translation of the clip in lang, hidden when the MT check rejects it; null otherwise.
  function translationFor(m, lang, expected) {
    var tr = m.tr && typeof m.tr[lang] === 'string' && m.tr[lang] ? m.tr[lang] : null;
    var M = root.DojoFeedbackMt;
    if (tr && M && !M.mtVisible(tr, expected)) tr = null;
    return tr;
  }

  function render(s, t, lang, audio) {
    var A = audioFor(s, audio);
    var st = A && s.cur && s.cur.stimulus;
    if (!st) return null;
    var m = heardMeta(A, s, st);
    if (!m || typeof m.text !== 'string' || !m.text) return null;
    var tr = translationFor(m, lang, s.result.expected);
    return h('div', { class: 'clip-lines', 'data-testid': 'clip-lines' },
      h('p', { 'data-testid': 'clip-text' }, t('session.clipText') + ' ', h('span', { class: 'pre' }, m.text)),
      tr ? h('p', { 'data-testid': 'clip-tr' }, h('span', { 'data-testid': 'clip-tr-label' }, t(m.mt ? 'session.clipTrMachine' : 'session.clipTr')), ' ', h('span', { class: 'pre' }, tr)) : null);
  }

  var api = { render: render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoClipText = api;
})(typeof self !== 'undefined' ? self : this);
