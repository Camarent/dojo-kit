/*
 * ui/catalog-audio.js — Catalog helpers for numeric items with an audio stimulus.
 * Exposed as root.DojoCatalogAudio, or module.exports under node.
 * create(content) -> { stimulusOf(item), isAudioNumeric(item), label(item, expected), playButton(p, item, played) }.
 */
(function (root) {
  'use strict';

  var html = htm.bind(preact.h);

  function hasClips(st) { return !!st && Array.isArray(st.audio) && st.audio.length > 0; }

  function create(content) {
    var byId = Object.create(null);
    ((content && content.stimuli) || []).forEach(function (st) { if (st && typeof st.id === 'string') byId[st.id] = st; });

    function stimulusOf(item) { return item && item.stimulus && byId[item.stimulus] ? byId[item.stimulus] : null; }

    function isAudioNumeric(item) {
      var st = stimulusOf(item);
      if (!st || !(hasClips(st) || st.hideText)) return false;
      return item.inputMode === 'numeric' || item.type === 'numeric' || item.type === 'gap';
    }

    function label(item, expected) {
      return isAudioNumeric(item) && typeof expected === 'string' && expected !== '' ? expected : null;
    }

    // Play button for the stimulus clip (TTS lines as fallback); null when the stimulus has neither.
    function playButton(p, item, audio) {
      var st = stimulusOf(item);
      var C = root.DojoCommon;
      if (!st || !audio || !C) return null;
      var A = root.DojoAudio;
      var ids = hasClips(st) ? st.audio.filter(function (id) { return !(p.engine && p.engine.isClipFlagged && p.engine.isClipFlagged(id)); }) : [];
      var clip = ids.length && A && A.ready && A.ready() ? { sid: st.id, ids: ids } : null;
      var lines = C.speechLines ? C.speechLines(st) : [];
      if (!clip && !lines.length) return null;
      return html`<div class="qline centred" data-testid="detail-play"><${C.Playback} audio=${audio} lines=${lines} clip=${clip} testid="play-detail" pid=${'d:' + st.id} /></div>`;
    }

    // Playback props for the detail button (never an exam: no once-only lock).
    function audioProps(p, setFail, failed) {
      var C = root.DojoCommon, Speech = root.DojoSpeech;
      if (!Speech || !C) return null;
      var cfg = C.speechCfg(p.course, p.store);
      this.played = this.played || {};
      return { t: p.t, win: p.win, cfg: cfg, exam: false, uiLang: p.lang, played: this.played, released: {},
        status: failed ? 'failed' : Speech.status(cfg, p.win), onFail: setFail };
    }

    return { audioProps: audioProps, stimulusOf: stimulusOf, isAudioNumeric: isAudioNumeric, label: label, playButton: playButton };
  }

  var api = { create: create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DojoCatalogAudio = api;
})(typeof self !== 'undefined' ? self : this);
