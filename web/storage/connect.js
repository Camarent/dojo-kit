/*
 * storage/connect.js — cloud connect: attach remote snapshot, retry on absent claude/uid.
 */
(function (root) {
  'use strict';

  var adapters = root.DojoStorageAdapters || require('./adapters.js');
  var same = adapters.same;
  var parts = root.DojoStorageParts || require('./parts.js');
  /** Waits before each connect retry after a missing claude or uid; about 10 s in total. */
  var CONNECT_RETRY_DELAYS_MS = [1000, 2000, 3000, 4000];

  /** Copy of a remote doc without its parts key (the key never reaches store.doc). */
  function stripParts(doc) {
    var d = adapters.clone(doc);
    delete d.parts;
    return d;
  }

  function installCloud(s) {
    s.partRef = null;
    s.partUnsubs = [];
    function applyRemote(remote, localDoc) {
      var merged = remote ? s.withCourse(s.mergeDocs(localDoc, remote)) : localDoc;
      var saved = s.commit(merged);
      s.lastRemote = remote;
      s.lastRemoteSeen = true;
      s.dirty = !remote || !same(remote, saved);
      return !same(saved, localDoc);
    }
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
    function onPartSnapshot(snap) {
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
        .then(function (snap) { if (s.ref === ref) onPartSnapshot(snap); })
        .catch(function (e) { s.warn('store.fetchParts', e); });
    }
    function fetchParts(n) {
      var ref = s.ref;
      for (var k = s.partUnsubs.length + 1; k <= n; k++) fetchPart(ref, k);
      s.watchParts(n);
    }
    /** One onSnapshot per part 1..n; the unsubscribers live in s.partUnsubs. */
    s.watchParts = function (n) {
      for (var k = s.partUnsubs.length + 1; k <= n; k++) {
        s.partUnsubs.push(s.partRef(k).onSnapshot(onPartSnapshot, function () { /* listener errors: keep writing */ }));
      }
    };
    function dropParts(where) {
      s.partUnsubs.splice(0).forEach(function (u) { try { u(); } catch (e) { s.warn(where, e); } });
    }
    var dropMain = s.dropUnsub;
    s.dropUnsub = function (where) { dropMain(where); dropParts(where); };
    function onSnapshot(snap) {
      if (!snap.exists || (snap.metadata && snap.metadata.hasPendingWrites)) return;
      s.guarded(function () {
        var r = s.sanitize(snap.data());
        if (!r || s.foreignCourse(r)) return;
        var n = parts.partCount(r);
        var base = stripParts(r);
        s.lastRemote = s.lastRemote ? s.mergeDocs(s.lastRemote, base) : base;
        var m = s.withCourse(s.mergeDocs(s.store.doc, base));
        var cmp = n ? s.lastRemote : base;
        if (!same(m, cmp)) s.dirty = true;
        if (n && s.partRef && n > s.partUnsubs.length) fetchParts(n);
        if (same(m, s.store.doc)) return;
        var saved = s.commit(m);
        s.dirty = !same(saved, cmp);
        s.notifyRemote();
      });
    }
    function attachRemote(myGen, opened) {
      if (myGen !== s.gen) { s.setStatus('local'); return Promise.resolve(); }
      var remote = s.db.readRemote(opened.snap, opened.partSnaps);
      var changed = applyRemote(remote, s.store.doc);
      s.ref = opened.ref;
      s.partRef = opened.partRef || null;
      s.mode = 'cloud';
      s.setStatus('cloud');
      s.setReason('ok', '');
      s.dropUnsub('store.attachRemote.unsub');
      s.unsub = s.ref.onSnapshot(onSnapshot, function () { /* listener errors: keep writing */ });
      if (s.partRef) s.watchParts(opened.partSnaps ? opened.partSnaps.length : 0);
      var done = s.dirty ? s.store.flush() : Promise.resolve();
      return done.then(function () { if (changed) s.notifyRemote(); });
    }
    var connectDelays = s.opts.connectRetryDelaysMs || CONNECT_RETRY_DELAYS_MS;
    s.cancelConnect = function () {
      if (s.connectTimer !== null) { s.clearTimer(s.connectTimer); s.connectTimer = null; }
    };
    /** attempt = retries done so far; null on the provider path, where absent means local at once. */
    function connectError(e, myGen, attempt) {
      s.warn('store.connect', e);
      if (e && e.kind === 'wasm') { s.setReason('open-error', s.reasonDetail(e)); s.goLocal('error'); return; }
      if (e && e.kind === 'refused') { s.setReason('refused', s.reasonDetail(e)); s.goLocal('foreign'); return; }
      if (!e || e.kind !== 'absent') { s.setReason('open-error', s.reasonDetail(e)); s.goLocal('error'); return; }
      s.setReason(e.step || 'no-use', '');
      if (attempt === null || attempt >= connectDelays.length) { s.goLocal('local'); return; }
      if (myGen !== s.gen) return;
      s.connectTimer = s.setTimer(function () {
        s.connectTimer = null;
        if (myGen === s.gen) s.connect(myGen, attempt + 1);
      }, connectDelays[attempt]);
    }
    s.connect = function (myGen, attempt) {
      if (s.provider) {
        s.setStatus('syncing');
        return Promise.resolve().then(function () { return s.provider.openRef({ courseId: s.courseId, key: s.key }); })
          .then(function (opened) { return attachRemote(myGen, opened); }).catch(function (e) { connectError(e, myGen, null); });
      }
      s.setStatus('syncing');
      return Promise.resolve().then(function () {
        s.claude = typeof s.opts.claude === 'function' ? s.opts.claude() : s.opts.claude;
        if (!s.claude || typeof s.claude.use !== 'function') throw { kind: 'absent', step: 'no-claude' };
        return s.db.openRef();
      }).then(function (opened) { return attachRemote(myGen, opened); })
        .catch(function (e) { connectError(e, myGen, attempt || 0); });
    };
  }

  var api = { installCloud: installCloud };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorageConnect = api;
  }
})(typeof self !== 'undefined' ? self : this);
