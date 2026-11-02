/*
 * ui/dictation.js — listening-question helpers (contract 12.2, proposal 12.5). Global DojoDictation (UMD).
 *   isListening(stimulus) -> bool        hideText stimulus with a non-empty audio list
 *   replayBudget(timer) -> number        timer.replays (0..3), Infinity without a timer object
 *   create({ win, audio, random }) -> controller
 *     open({ stimulus, timer, onEnd }): resets the replay count; plays the clip once when the stimulus is a listening
 *       stimulus, audio is ready and the user has made a gesture
 *     replay() -> bool: plays again while replays < replayBudget; the first play (autoplay or manual) is free, else false
 *     clip(sid, ids) -> id: the one clip of the open question (picked once); markAnswered(): replays become free
 *     remaining() -> number|null: replays left once the first play started, null before it or without a limit
 *     onKey(event) -> bool: any key counts as a gesture; "r" without modifiers replays (true when handled)
 *   sync(screen[, audio]): opens/closes the controller kept on a session screen as screen.dict when screen.state.cur changes
 *     stop(): removes the gesture listeners and stops playback
 *   onEnd(ok) is called when a play started by open/replay ends (ok false on failure).
 */
(function (root) {
  'use strict';

  function isListening(st) {
    return !!st && st.hideText === true && Array.isArray(st.audio) && st.audio.length > 0;
  }

  function replayBudget(timer) {
    if (!timer || typeof timer !== 'object') return Infinity;
    return typeof timer.replays === 'number' && timer.replays >= 0 ? Math.floor(timer.replays) : 1;
  }

  // Controller state c: { win, audio, random, gesture, cur, uses, started, events, mark }

  function play(c) {
    var q = c.cur;
    var clip = q.clip || (q.clip = c.audio.pick(q.stimulus.id, q.stimulus.audio, c.random));
    c.audio.play(clip).then(function () { if (c.cur === q) q.onEnd(true); }, function () { if (c.cur === q) q.onEnd(false); });
  }

  function open(c, q) {
    c.cur = null;
    c.uses = 0;
    c.started = false;
    if (!isListening(q.stimulus) || !c.audio || !c.audio.ready()) return;
    c.cur = { stimulus: q.stimulus, budget: replayBudget(q.timer), onEnd: q.onEnd || function () {} };
    if (c.gesture) { c.started = true; play(c); }
  }

  function claim(c) {
    if (c.cur.answered) return true;
    if (!c.started) { c.started = true; return true; }
    if (c.uses >= c.cur.budget) return false;
    c.uses++;
    return true;
  }

  function replay(c) {
    if (!c.cur || !c.audio.ready() || !claim(c)) return false;
    play(c);
    return true;
  }

  function exhausted(c) { return !!c.cur && !c.cur.answered && c.started && c.uses >= c.cur.budget; }

  function clip(c, sid, ids) {
    if (!c.cur) return c.audio.pick(sid, ids, c.random);
    return c.cur.clip || (c.cur.clip = c.audio.pick(sid, ids, c.random));
  }

  function remaining(c) {
    if (!c.cur || !c.started || !isFinite(c.cur.budget)) return null;
    return Math.max(0, c.cur.budget - c.uses);
  }

  function take(c) {
    if (!c.cur) return true;
    return claim(c);
  }

  function onKey(c, e) {
    c.gesture = true;
    if (!c.cur || e.key !== 'r' || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.preventDefault) e.preventDefault();
    replay(c);
    return true;
  }

  function stop(c) {
    c.cur = null;
    if (c.win && c.win.removeEventListener) c.events.forEach(function (n) { c.win.removeEventListener(n, c.mark, true); });
    if (c.audio && c.audio.stop) c.audio.stop();
  }

  function create(o) {
    var win = o.win;
    var c = {
      win: win,
      audio: o.audio,
      random: o.random || Math.random,
      gesture: !!(win && win.navigator && win.navigator.userActivation && win.navigator.userActivation.hasBeenActive),
      cur: null,
      uses: 0,
      started: false,
      events: ['pointerdown', 'touchend', 'click'],
      mark: function () { c.gesture = true; if (c.audio && c.audio.unlock) c.audio.unlock(); }
    };
    if (win && win.addEventListener) c.events.forEach(function (n) { win.addEventListener(n, c.mark, true); });
    return {
      open: function (q) { open(c, q); },
      replay: function () { return replay(c); },
      onKey: function (e) { return onKey(c, e); },
      stop: function () { stop(c); },
      take: function () { return take(c); },
      clip: function (sid, ids) { return clip(c, sid, ids); },
      markAnswered: function () { if (c.cur) c.cur.answered = true; },
      exhausted: function () { return exhausted(c); },
      remaining: function () { return remaining(c); }
    };
  }

  function timerOf(course, item) {
    var unit = ((course && course.units) || []).filter(function (u) { return u.id === item.unit; })[0];
    return (unit && unit.timer) || (course && course.timer) || null;
  }

  function currentStimulus(s) {
    return s.cur && !s.introCard ? s.cur.stimulus : null;
  }

  // Marks the listened stimulus as played and hands focus back to the input
  function onListenEnd(screen, st, ok) {
    if (ok) (screen.played || (screen.played = {}))['s:' + st.id] = true;
    if (screen.input && screen.input.focus) screen.input.focus();
    if (screen.forceUpdate) screen.forceUpdate();
  }

  // Opens the dictation controller of a session screen whenever its current question changes.
  function sync(screen, audio) {
    var s = screen.state;
    if (s.cur === screen.dictCur) { if (s.result && screen.dict && screen.dict.markAnswered) screen.dict.markAnswered(); return; }
    screen.dictCur = s.cur;
    var A = audio || root.DojoAudio;
    if (!A) return;
    if (!screen.dict) screen.dict = create({ win: screen.props.win, audio: A });
    var st = currentStimulus(s);
    screen.dict.open({ stimulus: st, timer: st ? timerOf(screen.props.course, s.cur.item) : null, onEnd: function (ok) { onListenEnd(screen, st, ok); } });
  }

  var api = { isListening: isListening, replayBudget: replayBudget, create: create, sync: sync, timerOf: timerOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DojoDictation = api;
})(typeof self !== 'undefined' ? self : this);
