/* session/clip-flags.js — user flags on bad audio clips of the study session engine.
 * Exports DojoSessionClipFlags: create(ctx) -> { flagged(), isFlagged(id), setFlag(id, on), filterStimulus(st) }.
 * Flag = settings["clipFlag:<clipId>"] === true; un-flag writes the null tombstone with settings.ts[key] = now.
 * Read-through: optional ctx.clipMeta(id) -> {supersedes:[ids]}|null; while settings has no own key for an id (null tombstone counts), isFlagged = any predecessor flagged, heardAt = max predecessor heardAt. No writes.
 * Heard = settings["heard:<clipId>"] = strictly increasing number (ms-based) of the last playback start; heardAt(id) -> number|undefined, markHeard(id).
 */
(function (root) {
  'use strict';

  var PREFIX = 'clipFlag:';
  var HEARD = 'heard:';
  var ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var Speech = root.DojoSpeech || (typeof require === 'function' ? require('../speech.js') : null);

  function create(ctx) {
    function settings() {
      return ctx.store.doc.settings || {};
    }

    function preds(id) {
      var m = typeof ctx.clipMeta === 'function' ? ctx.clipMeta(id) : null;
      return m && Array.isArray(m.supersedes) ? m.supersedes : [];
    }

    function isFlagged(id) {
      if (typeof id !== 'string') return false;
      var s = settings();
      if (Object.prototype.hasOwnProperty.call(s, PREFIX + id)) return s[PREFIX + id] === true;
      return preds(id).some(function (p) { return s[PREFIX + p] === true; });
    }

    function flagged() {
      var s = settings();
      return Object.keys(s).filter(function (k) {
        return k.indexOf(PREFIX) === 0 && s[k] === true;
      }).map(function (k) { return k.slice(PREFIX.length); }).sort();
    }

    function setFlag(id, on) {
      if (typeof id !== 'string' || !ID_RE.test(id)) return { error: 'invalid_clip_id' };
      if (isFlagged(id) === !!on) return {};
      var key = PREFIX + id;
      ctx.store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings.ts = doc.settings.ts || {};
        doc.settings[key] = on ? true : null;
        doc.settings.ts[key] = ctx.now();
      });
      return {};
    }

    function filterStimulus(st) {
      if (!st || !Array.isArray(st.audio) || !st.audio.some(isFlagged)) return st;
      var copy = Object.assign({}, st);
      copy.audio = st.audio.filter(function (id) { return !isFlagged(id); });
      return copy;
    }

    function heardAt(id) {
      var s = settings();
      var v = s[HEARD + id];
      if (typeof v === 'number') return v;
      var best;
      preds(id).forEach(function (p) {
        var h = s[HEARD + p];
        if (typeof h === 'number' && (best === undefined || h > best)) best = h;
      });
      return best;
    }

    function markHeard(id) {
      if (typeof id !== 'string' || !ID_RE.test(id)) return;
      var s = settings();
      var top = 0;
      Object.keys(s).forEach(function (k) { if (k.indexOf(HEARD) === 0 && typeof s[k] === 'number' && s[k] > top) top = s[k]; });
      ctx.store.update(function (doc) {
        doc.settings = doc.settings || {};
        doc.settings.ts = doc.settings.ts || {};
        doc.settings[HEARD + id] = Math.max(ctx.now(), top + 1);
        doc.settings.ts[HEARD + id] = ctx.now();
      });
    }

    return { flagged: flagged, isFlagged: isFlagged, setFlag: setFlag, filterStimulus: filterStimulus, heardAt: heardAt, markHeard: markHeard };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionClipFlags = api;
})(typeof self !== 'undefined' ? self : this);
