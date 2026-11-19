/*
 * storage/write.js — write path: buildBody, startWrite, canWrite.
 */
(function (root) {
  'use strict';

  var adapters = root.DojoStorageAdapters || require('./adapters.js');
  var body = root.DojoStorageBody || require('./body.js');

  function installWrite(s) {
    /** Cloud docs for the merged body: {docs, full, total, largest} or {error}; see body.buildDocs. */
    s.buildBody = function () {
      var b = s.lastRemote ? s.withCourse(s.mergeDocs(s.store.doc, s.lastRemote)) : s.withCourse(s.store.doc);
      var built = body.buildDocs(b, s.lastRemote, s.maxDocBytes, !!s.partRef);
      built.full = b;
      return built;
    };
    function kb(bytes) { return Math.ceil(bytes / 1000) + ' KB'; }
    function sizeDetail(built) { return kb(built.total) + ', doc ' + kb(built.largest); }
    /** Reason and status for a build that produced no docs: shrink is a write error, the rest is size. */
    s.buildFailed = function (built) {
      if (built.error === 'shrink') s.setReason('write-error', 'shrink');
      else s.setReason('write-too-large', sizeDetail(built));
      s.failed();
    };
    /** Writes parts 1..K in order, then the main doc last (the commit point); a failure stops the chain. */
    function writeDocs(docs, owner) {
      return docs.reduce(function (chain, doc, i) {
        return chain.then(function () {
          var ref = i === docs.length - 1 ? owner : s.partRef(i + 1);
          return s.db.setWithRetry(ref, doc, owner);
        });
      }, Promise.resolve());
    }
    function onWriteDone(r, full, parts) {
      if (r !== s.ref) { s.dirty = true; return; }
      var known = full;
      try { if (s.lastRemote) known = s.mergeDocs(s.lastRemote, full); } catch (e) { s.warn('store.onWriteDone.merge', e); known = full; }
      s.lastRemote = known;
      s.setReason('ok', '');
      s.setStatus(s.dirty ? 'saving' : 'cloud');
      s.setPartLimit(parts);
      if (parts > 0) s.watchParts(parts);
    }
    function onWriteFailed(r, e, built) {
      s.dirty = true;
      if (r !== s.ref || (e && e.cancelled)) return;
      if (e && e.code === 'invalid_argument') {
        s.setReason('write-too-large', sizeDetail(built));
        s.setStatus('error');
        return;
      }
      s.setReason('write-error', s.reasonDetail(e));
      if (e && adapters.FATAL_CODES.indexOf(e.code) >= 0) s.goLocal();
      else s.setStatus('error');
    }
    s.startWrite = function (built) {
      var r = s.ref;
      s.dirty = false;
      s.setStatus('saving');
      s.writing = writeDocs(built.docs, r).then(function () { onWriteDone(r, built.full, built.docs.length - 1); }, function (e) { onWriteFailed(r, e, built); }).then(function () {
        s.writing = null;
        if (s.pendingWrite) { s.pendingWrite = false; return s.store.flush(); }
      });
      return s.writing;
    };
    s.canWrite = function () { return s.mode === 'cloud' && s.ref && s.dirty && s.lastRemoteSeen; };
  }

  var api = { installWrite: installWrite };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorageWrite = api;
  }
})(typeof self !== 'undefined' ? self : this);
