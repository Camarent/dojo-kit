/*
 * storage.js — progress store with local, artifact-db and paste adapters.
 * DojoStorage.createStore(options) -> store (see docs/modules/web.md for the option and method list).
 * All sanitize/merge logic runs through options.dojo.call (the wasm core); nothing is re-implemented here.
 */
(function (root) {
  'use strict';

  function pickWarn(root) {
    return root.DojoStorageWarn ? root.DojoStorageWarn.warn : (typeof require !== 'undefined' ? require('./storage/warn.js').warn : function () {});
  }

  function loadAdapters(warn) {
    try {
      require('./storage/adapters.js');
    } catch (e) { warn({}, 'storage.adapters.require', e); }
  }

  function loadStore(root, warn) {
    try {
      return require('./storage/store.js');
    } catch (e) { warn({}, 'storage.store.require', e); return root.DojoStorage || null; }
  }

  function exportApi(root, api) {
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = api;
    } else {
      root.DojoStorage = api;
    }
  }

  var warn = pickWarn(root);
  loadAdapters(warn);
  var store = loadStore(root, warn);
  exportApi(root, store || { createStore: undefined, sortKeys: undefined });
})(typeof self !== 'undefined' ? self : this);
