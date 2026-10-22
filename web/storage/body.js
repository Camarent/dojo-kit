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

  function trimDraft(body, max) {
    var dr = body.examDraft && typeof body.examDraft === 'object' ? JSON.parse(JSON.stringify(body.examDraft)) : null;
    if (dr) body.examDraft = dr;
    if (!dr || typeof dr !== 'object' || dr.closed) return;
    if (Array.isArray(dr.answers)) {
      dr.answers = dr.answers.map(function (a) { return { i: a.i, c: a.c }; });
    }
    if (size(body) <= max) return;
    var closed = Array.isArray(dr.closedSids) ? dr.closedSids : [];
    var top = closed.length ? closed[closed.length - 1] : null;
    if (top && typeof top.sid === 'string') {
      body.examDraft = { sid: top.sid, updatedAt: top.updatedAt, closed: 'expired', closedSids: closed };
    } else {
      delete body.examDraft;
    }
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

  var api = { buildBody: buildBody, emptied: emptied };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.DojoStorageBody = api;
  }
})(typeof self !== 'undefined' ? self : this);
