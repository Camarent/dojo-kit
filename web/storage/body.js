/*
 * storage/body.js — pure doc helpers: size-fitted cloud body, reset snapshot.
 */
(function (root) {
  'use strict';

  var adapters = root.DojoStorageAdapters || (typeof require !== 'undefined' ? require('./adapters.js') : null);

  function size(body) { return JSON.stringify(body).length; }

  function shrinks(body, lastRemote) {
    return !!lastRemote && body.resetAt === lastRemote.resetAt &&
      (adapters.count(body.items) < adapters.count(lastRemote.items) || adapters.count(body.exams) < adapters.count(lastRemote.exams));
  }

  function dropStats(body) {
    body.stats.days = {};
    body.stats.newByDay = {};
    Object.keys(body.stats).forEach(function (k) { if (k.indexOf('newBy:') === 0) body.stats[k] = {}; });
  }

  function compactAnswers(dr) {
    if (Array.isArray(dr.answers)) {
      dr.answers = dr.answers.map(function (a) { return { i: a.i, c: a.c }; });
    }
  }

  /** Stub draft that keeps the newest closed sid, or null when there is none. */
  function expiredStub(dr) {
    var closed = Array.isArray(dr.closedSids) ? dr.closedSids : [];
    var top = closed.length ? closed[closed.length - 1] : null;
    if (!top || typeof top.sid !== 'string') return null;
    return { sid: top.sid, updatedAt: top.updatedAt, closed: 'expired', closedSids: closed };
  }

  function trimDraft(body, max) {
    var dr = body.examDraft && typeof body.examDraft === 'object' ? JSON.parse(JSON.stringify(body.examDraft)) : null;
    if (dr) body.examDraft = dr;
    if (!dr || typeof dr !== 'object' || dr.closed) return;
    compactAnswers(dr);
    if (size(body) <= max) return;
    var stub = expiredStub(dr);
    if (stub) body.examDraft = stub;
    else delete body.examDraft;
  }

  /** Fits body into max bytes by dropping stats, then draft detail; null when it cannot fit. */
  function fit(body, max) {
    if (size(body) <= max) return body;
    dropStats(body);
    if (size(body) <= max) return body;
    trimDraft(body, max);
    return size(body) > max ? null : body;
  }

  /** Cloud body from merged doc, or null when it would shrink the remote or not fit. */
  function buildBody(body, lastRemote, max) {
    if (shrinks(body, lastRemote)) return null;
    return fit(body, max);
  }

  /** Copy of doc with progress cleared and resetAt advanced past stamp. */
  function emptied(doc, nowMs) {
    var next = adapters.clone(doc);
    var stamp = Math.max(nowMs, (doc.resetAt || 0) + 1);
    next.resetAt = stamp;
    next.t = Math.max(stamp, doc.t || 0);
    next.items = {};
    if (next.exams) next.exams = {};
    if (next.intros) next.intros = {};
    delete next.examDraft;
    Object.keys(next.stats || {}).forEach(function (k) {
      if (adapters.isObject(next.stats[k])) next.stats[k] = {};
    });
    return next;
  }

  function incoming(s, text) {
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

  function mergeIncoming(s, doc) {
    var store = s.store;
    if (doc.resetAt >= store.doc.resetAt) {
      doc.resetAt = store.doc.resetAt;
    }
    var merged = s.withCourse(s.mergeDocs(store.doc, doc));
    if (adapters.same(merged, store.doc)) return { ok: true, added: 0 };
    var added = countNew(store.doc, merged);
    s.commit(merged);
    s.scheduleFlush();
    return { ok: true, added: added };
  }

  /** Adds exportText / importText / reset to s.store. */
  function installImport(s) {
    var store = s.store;
    /** Stable pretty JSON of the doc, for the paste adapter. */
    store.exportText = function () { return adapters.stable(store.doc, 2); };

    /** Merges exported text into the doc; never changes resetAt. */
    store.importText = function (text) {
      try {
        var inc = incoming(s, text);
        if (!inc.doc) return { ok: false, code: inc.code };
        return mergeIncoming(s, inc.doc);
      } catch (e) {
        s.warn('store.importText', e);
        s.failed();
        return { ok: false, code: 'other' };
      }
    };

    /** Explicit reset: the only operation that sets resetAt. */
    store.reset = function () {
      var ok = s.guarded(function () { s.commit(emptied(store.doc, s.now())); return true; }, false);
      return ok ? store.flush() : Promise.resolve();
    };
  }

  var api = { buildBody: buildBody, emptied: emptied, installImport: installImport };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorageBody = api;
  }
})(typeof self !== 'undefined' ? self : this);
