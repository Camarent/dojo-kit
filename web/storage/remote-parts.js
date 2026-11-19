/*
 * storage/remote-parts.js — cloud part docs: merge a part, fetch and watch parts 1..n, set the part limit, drop parts.
 */
(function (root) {
  'use strict';

  var adapters = root.DojoStorageAdapters || require('./adapters.js');
  var same = adapters.same;

  function installRemoteParts(s) {
    /** Merges a part doc into lastRemote and store.doc; keeps the dirty flag as it was. */
    function mergePart(p) {
      s.lastRemote = s.lastRemote ? s.mergeDocs(s.lastRemote, p) : p;
      var m = s.withCourse(s.mergeDocs(s.store.doc, p));
      if (same(m, s.store.doc)) return;
      var dirty = s.dirty;
      s.commit(m);
      s.dirty = dirty;
      s.notifyRemote();
    }
    /** Part k above s.partLimit is stale (main shrank below it): ignored. */
    function onPartSnapshot(k, snap) {
      if (k > s.partLimit) return;
      if (!snap.exists || (snap.metadata && snap.metadata.hasPendingWrites)) return;
      s.guarded(function () {
        var p = s.sanitize(snap.data());
        if (!p || s.foreignCourse(p)) return;
        mergePart(p);
      });
    }
    /** Reads the parts that are not watched yet (k > partUnsubs.length), then watches them. */
    function fetchPart(ref, k) {
      Promise.resolve().then(function () { return s.partRef(k).get(); })
        .then(function (snap) { if (s.ref === ref) onPartSnapshot(k, snap); })
        .catch(function (e) { s.warn('store.fetchParts', e); });
    }
    /** Reads and watches parts 1..n; call setPartLimit(n) first (see its comment). */
    s.fetchParts = function (n) {
      var ref = s.ref;
      for (var k = s.partUnsubs.length + 1; k <= n; k++) fetchPart(ref, k);
      s.watchParts(n);
    };
    /** One onSnapshot per part 1..n; the unsubscribers live in s.partUnsubs. */
    s.watchParts = function (n) {
      for (var k = s.partUnsubs.length + 1; k <= n; k++) {
        s.partUnsubs.push(s.partRef(k).onSnapshot(onPartSnapshot.bind(null, k), function () { /* listener errors: keep writing */ }));
      }
    };
    function dropParts(where) {
      s.partUnsubs.splice(0).forEach(function (u) { try { u(); } catch (e) { s.warn(where, e); } });
    }
    /**
     * Sets the part count of the main doc; unwatches parts above it (their docs stay in the db).
     * Order contract: call setPartLimit(n) before watchParts(n) or fetchParts(n); the limit gates onPartSnapshot.
     */
    s.setPartLimit = function (n) {
      s.partLimit = n;
      s.partUnsubs.splice(n).forEach(function (u) { try { u(); } catch (e) { s.warn('store.setPartLimit', e); } });
    };
    var dropMain = s.dropUnsub;
    s.dropUnsub = function (where) { dropMain(where); dropParts(where); };
  }

  var api = { installRemoteParts: installRemoteParts };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorageRemoteParts = api;
  }
})(typeof self !== 'undefined' ? self : this);
