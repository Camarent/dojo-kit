/*
 * ui/clip-text.js — DojoClipText.render(s, t, lang): feedback lines with the heard clip's sentence and its translation.
 * s = session screen state ({ result, cur, audioMark }); nothing unless answered, not exam, clip heard during this item.
 * Plain text nodes only (ASR/MT text is untrusted).
 */
(function (root) {
  'use strict';

  var h = typeof preact !== 'undefined' ? preact.h : null;

  function render(s, t, lang, audio) {
    var A = audio || root.DojoAudio;
    var st = s && s.cur && s.cur.stimulus;
    if (!s || !s.result || !st || !A || !A.heardClip || !A.clipMeta) return null;
    var id = A.heardClip(st.id, s.audioMark);
    var m = id ? A.clipMeta(id) : null;
    if (!m || typeof m.text !== 'string' || !m.text) return null;
    var tr = m.tr && typeof m.tr[lang] === 'string' && m.tr[lang] ? m.tr[lang] : null;
    var M = root.DojoFeedbackMt;
    if (tr && M && !M.mtVisible(tr, s.result.expected)) tr = null;
    return h('div', { class: 'clip-lines', 'data-testid': 'clip-lines' },
      h('p', { 'data-testid': 'clip-text' }, t('session.clipText') + ' ', h('span', { class: 'pre' }, m.text)),
      tr ? h('p', { 'data-testid': 'clip-tr' }, h('span', { 'data-testid': 'clip-tr-label' }, t(m.mt ? 'session.clipTrMachine' : 'session.clipTr')), ' ', h('span', { class: 'pre' }, tr)) : null);
  }

  var api = { render: render };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoClipText = api;
})(typeof self !== 'undefined' ? self : this);
