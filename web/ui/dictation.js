/*
 * ui/dictation.js — listening-question helpers (contract 12.2, proposal 12.5). Global DojoDictation (UMD).
 *   isListening(stimulus) -> bool        hideText stimulus with a non-empty audio list
 *   replayBudget(timer) -> number        timer.replays (0..3), Infinity without a timer object
 *   create({ win, audio, random }) -> controller
 *     open({ stimulus, timer, onEnd }): resets the replay count; plays the clip once when the stimulus is a listening
 *       stimulus, audio is ready and the user has made a gesture
 *     replay() -> bool: plays again while replays < replayBudget; the first play (autoplay or manual) is free, else false
 *     remaining() -> number|null: replays left once the first play started, null before it or without a limit
 *     onKey(event) -> bool: any key counts as a gesture; "r" without modifiers replays (true when handled)
 *   sync(screen[, audio]): opens/closes the controller kept on a session screen as screen.dict when screen.state.cur changes
 *     stop(): removes the gesture listeners and stops playback
 *   onEnd(ok) is called when a play started by open/replay ends (ok false on failure).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.DojoDictation = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  function isListening(st) {
    return !!st && st.hideText === true && Array.isArray(st.audio) && st.audio.length > 0;
  }

  function replayBudget(timer) {
    if (!timer || typeof timer !== 'object') return Infinity;
    return typeof timer.replays === 'number' && timer.replays >= 0 ? Math.floor(timer.replays) : 1;
  }

  function create(o) {
    var win = o.win;
    var audio = o.audio;
    var random = o.random || Math.random;
    var gesture = !!(win && win.navigator && win.navigator.userActivation && win.navigator.userActivation.hasBeenActive);
    var cur = null;
    var uses = 0;
    var started = false;
    var events = ['pointerdown', 'touchend', 'click'];
    function mark() { gesture = true; if (audio && audio.unlock) audio.unlock(); }
    if (win && win.addEventListener) events.forEach(function (n) { win.addEventListener(n, mark, true); });

    function play() {
      var q = cur;
      var clip = audio.pick(q.stimulus.id, q.stimulus.audio, random);
      audio.play(clip).then(function () { if (cur === q) q.onEnd(true); }, function () { if (cur === q) q.onEnd(false); });
    }

    function open(q) {
      cur = null;
      uses = 0;
      started = false;
      if (!isListening(q.stimulus) || !audio || !audio.ready()) return;
      cur = { stimulus: q.stimulus, budget: replayBudget(q.timer), onEnd: q.onEnd || function () {} };
      if (gesture) { started = true; play(); }
    }

    function claim() {
      if (!started) { started = true; return true; }
      if (uses >= cur.budget) return false;
      uses++;
      return true;
    }

    function replay() {
      if (!cur || !audio.ready() || !claim()) return false;
      play();
      return true;
    }

    function exhausted() { return !!cur && started && uses >= cur.budget; }

    function remaining() {
      if (!cur || !started || !isFinite(cur.budget)) return null;
      return Math.max(0, cur.budget - uses);
    }

    function take() {
      if (!cur) return true;
      return claim();
    }

    function onKey(e) {
      gesture = true;
      if (!cur || e.key !== 'r' || e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.preventDefault) e.preventDefault();
      replay();
      return true;
    }

    function stop() {
      cur = null;
      if (win && win.removeEventListener) events.forEach(function (n) { win.removeEventListener(n, mark, true); });
      if (audio && audio.stop) audio.stop();
    }

    return { open: open, replay: replay, onKey: onKey, stop: stop, take: take, exhausted: exhausted, remaining: remaining };
  }

  function timerOf(course, item) {
    var unit = ((course && course.units) || []).filter(function (u) { return u.id === item.unit; })[0];
    return (unit && unit.timer) || (course && course.timer) || null;
  }

  // Opens the dictation controller of a session screen whenever its current question changes.
  function sync(screen, audio) {
    var s = screen.state;
    if (s.cur === screen.dictCur) return;
    screen.dictCur = s.cur;
    var A = audio || root.DojoAudio;
    if (!A) return;
    if (!screen.dict) screen.dict = create({ win: screen.props.win, audio: A });
    var st = s.cur && !s.introCard ? s.cur.stimulus : null;
    screen.dict.open({ stimulus: st, timer: st ? timerOf(screen.props.course, s.cur.item) : null, onEnd: function (ok) {
      if (ok) (screen.played || (screen.played = {}))['s:' + st.id] = true;
      if (screen.input && screen.input.focus) screen.input.focus();
      if (screen.forceUpdate) screen.forceUpdate();
    } });
  }

  return { isListening: isListening, replayBudget: replayBudget, create: create, sync: sync, timerOf: timerOf };
});
