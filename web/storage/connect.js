/*
 * storage/connect.js — cloud connect: attach remote snapshot, retry on absent claude/uid.
 */
(function (root) {
  'use strict';

  var adapters = root.DojoStorageAdapters || require('./adapters.js');
  var same = adapters.same;
  /** Waits before each connect retry after a missing claude or uid; about 10 s in total. */
  var CONNECT_RETRY_DELAYS_MS = [1000, 2000, 3000, 4000];

  function installCloud(s) {
    function applyRemote(remote, localDoc) {
      var merged = remote ? s.withCourse(s.mergeDocs(localDoc, remote)) : localDoc;
      var saved = s.commit(merged);
      s.lastRemote = remote;
      s.lastRemoteSeen = true;
      s.dirty = !remote || !same(remote, saved);
      return !same(saved, localDoc);
    }
    function onSnapshot(snap) {
      if (!snap.exists || (snap.metadata && snap.metadata.hasPendingWrites)) return;
      s.guarded(function () {
        var r = s.sanitize(snap.data());
        if (!r || s.foreignCourse(r)) return;
        s.lastRemote = s.lastRemote ? s.mergeDocs(s.lastRemote, r) : r;
        var m = s.withCourse(s.mergeDocs(s.store.doc, r));
        if (!same(m, r)) s.dirty = true;
        if (same(m, s.store.doc)) return;
        var saved = s.commit(m);
        s.dirty = !same(saved, r);
        s.notifyRemote();
      });
    }
    function attachRemote(myGen, opened) {
      if (myGen !== s.gen) { s.setStatus('local'); return Promise.resolve(); }
      var remote = s.db.readRemote(opened.snap);
      var changed = applyRemote(remote, s.store.doc);
      s.ref = opened.ref;
      s.mode = 'cloud';
      s.setStatus('cloud');
      s.setReason('ok', '');
      s.dropUnsub('store.attachRemote.unsub');
      s.unsub = s.ref.onSnapshot(onSnapshot, function () { /* listener errors: keep writing */ });
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
