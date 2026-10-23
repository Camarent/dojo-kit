/*
 * storage/adapters.js — local and artifact-db storage adapters.
 */
(function (root) {
  'use strict';

  var FATAL_CODES = ['invalid_argument', 'revoked', 'not_granted', 'capability_disabled', 'capability_removed'];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (!v || typeof v !== 'object') return v;
    var out = Object.create(null);
    Object.keys(v).sort().forEach(function (k) { out[k] = sortKeys(v[k]); });
    return out;
  }

  function stable(v, indent) { return JSON.stringify(sortKeys(v), null, indent); }
  function same(a, b) { return stable(a) === stable(b); }
  function count(o) { return o && typeof o === 'object' ? Object.keys(o).length : 0; }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function fallbackDoc() {
    return { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {} };
  }

  /** Local adapter over s.ls; s supplies key, now, warn, sanitize, withCourse, foreignCourse. */
  function localAdapter(s) {
    function readRaw() {
      try { return s.ls ? s.ls.getItem(s.key) : null; } catch (e) { throw { kind: 'read' }; }
    }

    function backup(raw) {
      if (s.backedUp === raw) return true;
      try { s.ls.setItem(s.key + '.unreadable.' + s.now(), raw); } catch (e) { s.warn('store.backup.setItem', e); return false; }
      s.backedUp = raw;
      return true;
    }

    function parseStored(raw) {
      try {
        var d = s.sanitize(JSON.parse(raw));
        return d && !s.foreignCourse(d) ? s.withCourse(d) : null;
      } catch (e) {
        if (e && e.kind === 'wasm') throw e;
        s.warn('store.parseStored', e);
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
      try { if (s.ls) s.ls.setItem(s.key, JSON.stringify(doc)); return true; } catch (e) { s.warn('store.writeLocal.setItem', e); return false; }
    }

    return { readLocal: readLocal, writeLocal: writeLocal };
  }

  /** Artifact-db adapter over s.claude; s supplies courseId, random, setTimer, clearTimer, sanitize, ref, retryTimer, retryCancel. */
  function dbAdapter(s) {
    function cancelRetry() {
      if (s.retryTimer !== null) { s.clearTimer(s.retryTimer); s.retryTimer = null; }
      if (s.retryCancel) { var c = s.retryCancel; s.retryCancel = null; c(); }
    }

    function waitRetry(r) {
      return new Promise(function (res, rej) {
        s.retryCancel = function () { rej({ cancelled: true }); };
        s.retryTimer = s.setTimer(function () {
          s.retryTimer = null;
          s.retryCancel = null;
          if (s.ref !== r) rej({ cancelled: true }); else res();
        }, 500 + s.random() * 1000);
      });
    }

    function setWithRetry(r, body) {
      return Promise.resolve().then(function () { return r.set(body); }).catch(function (e) {
        if (e && e.code && e.code !== 'unavailable') throw e;
        return waitRetry(r).then(function () { return r.set(body); });
      });
    }

    function openRef() {
      var claude = s.claude;
      return Promise.all([
        Promise.resolve().then(function () { return claude.use('db'); }).catch(function (e) { s.warn('store.openRef.db', e); return null; }),
        Promise.resolve().then(function () { return claude.use('user'); }).catch(function (e) { s.warn('store.openRef.user', e); return null; })
      ]).then(function (caps) {
        if (!caps[0] || !caps[1]) throw { kind: 'absent' };
        return Promise.resolve(caps[1].id()).then(function (uid) {
          if (!uid) throw { kind: 'absent' };
          var r = caps[0].doc('data/users/' + uid + '/progress-' + s.courseId);
          return Promise.resolve(r.get()).then(function (snap) { return { ref: r, snap: snap }; });
        });
      });
    }

    function readRemote(snap) {
      if (!snap || !snap.exists) return null;
      var remote = s.sanitize(snap.data());
      if (!remote) throw { kind: 'refused', code: 'foreign' };
      return remote;
    }

    return { cancelRetry: cancelRetry, setWithRetry: setWithRetry, openRef: openRef, readRemote: readRemote };
  }

  var api = {
    FATAL_CODES: FATAL_CODES,
    clone: clone,
    sortKeys: sortKeys,
    stable: stable,
    same: same,
    count: count,
    isObject: isObject,
    fallbackDoc: fallbackDoc,
    localAdapter: localAdapter,
    dbAdapter: dbAdapter
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorageAdapters = api;
  }
})(typeof self !== 'undefined' ? self : this);
