/* session/qtimer.js — adaptive per-question timer (contract 12.2). Not used in exams or placement.
 * Exports DojoSessionQtimer: create(ctx) -> { limitFor(item), afterVerdict(item, v), pending(), attach(session) }.
 *   limitFor(item) -> ms | null (null = no timer for the item). base = settings timer:baseMs > unit timer > course timer > 8000.
 *   afterVerdict(item, { correct, timedOut, answerMs?, limitMs? }) writes settings timer:scale / timer:streak (never when adaptive:false).
 *   attach(session) adds session.timerLimit(item), session.timerStart(item) -> limitMs | null, session.answerTimed(input), and rejects session.answer
 *   with { error: 'timed_out' } once the limit of the started item has passed.
 */
(function (root) {
  'use strict';

  var DEFAULT_BASE = 8000;

  function finite(x) { return typeof x === 'number' && isFinite(x); }

  function create(ctx) {
    var started = null; // { id, at, limitMs }
    var forced = false;

    function settings() { return (ctx.store.doc && ctx.store.doc.settings) || {}; }

    function timerOf(item) {
      var unit = ((ctx.course && ctx.course.units) || []).find(function (u) { return u.id === item.unit; });
      var t = (unit && unit.timer) || (ctx.course && ctx.course.timer);
      return t && typeof t === 'object' ? t : null;
    }

    function baseOf(timer) {
      var s = settings()['timer:baseMs'];
      if (finite(s)) return Math.min(30000, Math.max(2000, s));
      return finite(timer.baseMs) ? timer.baseMs : DEFAULT_BASE;
    }

    function limitFor(item) {
      var timer = timerOf(item);
      if (!timer) return null;
      var scale = timer.adaptive === false ? 1 : settings()['timer:scale'];
      return ctx.dojo.call('timerLimit', { baseMs: baseOf(timer), scale: finite(scale) ? scale : 1 });
    }

    function writeSettings(scale, streak) {
      var st = settings();
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

    function afterVerdict(item, v) {
      var run = started && started.id === item.id ? started : null;
      started = null;
      var timer = timerOf(item);
      if (!timer || timer.adaptive === false || !(run || finite(v.answerMs))) return;
      var st = settings();
      var r = ctx.dojo.call('timerNext', {
        scale: st['timer:scale'], streak: st['timer:streak'],
        outcome: v.correct ? 'correct' : v.timedOut ? 'timeout' : 'wrong',
        answerMs: finite(v.answerMs) ? v.answerMs : ctx.now() - run.at,
        limitMs: finite(v.limitMs) ? v.limitMs : run && run.limitMs
      });
      writeSettings(r.scale, r.streak);
    }

    function expired() { return !!started && ctx.now() - started.at > started.limitMs; }

    function attach(session) {
      var answer = session.answer;
      session.timerLimit = limitFor;
      session.timerStart = function (item) {
        var limitMs = limitFor(item);
        started = limitMs === null ? null : { id: item.id, at: ctx.now(), limitMs: limitMs };
        return limitMs;
      };
      session.answer = function (input) {
        if (expired() && !forced) return { error: 'timed_out' };
        return answer.call(session, input);
      };
      session.answerTimed = function (input) {
        forced = true;
        try { return answer.call(session, input); } finally { forced = false; }
      };
    }

    return { limitFor: limitFor, afterVerdict: afterVerdict, pending: function () { return forced; }, attach: attach };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DojoSessionQtimer = api;
})(typeof self !== 'undefined' ? self : this);
