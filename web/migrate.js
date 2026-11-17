/*
 * migrate.js — progress migration run at load, on import and on every commit.
 * DojoMigrate.create({ dojo, items, course, now }) -> function(doc) -> doc | null.
 * With course.srs.migrate the wasm migrateDoc runs (supersedes fold, ladder remap, unify; once per
 * course id, marked in doc.migrated). Without it, migrateProgress runs (supersedes fold only, no
 * marker). Returns the migrated document, or null when nothing changed. Without any supersedes
 * link and without srs.migrate the wasm core is never called. A refusal or a thrown wasm error
 * warns once and disables migration for the session (returns null).
 */
(function (root) {
  'use strict';

  function create(opts) {
    var dojo = opts.dojo;
    var course = opts.course || null;
    var now = opts.now || Date.now;
    var withMigrateDoc = !!(course && course.srs && course.srs.migrate);
    var links = (opts.items || []).filter(function (it) {
      return it && (it.supersedes || it.status === 'retired');
    }).map(function (it) { return { id: it.id, status: it.status, supersedes: it.supersedes }; });
    var members = (opts.items || []).filter(function (it) {
      return it && it.id && it.unit;
    }).map(function (it) { return { id: it.id, unit: it.unit, key: it.unit }; });
    var disabled = !withMigrateDoc && !links.some(function (l) { return l.supersedes; });

    function disable(why) {
      disabled = true;
      try { console.warn('progress migration disabled: ' + why); } catch { /* no console */ }
      return null;
    }

    return function migrate(doc) {
      if (disabled || !doc) return null;
      var r;
      try {
        r = withMigrateDoc
          ? dojo.call('migrateDoc', { doc: doc, course: course, items: links, members: members, now: now() })
          : dojo.call('migrateProgress', { doc: doc, items: links });
      } catch (e) {
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
