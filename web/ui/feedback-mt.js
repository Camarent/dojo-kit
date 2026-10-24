/*
 * ui/feedback-mt.js — DojoFeedbackMt.mtVisible(tr, answer): false when the translation adds nothing over the answer.
 * Hidden when tr, stripped of spaces/dots/dashes/commas, is empty, has no letters, or equals the stripped answer.
 */
(function (root) {
  'use strict';
  function strip(x) { return String(x == null ? '' : x).replace(/[\s.,\-–—]/g, ''); }
  function mtVisible(tr, answer) {
    var a = strip(tr);
    return !!a && /\p{L}/u.test(a) && a !== strip(answer);
  }
  var api = { mtVisible: mtVisible };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoFeedbackMt = api;
})(typeof self !== 'undefined' ? self : this);
