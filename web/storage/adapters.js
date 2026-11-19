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
  /** parts.js is loaded before any call here (bundle order); under node it is required on first use. */
  function partsOf() { return root.DojoStorageParts || require('./parts.js'); }

  function fallbackDoc() {
    return { v: 1, t: 0, resetAt: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {} };
  }

  /** Local adapter over s.ls; s supplies key, now, warn, sanitize, withCourse, foreignCourse. */
  function localAdapter(s) {
    function readRaw() {
      try { return s.ls ? s.ls.getItem(s.key) : null; } catch { throw { kind: 'read' }; }
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
      function use(name) {
        return Promise.resolve().then(function () { return claude.use(name); }).then(
          function (cap) { return cap ? { cap: cap } : { step: name + '-null' }; },
          function (e) { s.warn('store.openRef.' + name, e); return { step: 'no-use' }; });
      }
      return Promise.all([use('db'), use('user')]).then(function (caps) {
        var miss = caps[0].step || caps[1].step;
        if (miss) throw { kind: 'absent', step: miss };
        return Promise.resolve(caps[1].cap.id()).then(function (uid) {
          if (!uid) throw { kind: 'absent', step: 'no-uid' };
          var db = caps[0].cap;
          var path = 'data/users/' + uid + '/progress-' + s.courseId;
          var r = db.doc(path);
          var partRefs = {};
          function partRef(k) {
            if (!partRefs[k]) partRefs[k] = db.doc(partsOf().partPath(path, k));
            return partRefs[k];
          }
          return Promise.resolve(r.get()).then(function (snap) {
            var n = snap && snap.exists ? partsOf().partCount(snap.data()) : 0;
            var reads = [];
            for (var k = 1; k <= n; k++) reads.push(partRef(k).get());
            return Promise.all(reads).then(function (partSnaps) {
              return { ref: r, snap: snap, partRef: partRef, partSnaps: partSnaps };
            });
          });
        });
      });
    }

    /** Main doc plus its part docs (partSnaps, in order 1..n) folded into one doc without a parts key. */
    function readRemote(snap, partSnaps) {
      if (!snap || !snap.exists) return null;
      var remote = s.sanitize(snap.data());
      if (!remote) throw { kind: 'refused', code: 'foreign' };
      var docs = [];
      (partSnaps || []).forEach(function (ps, i) {
        if (!ps || !ps.exists) { s.warn('store.readRemote.part', { kind: 'missing-part', part: i + 1 }); return; }
        var p = s.sanitize(ps.data());
        if (!p || s.foreignCourse(p)) throw { kind: 'refused', code: 'foreign' };
        docs.push(p);
      });
      return partsOf().assemble(remote, docs, s.mergeDocs);
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
