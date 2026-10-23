/*
 * ui/session-focus.js — Focus and keyboard navigation helpers for SessionScreen.
 * Globals expected: none.
 * Exports plain functions taking (screen, ...) as parameters.
 */
(function (root) {
  'use strict';

  // Contract: All functions take screen as first param, then specific args.
  // They read/write screen state directly.

  // Handle modality changes (keyboard vs pointer)
  function onModality(screen, e) {
    screen.kbd = e.type === 'keydown';
    var box = screen.qbox;
    if (screen.kbd && box && box.querySelectorAll) {
      var marked = box.querySelectorAll('[data-nofocusring]');
      for (var i = 0; i < marked.length; i++) marked[i].removeAttribute('data-nofocusring');
    }
  }

  // Schedule focus to be applied asynchronously
  function focusSoon(screen) {
    var self = screen;
    setTimeout(function () { self.applyFocus(); }, 0);
  }

  // Handle refocusing when focus was lost from the question box
  function refocusLost(screen, s, box, doc, active, had) {
    var lost = doc && (!active || active === doc.body);
    if (!(had && lost && !s.result && box && box.querySelector)) return;
    var re = box.querySelector('[data-refocus]');
    if (re && re.focus) { re.focus(); screen.hadFocus = true; }
  }

  // Determine which element should receive focus
  function focusTarget(screen, s, box) {
    var el = s.introCard ? screen.introBtn : s.result ? screen.nextBtn : screen.input;
    if (!el && !s.result && box && box.querySelector) el = box.querySelector('[data-autofocus]');
    return el;
  }

  // Apply focus to the appropriate element
  function applyFocus(screen) {
    var s = screen.state;
    if (s.confirm) return;
    var last = screen.lastFocus;
    var box = screen.qbox;
    var doc = screen.props.win && screen.props.win.document;
    var active = doc && doc.activeElement;
    var had = screen.hadFocus;
    screen.hadFocus = !!(box && active && box.contains && box.contains(active));
    if (last && last.cur === s.cur && last.answered === !!s.result && last.intro === !!s.introCard) {
      screen.refocusLost(s, box, doc, active, had);
      return;
    }
    screen.lastFocus = { cur: s.cur, answered: !!s.result, intro: !!s.introCard };
    var el = screen.focusTarget(s, box);
    if (el && el.focus) {
      if (!screen.kbd && el.setAttribute) el.setAttribute('data-nofocusring', '');
      el.focus();
      screen.hadFocus = !s.result;
    }
  }

  // Handle arrow key navigation between input controls
  function onInputNav(screen, e) {
    var s = screen.state;
    if (s.result || !s.cur) return;
    var tag = e.target && e.target.tagName;
    if (tag !== 'INPUT') return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var box = screen.qbox;
    if (!box) return;
    var controls = [];
    var collect = function (node) {
      var on = function (n) { var a = n.getAttribute(n.tagName === 'INPUT' ? 'readonly' : 'disabled'); return a === true || a === '' || a === 'true'; };
      if ((node.tagName === 'INPUT' || node.tagName === 'BUTTON') && !on(node)) controls.push(node);
      if (node.childNodes) node.childNodes.forEach(function (c) { collect(c); });
    };
    collect(box);
    var currentIndex = -1;
    for (var i = 0; i < controls.length; i++) {
      if (controls[i] === e.target) { currentIndex = i; break; }
    }
    if (currentIndex === -1) return;
    var nextIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= controls.length) return;
    controls[nextIndex].focus();
    e.preventDefault();
  }

  var api = { onModality, focusSoon, refocusLost, focusTarget, applyFocus, onInputNav };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoSessionFocus = api;
})(typeof self !== 'undefined' ? self : this);
