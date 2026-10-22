/*
 * storage/store.js — createStore with load, update, trim, buildBody.
 */
(function (root) {
  'use strict';

  var warn = root.DojoStorageWarn ? root.DojoStorageWarn.warn : require('./warn.js').warn;
  var adapters = root.DojoStorageAdapters || require('./adapters.js');
  var body = root.DojoStorageBody || require('./body.js');
  var clone = adapters.clone;
  var same = adapters.same;

  function initState(opts) {
    return {
      opts: opts, courseId: opts.courseId, dojo: opts.dojo, now: opts.now,
      ls: opts.localStorage || null, claude: opts.claude || null,
      migrate: opts.migrate || function () { return null; },
      onStatus: opts.onStatus || function () {},
      onRemoteChange: opts.onRemoteChange || function () {},
      flushEvery: opts.flushEvery || 5,
      maxDocBytes: opts.maxDocBytes || 800000,
      random: opts.random || Math.random,
      setTimer: opts.setTimeoutFn || function (fn, ms) { return setTimeout(fn, ms); },
      clearTimer: opts.clearTimeoutFn || function (h) { clearTimeout(h); },
      flushDelay: opts.flushDelayMs === undefined ? 2000 : opts.flushDelayMs,
      key: 'dojo.' + opts.courseId + '.progress.v1',
      mode: 'local', ref: null, unsub: null, lastRemote: null, lastRemoteSeen: false,
      dirty: false, answers: 0, writing: null, pendingWrite: false, backedUp: null,
      timer: null, retryTimer: null, retryCancel: null, detached: false, gen: 0,
      detachLifecycle: null,
      store: { doc: null, status: 'local' },
      warn: function (where, err) { warn(opts, where, err); }
    };
  }

  function installCore(s) {
    function wasm(name, args) {
      try { return s.dojo.call(name, args); } catch (e) { throw { kind: 'wasm', cause: e }; }
    }
    s.sanitize = function (doc) { return wasm('sanitize', doc); };
    s.mergeDocs = function (a, b) {
      var r = wasm('merge', { a: a, b: b });
      if (r && r.error) throw { kind: 'refused', code: r.error };
      return r;
    };
    s.withCourse = function (doc) {
      var d = clone(doc);
      d.course = s.courseId;
      return d;
    };
    s.foreignCourse = function (doc) {
      return typeof doc.course === 'string' && doc.course !== s.courseId;
    };
    s.freshDoc = function () {
      try { return s.withCourse(wasm('emptyProgress', {})); } catch (e) {
        s.warn('store.freshDoc', e);
        var st = 'error';
        if (s.store.status !== st) { s.store.status = st; try { s.onStatus(st); } catch (e2) { s.warn('store.freshDoc.onStatus', e2); } }
        return s.withCourse(adapters.fallbackDoc());
      }
    };
    s.setStatus = function (st) {
      if (s.store.status === st) return;
      s.store.status = st;
      try { s.onStatus(st); } catch (e) { s.warn('store.setStatus.onStatus', e); }
    };
    s.failed = function () { s.setStatus('error'); };
    s.notifyRemote = function () {
      try { s.onRemoteChange(); } catch (e) { s.warn('store.notifyRemote.onRemoteChange', e); }
    };
    s.guarded = function (fn, fallback) {
      try { return fn(); } catch (e) { s.warn('store.guarded.fn', e); s.failed(); return fallback; }
    };
  }

  function installCommit(s) {
    function mergedWithStored(doc) {
      var stored = s.local.readLocal();
      if (!stored || same(stored, doc)) return doc;
      return s.withCourse(s.mergeDocs(doc, stored));
    }
    s.commit = function (next) {
      var merged = next;
      var safe = true;
      try { merged = mergedWithStored(next); } catch (e) {
        if (!e || e.kind !== 'read') throw e;
        s.warn('store.commit.mergedWithStored', e);
        safe = false;
      }
      merged = s.migrate(merged) || merged;
      if (!safe || !s.local.writeLocal(merged)) s.failed();
      s.store.doc = merged;
      s.dirty = true;
      return merged;
    };
    s.cancelTimer = function () {
      if (s.timer !== null) { s.clearTimer(s.timer); s.timer = null; }
    };
    s.scheduleFlush = function () {
      if (s.timer !== null || s.detached) return;
      s.timer = s.setTimer(function () { s.timer = null; s.store.flush(); }, s.flushDelay);
    };
    s.dropUnsub = function (where) {
      if (s.unsub) { try { s.unsub(); } catch (e) { s.warn(where, e); } s.unsub = null; }
    };
    s.goLocal = function (status) {
      s.mode = 'local';
      s.ref = null;
      s.db.cancelRetry();
      s.dropUnsub('store.goLocal.unsub');
      s.setStatus(status || 'local');
    };
  }

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
      s.dropUnsub('store.attachRemote.unsub');
      s.unsub = s.ref.onSnapshot(onSnapshot, function () { /* listener errors: keep writing */ });
      var done = s.dirty ? s.store.flush() : Promise.resolve();
      return done.then(function () { if (changed) s.notifyRemote(); });
    }
    function connectError(e) {
      if (e && e.kind === 'wasm') { s.goLocal('error'); return; }
      s.goLocal(e && e.kind === 'refused' ? 'foreign' : 'local');
    }
    s.connect = function (myGen) {
      if (!s.claude || typeof s.claude.use !== 'function') { s.setStatus('local'); return Promise.resolve(); }
      s.setStatus('syncing');
      return s.db.openRef().then(function (opened) { return attachRemote(myGen, opened); }).catch(connectError);
    };
  }

  function installLoad(s) {
    var store = s.store;
    /** Reads local data, then connects to the cloud when available. Always resolves. */
    store.load = function () {
      var local = null;
      s.detached = false;
      var myGen = ++s.gen;
      var readFailed = false;
      try { local = s.local.readLocal(); } catch (e) {
        s.warn('store.load.readLocal', e);
        s.failed();
        if (!e || e.kind !== 'read') return Promise.resolve();
        readFailed = true;
      }
      if (local) {
        var folded = null;
        try { folded = s.migrate(local); } catch (e) { s.warn('store.load.migrate', e); folded = null; }
        store.doc = local;
        if (folded) s.guarded(function () { s.commit(folded); });
      }
      return s.connect(myGen).catch(function (e) { s.warn('store.load.connect', e); s.failed(); }).then(function () { if (readFailed) s.failed(); });
    };

    /** Applies fn to a copy of the doc; resetAt is preserved. Writes local at once and schedules a flush. */
    store.update = function (fn) {
      s.guarded(function () {
        var next = clone(store.doc);
        var resetAt = next.resetAt;
        fn(next);
        next.resetAt = resetAt;
        next.course = s.courseId;
        next.t = s.now();
        var clean = s.sanitize(next);
        if (!clean || s.foreignCourse(clean)) { s.failed(); return; }
        clean.resetAt = resetAt;
        s.commit(s.withCourse(clean));
        s.scheduleFlush();
      });
    };

    /** Counts an answer; every flushEvery-th one flushes. */
    store.noteAnswer = function () {
      s.answers++;
      if (s.answers >= s.flushEvery) store.flush();
    };

    /** Writes to the cloud when connected and dirty. Always resolves. */
    store.flush = function () {
      s.answers = 0;
      s.cancelTimer();
      if (!s.canWrite()) return Promise.resolve();
      if (s.writing) { s.pendingWrite = true; return s.writing; }
      var b;
      try { b = s.buildBody(); } catch (e) { s.warn('store.flush.buildBody', e); s.failed(); return Promise.resolve(); }
      if (!b) { s.failed(); return Promise.resolve(); }
      return s.startWrite(b);
    };
  }

  function installImport(s) {
    var store = s.store;
    /** Stable pretty JSON of the doc, for the paste adapter. */
    store.exportText = function () { return adapters.stable(store.doc, 2); };

    function incoming(text) {
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { s.warn('store.incoming.parse', e); return { code: 'invalid_json' }; }
      var doc = s.sanitize(parsed);
      if (!doc) return { code: 'not_progress' };
      if (s.foreignCourse(doc)) return { code: 'other_course' };
      return { doc: doc };
    }

    function countNew(before, after) {
      return Object.keys(after.items).filter(function (id) { return !(id in before.items); }).length;
    }

    function mergeIncoming(doc) {
      if (doc.resetAt >= store.doc.resetAt) {
        doc.resetAt = store.doc.resetAt;
      }
      var merged = s.withCourse(s.mergeDocs(store.doc, doc));
      if (same(merged, store.doc)) return { ok: true, added: 0 };
      var added = countNew(store.doc, merged);
      s.commit(merged);
      s.scheduleFlush();
      return { ok: true, added: added };
    }

    /** Merges exported text into the doc; never changes resetAt. */
    store.importText = function (text) {
      try {
        var inc = incoming(text);
        if (!inc.doc) return { ok: false, code: inc.code };
        return mergeIncoming(inc.doc);
      } catch (e) {
        s.warn('store.importText', e);
        s.failed();
        return { ok: false, code: 'other' };
      }
    };

    /** Explicit reset: the only operation that sets resetAt. */
    store.reset = function () {
      var ok = s.guarded(function () { s.commit(body.emptied(store.doc, s.now())); return true; }, false);
      return ok ? store.flush() : Promise.resolve();
    };
  }

  function hidden(win) {
    return !win.document || win.document.visibilityState === 'hidden';
  }

  function installLifecycle(s) {
    var store = s.store;
    /** Flushes on pagehide and when the page becomes hidden. */
    store.attachLifecycle = function (win) {
      if (s.detachLifecycle) { s.detachLifecycle(); s.detachLifecycle = null; }
      var target = win.document && win.document.addEventListener ? win.document : win;
      var onHide = function () { store.flush(); };
      var onVisibility = function () { if (hidden(win)) store.flush(); };
      win.addEventListener('pagehide', onHide);
      target.addEventListener('visibilitychange', onVisibility);
      s.detachLifecycle = function () {
        win.removeEventListener('pagehide', onHide);
        target.removeEventListener('visibilitychange', onVisibility);
      };
    };

    /** Stops lifecycle listeners, the flush timer and the remote subscription. */
    store.detach = function () {
      s.detached = true;
      s.gen++;
      if (s.detachLifecycle) { s.detachLifecycle(); s.detachLifecycle = null; }
      s.cancelTimer();
      s.db.cancelRetry();
      s.mode = 'local';
      s.ref = null;
      s.setStatus('local');
      s.dropUnsub('store.detach.unsub');
    };
  }

  /**
   * Creates a progress store; see docs/modules/web.md for the options and the method contract.
   * @param {object} opts
   */
  function createStore(opts) {
    var s = initState(opts);
    installCore(s);
    s.local = adapters.localAdapter(s);
    s.db = adapters.dbAdapter(s);
    installCommit(s);
    installWrite(s);
    installCloud(s);
    installLoad(s);
    installImport(s);
    installLifecycle(s);
    s.store.doc = s.freshDoc();
    return s.store;
  }

  var api = { createStore: createStore, sortKeys: adapters.sortKeys };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorage = api;
  }
})(typeof self !== 'undefined' ? self : this);
