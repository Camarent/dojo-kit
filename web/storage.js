/*
 * storage.js — progress store with local, artifact-db and paste adapters.
 * DojoStorage.createStore(options) -> store (see docs/modules/web.md for the option and method list).
 * All sanitize/merge logic runs through options.dojo.call (the wasm core); nothing is re-implemented here.
 */
(function (root) {
  'use strict';

  var FATAL_CODES = ['invalid_argument', 'revoked', 'not_granted', 'capability_disabled', 'capability_removed'];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (!v || typeof v !== 'object') return v;
    var out = Object.create(null);
    var DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
    Object.keys(v).sort().forEach(function (k) {
      if (DANGEROUS_KEYS.indexOf(k) === -1) {
        out[k] = sortKeys(v[k]);
      }
    });
    return out;
  }

  function stable(v, indent) { return JSON.stringify(sortKeys(v), null, indent); }
  function same(a, b) { return stable(a) === stable(b); }
  function count(o) { return o && typeof o === 'object' ? Object.keys(o).length : 0; }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function fallbackDoc() {
    return { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {} };
  }

  /**
   * Creates a progress store; see docs/modules/web.md for the options and the method contract.
   * @param {object} opts
   */
  function createStore(opts) {
    var courseId = opts.courseId;
    var dojo = opts.dojo;
    var now = opts.now;
    var ls = opts.localStorage || null;
    var claude = opts.claude || null;
    var migrate = opts.migrate || function () { return null; };
    var onStatus = opts.onStatus || function () {};
    var onRemoteChange = opts.onRemoteChange || function () {};
    var flushEvery = opts.flushEvery || 5;
    var maxDocBytes = opts.maxDocBytes || 800000;
    var random = opts.random || Math.random;
    var setTimer = opts.setTimeoutFn || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = opts.clearTimeoutFn || function (h) { clearTimeout(h); };
    var flushDelay = opts.flushDelayMs === undefined ? 2000 : opts.flushDelayMs;
    var key = 'dojo.' + courseId + '.progress.v1';

    var mode = 'local';
    var ref = null;
    var unsub = null;
    var lastRemote = null;
    var lastRemoteSeen = false;
    var dirty = false;
    var answers = 0;
    var writing = null;
    var pendingWrite = false;
    var backedUp = null;
    var timer = null;
    var retryTimer = null;
    var retryCancel = null;
    var detached = false;
    var gen = 0;
    var detachLifecycle = null;
    var store = { doc: null, status: 'local' };

    function setStatus(s) {
      if (store.status === s) return;
      store.status = s;
      try { onStatus(s); } catch (e) { /* listener errors never break the store */ }
    }

    function wasm(name, args) {
      try { return dojo.call(name, args); } catch (e) { throw { kind: 'wasm', cause: e }; }
    }

    function sanitize(doc) { return wasm('sanitize', doc); }

    function mergeDocs(a, b) {
      var r = wasm('merge', { a: a, b: b });
      if (r && r.error) throw { kind: 'refused', code: r.error };
      return r;
    }

    function withCourse(doc) {
      var d = clone(doc);
      d.course = courseId;
      return d;
    }

    function foreignCourse(doc) {
      return typeof doc.course === 'string' && doc.course !== courseId;
    }

    function freshDoc() {
      try { return withCourse(wasm('emptyProgress', {})); } catch (e) {
        setStatus('error');
        return withCourse(fallbackDoc());
      }
    }

    function readRaw() {
      try { return ls ? ls.getItem(key) : null; } catch (e) { throw { kind: 'read' }; }
    }

    function backup(raw) {
      if (backedUp === raw) return true;
      try { ls.setItem(key + '.unreadable.' + now(), raw); } catch (e) { return false; }
      backedUp = raw;
      return true;
    }

    function parseStored(raw) {
      try {
        var d = sanitize(JSON.parse(raw));
        return d && !foreignCourse(d) ? withCourse(d) : null;
      } catch (e) {
        if (e && e.kind === 'wasm') throw e;
        return null;
      }
    }

    function readLocal() {
      var raw = readRaw();
      if (!raw) return null;
      var d = parseStored(raw);
      if (!d && !backup(raw)) throw { kind: 'read' };
      return d;
    }

    function writeLocal(doc) {
      try { if (ls) ls.setItem(key, JSON.stringify(doc)); return true; } catch (e) { return false; }
    }

    function mergedWithStored(doc) {
      var stored = readLocal();
      if (!stored || same(stored, doc)) return doc;
      return withCourse(mergeDocs(doc, stored));
    }

    function failed() { setStatus('error'); }

    function commit(next) {
      var merged = next;
      var safe = true;
      try { merged = mergedWithStored(next); } catch (e) {
        if (!e || e.kind !== 'read') throw e;
        safe = false;
      }
      merged = migrate(merged) || merged;
      if (!safe || !writeLocal(merged)) failed();
      store.doc = merged;
      dirty = true;
      return merged;
    }

    function notifyRemote() {
      try { onRemoteChange(); } catch (e) { /* listener errors never break the store */ }
    }

    function guarded(fn, fallback) {
      try { return fn(); } catch (e) { failed(); return fallback; }
    }

    function cancelTimer() {
      if (timer !== null) { clearTimer(timer); timer = null; }
    }

    function scheduleFlush() {
      if (timer !== null || detached) return;
      timer = setTimer(function () { timer = null; store.flush(); }, flushDelay);
    }

    function cancelRetry() {
      if (retryTimer !== null) { clearTimer(retryTimer); retryTimer = null; }
      if (retryCancel) { var c = retryCancel; retryCancel = null; c(); }
    }

    function waitRetry(r) {
      return new Promise(function (res, rej) {
        retryCancel = function () { rej({ cancelled: true }); };
        retryTimer = setTimer(function () {
          retryTimer = null;
          retryCancel = null;
          if (ref !== r) rej({ cancelled: true }); else res();
        }, 500 + random() * 1000);
      });
    }

    function setWithRetry(r, body) {
      return Promise.resolve().then(function () { return r.set(body); }).catch(function (e) {
        if (e && e.code && e.code !== 'unavailable') throw e;
        return waitRetry(r).then(function () { return r.set(body); });
      });
    }

    function goLocal(status) {
      mode = 'local';
      ref = null;
      cancelRetry();
      if (unsub) { try { unsub(); } catch (e) { /* ignore */ } unsub = null; }
      setStatus(status || 'local');
    }

    function shrinks(body) {
      return !!lastRemote && body.resetAt === lastRemote.resetAt &&
        (count(body.items) < count(lastRemote.items) || count(body.exams) < count(lastRemote.exams));
    }

    function buildBody() {
      var body = lastRemote ? withCourse(mergeDocs(store.doc, lastRemote)) : withCourse(store.doc);
      if (shrinks(body)) return null;
      if (JSON.stringify(body).length > maxDocBytes) {
        body.stats.days = {};
        body.stats.newByDay = {};
        Object.keys(body.stats).forEach(function (k) { if (k.indexOf('newBy:') === 0) body.stats[k] = {}; });
        if (JSON.stringify(body).length > maxDocBytes) {
          var dr = body.examDraft && typeof body.examDraft === 'object' ? JSON.parse(JSON.stringify(body.examDraft)) : null;
          if (dr) body.examDraft = dr;
          if (dr && typeof dr === 'object' && !dr.closed) {
            if (Array.isArray(dr.answers)) {
              dr.answers = dr.answers.map(function (a) { return { i: a.i, c: a.c }; });
            }
            if (JSON.stringify(body).length > maxDocBytes) {
              var closed = Array.isArray(dr.closedSids) ? dr.closedSids : [];
              var top = closed.length ? closed[closed.length - 1] : null;
              if (top && typeof top.sid === 'string') {
                body.examDraft = { sid: top.sid, updatedAt: top.updatedAt, closed: 'expired', closedSids: closed };
              } else {
                delete body.examDraft;
              }
            }
          }
          if (JSON.stringify(body).length > maxDocBytes) return null;
        }
      }
      return body;
    }

    function onWriteDone(r, body) {
      if (r !== ref) { dirty = true; return; }
      var known = body;
      try { if (lastRemote) known = mergeDocs(lastRemote, body); } catch (e) { known = body; }
      lastRemote = known;
      setStatus(dirty ? 'saving' : 'cloud');
    }

    function onWriteFailed(r, e) {
      dirty = true;
      if (r !== ref || (e && e.cancelled)) return;
      if (e && FATAL_CODES.indexOf(e.code) >= 0) goLocal();
      else setStatus('error');
    }

    function startWrite(body) {
      var r = ref;
      dirty = false;
      setStatus('saving');
      writing = setWithRetry(r, body).then(function () { onWriteDone(r, body); }, function (e) { onWriteFailed(r, e); }).then(function () {
        writing = null;
        if (pendingWrite) { pendingWrite = false; return store.flush(); }
      });
      return writing;
    }

    function canWrite() { return mode === 'cloud' && ref && dirty && lastRemoteSeen; }

    function applyRemote(remote, localDoc) {
      var merged = remote ? withCourse(mergeDocs(localDoc, remote)) : localDoc;
      var saved = commit(merged);
      lastRemote = remote;
      lastRemoteSeen = true;
      dirty = !remote || !same(remote, saved);
      return !same(saved, localDoc);
    }

    function onSnapshot(s) {
      if (!s.exists || (s.metadata && s.metadata.hasPendingWrites)) return;
      guarded(function () {
        var r = sanitize(s.data());
        if (!r || foreignCourse(r)) return;
        lastRemote = lastRemote ? mergeDocs(lastRemote, r) : r;
        var m = withCourse(mergeDocs(store.doc, r));
        if (!same(m, r)) dirty = true;
        if (same(m, store.doc)) return;
        var saved = commit(m);
        dirty = !same(saved, r);
        notifyRemote();
      });
    }

    function openRef() {
      return Promise.all([
        Promise.resolve().then(function () { return claude.use('db'); }).catch(function () { return null; }),
        Promise.resolve().then(function () { return claude.use('user'); }).catch(function () { return null; })
      ]).then(function (caps) {
        if (!caps[0] || !caps[1]) throw { kind: 'absent' };
        return Promise.resolve(caps[1].id()).then(function (uid) {
          if (!uid) throw { kind: 'absent' };
          var r = caps[0].doc('data/users/' + uid + '/progress-' + courseId);
          return Promise.resolve(r.get()).then(function (snap) { return { ref: r, snap: snap }; });
        });
      });
    }

    function readRemote(snap) {
      if (!snap || !snap.exists) return null;
      var remote = sanitize(snap.data());
      if (!remote) throw { kind: 'refused', code: 'foreign' };
      return remote;
    }

    function attachRemote(myGen, opened) {
      if (myGen !== gen) { setStatus('local'); return Promise.resolve(); }
      var remote = readRemote(opened.snap);
      var changed = applyRemote(remote, store.doc);
      ref = opened.ref;
      mode = 'cloud';
      setStatus('cloud');
      if (unsub) { try { unsub(); } catch (e) { /* ignore */ } unsub = null; }
      unsub = ref.onSnapshot(onSnapshot, function () { /* listener errors: keep writing */ });
      var done = dirty ? store.flush() : Promise.resolve();
      return done.then(function () { if (changed) notifyRemote(); });
    }

    function connectError(e) {
      if (e && e.kind === 'wasm') { goLocal('error'); return; }
      goLocal(e && e.kind === 'refused' ? 'foreign' : 'local');
    }

    function connect(myGen) {
      if (!claude || typeof claude.use !== 'function') { setStatus('local'); return Promise.resolve(); }
      setStatus('syncing');
      return openRef().then(function (opened) { return attachRemote(myGen, opened); }).catch(connectError);
    }

    store.doc = freshDoc();

    /** Reads local data, then connects to the cloud when available. Always resolves. */
    store.load = function () {
      var local = null;
      detached = false;
      var myGen = ++gen;
      var readFailed = false;
      try { local = readLocal(); } catch (e) {
        failed();
        if (!e || e.kind !== 'read') return Promise.resolve();
        readFailed = true;
      }
      if (local) {
        var folded = null;
        try { folded = migrate(local); } catch (e) { folded = null; }
        store.doc = local;
        if (folded) guarded(function () { commit(folded); });
      }
      return connect(myGen).catch(failed).then(function () { if (readFailed) failed(); });
    };

    /** Applies fn to a copy of the doc; resetAt is preserved. Writes local at once and schedules a flush. */
    store.update = function (fn) {
      guarded(function () {
        var next = clone(store.doc);
        var resetAt = next.resetAt;
        fn(next);
        next.resetAt = resetAt;
        next.course = courseId;
        next.t = now();
        var clean = sanitize(next);
        if (!clean || foreignCourse(clean)) { failed(); return; }
        clean.resetAt = resetAt;
        commit(withCourse(clean));
        scheduleFlush();
      });
    };

    /** Counts an answer; every flushEvery-th one flushes. */
    store.noteAnswer = function () {
      answers++;
      if (answers >= flushEvery) store.flush();
    };

    /** Writes to the cloud when connected and dirty. Always resolves. */
    store.flush = function () {
      answers = 0;
      cancelTimer();
      if (!canWrite()) return Promise.resolve();
      if (writing) { pendingWrite = true; return writing; }
      var body;
      try { body = buildBody(); } catch (e) { failed(); return Promise.resolve(); }
      if (!body) { failed(); return Promise.resolve(); }
      return startWrite(body);
    };

    /** Stable pretty JSON of the doc, for the paste adapter. */
    store.exportText = function () { return stable(store.doc, 2); };

    function incoming(text) {
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { return { code: 'invalid_json' }; }
      var doc = sanitize(parsed);
      if (!doc) return { code: 'not_progress' };
      if (foreignCourse(doc)) return { code: 'other_course' };
      return { doc: doc };
    }

    function countNew(before, after) {
      return Object.keys(after.items).filter(function (id) { return !(id in before.items); }).length;
    }

    function mergeIncoming(doc) {
      if (doc.resetAt >= store.doc.resetAt) {
        doc.resetAt = store.doc.resetAt;
      }
      var merged = withCourse(mergeDocs(store.doc, doc));
      if (same(merged, store.doc)) return { ok: true, added: 0 };
      var added = countNew(store.doc, merged);
      commit(merged);
      scheduleFlush();
      return { ok: true, added: added };
    }

    /** Merges exported text into the doc; never changes resetAt. */
    store.importText = function (text) {
      try {
        var inc = incoming(text);
        if (!inc.doc) return { ok: false, code: inc.code };
        return mergeIncoming(inc.doc);
      } catch (e) {
        failed();
        return { ok: false, code: 'other' };
      }
    };

    function emptied(doc) {
      var next = clone(doc);
      var stamp = Math.max(now(), (doc.resetAt || 0) + 1);
      next.resetAt = stamp;
      next.t = Math.max(stamp, doc.t || 0);
      next.items = {};
      if (next.exams) next.exams = {};
      if (next.intros) next.intros = {};
      delete next.examDraft;
      Object.keys(next.stats || {}).forEach(function (k) {
        if (isObject(next.stats[k])) next.stats[k] = {};
      });
      return next;
    }

    /** Explicit reset: the only operation that sets resetAt. */
    store.reset = function () {
      var ok = guarded(function () { commit(emptied(store.doc)); return true; }, false);
      return ok ? store.flush() : Promise.resolve();
    };

    function hidden(win) {
      return !win.document || win.document.visibilityState === 'hidden';
    }

    /** Flushes on pagehide and when the page becomes hidden. */
    store.attachLifecycle = function (win) {
      if (detachLifecycle) { detachLifecycle(); detachLifecycle = null; }
      var target = win.document && win.document.addEventListener ? win.document : win;
      var onHide = function () { store.flush(); };
      var onVisibility = function () { if (hidden(win)) store.flush(); };
      win.addEventListener('pagehide', onHide);
      target.addEventListener('visibilitychange', onVisibility);
      detachLifecycle = function () {
        win.removeEventListener('pagehide', onHide);
        target.removeEventListener('visibilitychange', onVisibility);
      };
    };

    /** Stops lifecycle listeners, the flush timer and the remote subscription. */
    store.detach = function () {
      detached = true;
      gen++;
      if (detachLifecycle) { detachLifecycle(); detachLifecycle = null; }
      cancelTimer();
      cancelRetry();
      mode = 'local';
      ref = null;
      setStatus('local');
      if (unsub) { try { unsub(); } catch (e) { /* ignore */ } unsub = null; }
    };

    return store;
  }

  var api = { createStore: createStore, sortKeys: sortKeys };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoStorage = api;
})(typeof self !== 'undefined' ? self : this);
