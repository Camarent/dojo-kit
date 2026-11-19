/*
 * storage/write.js — write path: buildBody, startWrite, canWrite.
 */
(function (root) {
  'use strict';

  var adapters = root.DojoStorageAdapters || require('./adapters.js');
  var body = root.DojoStorageBody || require('./body.js');

  function installWrite(s) {
    s.buildBody = function () {
      var b = s.lastRemote ? s.withCourse(s.mergeDocs(s.store.doc, s.lastRemote)) : s.withCourse(s.store.doc);
      return body.buildBody(b, s.lastRemote, s.maxDocBytes);
    };
    function onWriteDone(r, b) {
      if (r !== s.ref) { s.dirty = true; return; }
      var known = b;
      try { if (s.lastRemote) known = s.mergeDocs(s.lastRemote, b); } catch (e) { s.warn('store.onWriteDone.merge', e); known = b; }
      s.lastRemote = known;
      s.setStatus(s.dirty ? 'saving' : 'cloud');
    }
    function onWriteFailed(r, e) {
      s.dirty = true;
      if (r !== s.ref || (e && e.cancelled)) return;
      if (e && adapters.FATAL_CODES.indexOf(e.code) >= 0) s.goLocal();
      else s.setStatus('error');
    }
    s.startWrite = function (b) {
      var r = s.ref;
      s.dirty = false;
      s.setStatus('saving');
      s.writing = s.db.setWithRetry(r, b).then(function () { onWriteDone(r, b); }, function (e) { onWriteFailed(r, e); }).then(function () {
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
