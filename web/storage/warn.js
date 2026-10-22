/*
 * storage/warn.js — observable warning hook for storage failures.
 */
(function (root) {
  'use strict';

  function warn(options, where, err) {
    try {
      if (options && typeof options.onWarn === 'function') {
        options.onWarn(where, err);
      } else if (options && options.debug) {
        console.warn(where, err);
      }
    } catch (e) { /* hook failures are dropped */ }
  }

  var api = { warn: warn };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorageWarn = api;
  }
})(typeof self !== 'undefined' ? self : this);
