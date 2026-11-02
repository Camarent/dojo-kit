'use strict';
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

// Load vendored preact and htm as globals
function loadGlobals() {
  const sandbox = { console: console, document: {} };
  sandbox.self = sandbox;
  sandbox.global = sandbox;
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/match.js'] });

  return sandbox;
}

// Children of a vnode as a flat list (empty when there are none)
function childrenOf(vnode) {
  if (!vnode || !vnode.props || !vnode.props.children) return [];
  const kids = vnode.props.children;
  return Array.isArray(kids) ? kids : [kids];
}

function findVNode(vnode, testid) {
  if (!vnode) return null;
  if (Array.isArray(vnode)) {
    for (const item of vnode) {
      const found = findVNode(item, testid);
      if (found) return found;
    }
    return null;
  }
  if (vnode.props && vnode.props['data-testid'] === testid) return vnode;
  for (const kid of childrenOf(vnode)) {
    const found = findVNode(kid, testid);
    if (found) return found;
  }
  return null;
}

function findAllVNodes(vnode, testid) {
  const results = [];
  walk(vnode);
  return results;

  function walk(n) {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (n.props && n.props['data-testid'] === testid) results.push(n);
    childrenOf(n).forEach(walk);
  }
}

function hasTestId(vnode, testid) {
  return findVNode(vnode, testid) !== null;
}

function hasDangerousHtml(n) {
  if (!n) return false;
  if (Array.isArray(n)) return n.some(hasDangerousHtml);
  if (!n.props) return false;
  if (n.props.dangerouslySetInnerHTML || n.props.innerHTML) return true;
  return childrenOf(n).some(hasDangerousHtml);
}

function checkNoDangerous(vnode) {
  assert.ok(!hasDangerousHtml(vnode), 'Found dangerouslySetInnerHTML or innerHTML in vnode');
}

// Mock t function
function makeT() {
  return function (key, vars) {
    var str = {
      'q.match.hint': 'Link each item on the left to its match.',
      'q.match.choose': 'Choose...',
      'q.match.reset': 'Reset matches',
      'session.check': 'Check',
      'q.result.wrongPairs': 'Wrong matches'
    }[key] || key;
    if (vars) {
      for (var k in vars) {
        str = str.replace('{' + k + '}', vars[k]);
      }
    }
    return str;
  };
}

module.exports = { loadGlobals, findVNode, findAllVNodes, hasTestId, checkNoDangerous, makeT };
