/* session/qtimer.js — adaptive per-question timer (contract 12.2). Not used in exams or placement.
 * Exports DojoSessionQtimer: create(ctx) -> { limitFor(item), afterVerdict(item, v), clear(), snapshot(), restore(snap), pending(), attach(session) }.
 *   limitFor(item) -> ms | null (null = no timer for the item). base = settings timer:baseMs > unit timer > course timer > 8000.
 *   afterVerdict(item, { correct, timedOut, answerMs?, limitMs? }) writes settings timer:scale / timer:streak (never when adaptive:false).
 *   attach(session) adds session.timerLimit(item), session.timerStart(item) -> limitMs | null, session.answerTimed(input), and rejects session.answer
 *   with { error: 'timed_out' } once the limit of the started item has passed.
 */
(function (root) {
  'use strict';

  var DEFAULT_BASE = 8000;

  function finite(x) { return typeof x === 'number' && isFinite(x); }

  function settingsOf(ctx) { return (ctx.store.doc && ctx.store.doc.settings) || {}; }

  function timerOf(ctx, item) {
    var unit = ((ctx.course && ctx.course.units) || []).find(function (u) { return u.id === item.unit; });
    var t = (unit && unit.timer) || (ctx.course && ctx.course.timer);
    return t && typeof t === 'object' ? t : null;
  }

  function baseOf(ctx, timer) {
    var s = settingsOf(ctx)['timer:baseMs'];
    if (finite(s)) return Math.min(30000, Math.max(2000, s));
    return finite(timer.baseMs) ? timer.baseMs : DEFAULT_BASE;
  }

  function limitOf(ctx, item) {
    var timer = timerOf(ctx, item);
    if (!timer) return null;
    var scale = timer.adaptive === false ? 1 : settingsOf(ctx)['timer:scale'];
    return ctx.dojo.call('timerLimit', { baseMs: baseOf(ctx, timer), scale: finite(scale) ? scale : 1 });
  }

  function writeSettings(ctx, scale, streak) {
    var st = settingsOf(ctx);
    if (st['timer:scale'] === scale && st['timer:streak'] === streak) return;
    ctx.store.update(function (doc) {
      doc.settings = doc.settings || {};
      doc.settings.ts = doc.settings.ts || {};
      doc.settings['timer:scale'] = scale;
      doc.settings['timer:streak'] = streak;
      doc.settings.ts['timer:scale'] = ctx.now();
      doc.settings.ts['timer:streak'] = ctx.now();
    });
  }

  function outcomeOf(v) { return v.correct ? 'correct' : v.timedOut ? 'timeout' : 'wrong'; }

  function verdictInput(ctx, run, v) {
    var st = settingsOf(ctx);
    return {
      scale: st['timer:scale'], streak: st['timer:streak'],
      outcome: outcomeOf(v),
      answerMs: finite(v.answerMs) ? v.answerMs : ctx.now() - run.at,
      limitMs: finite(v.limitMs) ? v.limitMs : run && run.limitMs
    };
  }

  function afterVerdict(ctx, state, item, v) {
    var run = state.started && state.started.id === item.id ? state.started : null;
    state.started = null;
    var timer = timerOf(ctx, item);
    if (!timer || timer.adaptive === false || !(run || finite(v.answerMs))) return;
    var r = ctx.dojo.call('timerNext', verdictInput(ctx, run, v));
    writeSettings(ctx, r.scale, r.streak);
  }

  function expired(ctx, state, id) {
    return !!state.started && state.started.id === id && ctx.now() - state.started.at > state.started.limitMs;
  }

  function snapshot(ctx) {
    var st = settingsOf(ctx);
    return { scale: st['timer:scale'], streak: st['timer:streak'] };
  }

  function restore(ctx, snap) {
    var st = settingsOf(ctx);
    if (!snap || (st['timer:scale'] === snap.scale && st['timer:streak'] === snap.streak)) return;
    ctx.store.update(function (doc) {
      doc.settings = doc.settings || {};
      doc.settings.ts = doc.settings.ts || {};
      ['scale', 'streak'].forEach(function (k) {
        if (snap[k] === undefined) delete doc.settings['timer:' + k]; else doc.settings['timer:' + k] = snap[k];
        doc.settings.ts['timer:' + k] = ctx.now();
      });
    });
  }

  function currentId(session) {
    var cur = session.current && session.current();
    return cur && cur.item ? cur.item.id : null;
  }

  function attach(ctx, state, session) {
    var answer = session.answer;
    state.started = null;
    session.timerLimit = function (item) { return limitOf(ctx, item); };
    session.timerStart = function (item) {
      var limitMs = limitOf(ctx, item);
      state.started = limitMs === null ? null : { id: item.id, at: ctx.now(), limitMs: limitMs };
      return limitMs;
    };
    session.answer = function (input) {
      if (expired(ctx, state, currentId(session)) && !state.forced) return { error: 'timed_out' };
      return answer.call(session, input);
    };
    session.answerTimed = function (input) {
      state.forced = true;
      try { return answer.call(session, input); } finally { state.forced = false; }
    };
  }

  function create(ctx) {
    var state = { started: null, forced: false }; // started: { id, at, limitMs }
    return {
      limitFor: function (item) { return limitOf(ctx, item); },
      afterVerdict: function (item, v) { afterVerdict(ctx, state, item, v); },
      clear: function () { state.started = null; },
      snapshot: function () { return snapshot(ctx); },
      restore: function (snap) { restore(ctx, snap); },
      pending: function () { return state.forced; },
      attach: function (session) { attach(ctx, state, session); }
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionQtimer = api;
})(typeof self !== 'undefined' ? self : this);
