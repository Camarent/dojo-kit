/*
 * ui/arrow-nav.js — Shared arrow-key reach for button groups.
 * Globals expected: none (self-installs a document keydown listener when a document exists).
 * Group = enabled BUTTON children of the target's parent. Axis comes from the parent's
 * computed flex-direction: row layouts use Left/Right, column or non-flex layouts use Up/Down.
 * Inputs, textareas, selects, modified keys, and controls with their own handler are skipped.
 */
(function (root) {
  'use strict';

  var OWN = ['order', 'btn-next', 'btn-intro-done'];

  function ownHandler(t) {
    var id = t.getAttribute && t.getAttribute('data-testid');
    if (OWN.indexOf(id) >= 0) return true;
    if (t.closest && t.closest('[data-testid="order"]')) return true;
    // choice options have their own Up/Down handler; multi options (class multi-opt) do not
    var multi = /(^|\s)multi-opt(\s|$)/.test((t.getAttribute && t.getAttribute('class')) || '');
    return !multi && !!(t.closest && t.closest('[data-testid="options"]'));
  }

  function horizontal(parent, win) {
    var cs = win && win.getComputedStyle ? win.getComputedStyle(parent) : null;
    if (!cs) return false;
    var d = cs.display || '';
    return d.indexOf('flex') >= 0 && (cs.flexDirection || 'row').indexOf('column') < 0;
  }

  function buttonsOf(node) {
    var out = [];
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].tagName === 'BUTTON' && !kids[i].disabled) out.push(kids[i]);
    }
    return out;
  }

  // Move focus within the group; returns true when focus moved.
  function onKey(e, win) {
    var k = e.key;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return false;
    var t = e.target;
    if (!t || t.tagName !== 'BUTTON' || !t.parentNode || ownHandler(t)) return false;
    var scope = t.parentNode;
    var group = buttonsOf(scope);
    // one button per list item: the group is the list's items
    if (scope.tagName === 'LI' && scope.parentNode) {
      scope = scope.parentNode;
      group = [];
      var items = scope.childNodes || [];
      for (var j = 0; j < items.length; j++) {
        var bs = buttonsOf(items[j]);
        if (bs.length) group.push(bs[0]);
      }
    }
    if (horizontal(scope, win) !== (k === 'ArrowLeft' || k === 'ArrowRight')) return false;
    var cur = group.indexOf(t);
    if (cur < 0 || group.length < 2) return false;
    var fwd = k === 'ArrowRight' || k === 'ArrowDown';
    group[(cur + (fwd ? 1 : group.length - 1)) % group.length].focus();
    if (e.preventDefault) e.preventDefault();
    return true;
  }

  var api = { onKey: onKey };
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('keydown', function (e) { onKey(e, root); });
  }
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.DojoArrowNav = api;
})(typeof self !== 'undefined' ? self : this);
