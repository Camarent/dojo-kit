/*
 * ui/arrow-nav.js — Shared arrow-key reach for button groups.
 * Globals expected: none (self-installs a document keydown listener when a document exists).
 * Group = enabled BUTTON children of the target's parent. Axis comes from the parent's
 * computed flex-direction: row layouts use Left/Right, column or non-flex layouts use Up/Down.
 * Landing exception: Up/Down from a row inside a column `.actions` walks all its buttons in DOM order.
 * Grid parents are horizontal when the first two group buttons share offsetTop.
 * Inputs, textareas, selects, modified keys, and anything inside [data-arrow-own] are skipped.
 * Key layer: arrow-nav runs on document first and calls preventDefault; window handlers must
 * honour defaultPrevented via DojoTypes.keyBlocked.
 */
(function (root) {
  'use strict';

  function ownHandler(t) {
    return !!(t.closest && t.closest('[data-arrow-own]'));
  }

  function keyAccepted(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    var k = e.key;
    return k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';
  }

  function buttonsOf(node) {
    var out = [];
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].tagName === 'BUTTON' && !kids[i].disabled) out.push(kids[i]);
    }
    return out;
  }

  // Sibling buttons, or the first button of each LI sibling when the target sits in a list item.
  function groupOf(t) {
    var scope = t.parentNode;
    if (scope.tagName !== 'LI' || !scope.parentNode) return { scope: scope, group: buttonsOf(scope) };
    scope = scope.parentNode;
    var group = [];
    var items = scope.childNodes || [];
    for (var j = 0; j < items.length; j++) {
      var bs = buttonsOf(items[j]);
      if (bs.length) group.push(bs[0]);
    }
    return { scope: scope, group: group };
  }

  function allButtons(node, out) {
    var kids = node.childNodes || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].tagName === 'BUTTON' && !kids[i].disabled) out.push(kids[i]);
      else allButtons(kids[i], out);
    }
    return out;
  }

  function isActions(n) {
    var cls = (n && n.getAttribute && n.getAttribute('class')) || '';
    return /(^|\s)actions(\s|$)/.test(cls);
  }

  // Landing: Up/Down in a column `.actions` (from its buttons or a nested row) walks every button in DOM order.
  function landingGroup(g, key, win) {
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;
    var box = isActions(g.scope) ? g.scope : g.scope.parentNode;
    if (!isActions(box) || horizontal(box, win, [])) return null;
    return allButtons(box, []);
  }

  function gridHorizontal(cs, group) {
    if (group.length > 1 && group[0].offsetTop !== undefined && group[1].offsetTop !== undefined) {
      return group[0].offsetTop === group[1].offsetTop;
    }
    var cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean);
    return cols.length > 1;
  }

  function horizontal(parent, win, group) {
    var cs = win && win.getComputedStyle ? win.getComputedStyle(parent) : null;
    if (!cs) return false;
    var d = cs.display || '';
    if (d.indexOf('flex') >= 0) return (cs.flexDirection || 'row').indexOf('column') < 0;
    return d.indexOf('grid') >= 0 && gridHorizontal(cs, group || []);
  }

  function axisMatches(scope, key, win, group) {
    return horizontal(scope, win, group) === (key === 'ArrowLeft' || key === 'ArrowRight');
  }

  function step(group, cur, fwd) {
    return group[(cur + (fwd ? 1 : group.length - 1)) % group.length];
  }

  // Move focus within the group; returns true when focus moved.
  function onKey(e, win) {
    if (!keyAccepted(e)) return false;
    var t = e.target;
    if (!t || t.tagName !== 'BUTTON' || !t.parentNode || ownHandler(t)) return false;
    var g = groupOf(t);
    var lg = landingGroup(g, e.key, win);
    if (lg) g = { scope: g.scope, group: lg };
    else if (!axisMatches(g.scope, e.key, win, g.group)) return false;
    var cur = g.group.indexOf(t);
    if (cur < 0 || g.group.length < 2) return false;
    step(g.group, cur, e.key === 'ArrowRight' || e.key === 'ArrowDown').focus();
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
