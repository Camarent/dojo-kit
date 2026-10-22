/*
 * storage.js — progress store with local, artifact-db and paste adapters.
 * DojoStorage.createStore(options) -> store (see docs/modules/web.md for the option and method list).
 * All sanitize/merge logic runs through options.dojo.call (the wasm core); nothing is re-implemented here.
 */
(function (root) {
  'use strict';

  var warn = root.DojoStorageWarn ? root.DojoStorageWarn.warn : (typeof require !== 'undefined' ? require('./storage/warn.js').warn : function () {});
  var adapters;
  var store;

  try {
    adapters = require('./storage/adapters.js');
  } catch (e) { warn({}, 'storage.adapters.require', e); adapters = root.DojoStorageAdapters || null; }

  try {
    store = require('./storage/store.js');
  } catch (e) { warn({}, 'storage.store.require', e); store = root.DojoStorage || null; }

  var api = store || { createStore: store ? store.createStore : undefined, sortKeys: store ? store.sortKeys : undefined };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorage = api;
  }
})(typeof self !== 'undefined' ? self : this);
