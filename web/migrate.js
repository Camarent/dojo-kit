/*
 * migrate.js — folds retired predecessor progress into successor items.
 * DojoMigrate.create({ dojo, items }) -> function(doc) -> doc | null.
 * Returns the migrated document, or null when nothing folded. Without supersedes/retired links the
 * wasm core is never called. A refusal or a thrown wasm error warns once and disables migration
 * for the session (returns null).
 */
(function (root) {
  'use strict';

  function create(opts) {
    var dojo = opts.dojo;
    var links = (opts.items || []).filter(function (it) {
      return it && (it.supersedes || it.status === 'retired');
    }).map(function (it) { return { id: it.id, status: it.status, supersedes: it.supersedes }; });
    var disabled = links.length === 0;

    function disable(why) {
      disabled = true;
      try { console.warn('progress migration disabled: ' + why); } catch (e) { /* no console */ }
      return null;
    }

    return function migrate(doc) {
      if (disabled || !doc) return null;
      var r;
      try { r = dojo.call('migrateProgress', { doc: doc, items: links }); } catch (e) {
        return disable(e && e.message);
      }
      if (!r || r.error) return disable(r && (r.message || r.error));
      return r.doc || null;
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoMigrate = api;
})(typeof self !== 'undefined' ? self : this);
