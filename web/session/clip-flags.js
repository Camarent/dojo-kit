/* session/clip-flags.js — user flags on bad audio clips of the study session engine.
 * Exports DojoSessionClipFlags: create(ctx) -> { flagged(), isFlagged(id), setFlag(id, on), filterStimulus(st) }.
 * Flag = settings["clipFlag:<clipId>"] === true; un-flag writes the null tombstone with settings.ts[key] = now.
 */
(function (root) {
  'use strict';

  var PREFIX = 'clipFlag:';
  var ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var Speech = root.DojoSpeech || (typeof require === 'function' ? require('../speech.js') : null);

  function create(ctx) {
    function settings() {
      return ctx.store.doc.settings || {};
    }

    function isFlagged(id) {
      return typeof id === 'string' && settings()[PREFIX + id] === true;
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
      if (copy.audio.length === 0 && copy.hideText && !(Speech && Speech.lines(st).length)) delete copy.hideText;
      return copy;
    }

    return { flagged: flagged, isFlagged: isFlagged, setFlag: setFlag, filterStimulus: filterStimulus };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionClipFlags = api;
})(typeof self !== 'undefined' ? self : this);
