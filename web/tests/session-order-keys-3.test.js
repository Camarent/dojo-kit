'use strict';
// Test arrow key navigation in order card
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

const web = path.join(__dirname, '..');
(p) => fs.readFileSync(path.join(web, p), 'utf8');

function load() {
  const sandbox = { console };
  loadBundle(sandbox, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'types/registry.js', 'types/order.js'] });
  return sandbox;
}

// Fake DOM for testing
class Node_ {
  constructor(type, name) {
    this.nodeType = type;
    this.nodeName = name;
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = {};
    this.prevented = false;
  }
  get tagName() { return this.nodeName; }
  get disabled() { return this.attrs.disabled === true || this.attrs.disabled === 'true'; }
  set disabled(v) { this.attrs.disabled = v ? true : undefined; }
  appendChild(n) {
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  focus() { doc.activeElement = this; }
  get ownerDocument() { return doc; }
  closest(sel) {
    // Simple implementation for data-testid
    if (this.attrs && this.attrs['data-testid'] && sel.includes(this.attrs['data-testid'])) return this;
    return this.parentNode ? this.parentNode.closest(sel) : null;
  }
  querySelectorAll() {
    // Simple implementation: find all BUTTON elements
    const results = [];
    const findButtons = (node) => {
      if (node.nodeName === 'BUTTON') {
        results.push(node);
      }
      node.childNodes.forEach(findButtons);
    };
    findButtons(this);
    return results;
  }
}

const doc = {
  activeElement: null,
  root: null,
  querySelector: function(sel) {
    // Simple querySelector for data-testid
    const match = /data-testid="([^"]+)"/.exec(sel);
    if (match) return this._findByTestId(doc.root, match[1]);
    return null;
  },
  _findByTestId: function(node, testid) {
    if (!node) return null;
    if (node.attrs && node.attrs['data-testid'] === testid) return node;
    for (const child of node.childNodes) {
      const result = this._findByTestId(child, testid);
      if (result) return result;
    }
    return null;
  }
};

function mkProps(extra) {
  const view = { steps: [{ label: 'First', id: 'a' }, { label: 'Second', id: 'b' }, { label: 'Third', id: 'c' }] };
  return Object.assign({
    view: view,
    result: null,
    exam: false,
    state: { placed: [], total: 3 },
    setState: function() {},
    onSubmit: function() {}
  }, extra);
}

function key(k, target, extra) {
  const e = Object.assign({ 
    key: k, 
    target, 
    ctrlKey: false, 
    metaKey: false, 
    altKey: false, 
    shiftKey: false,
    prevented: false,
    preventDefault: function() { this.prevented = true; }
  }, extra);
  return e;
}

// Characterization: before the change, order type has no onKey function
// After the fix, onKey should exist









function orderDom(checkDisabled) {
  const c = new Node_(1, 'DIV');
  c.attrs['data-testid'] = 'order';
  doc.root = c;
  const bs = ['order-item-0', 'order-item-1', 'order-reset', 'btn-submit'].map((id) => {
    const b = new Node_(1, 'BUTTON');
    b.attrs['data-testid'] = id;
    c.appendChild(b);
    return b;
  });
  if (checkDisabled) bs[3].attrs.disabled = true;
  return bs;
}

test('ArrowRight moves to next, ArrowLeft to previous, both wrap, disabled skipped', () => {
  const def = load().DojoTypes.get('order');
  const bs = orderDom(true);
  const r = key('ArrowRight', bs[0]);
  def.onKey(r, mkProps());
  assert.strictEqual(doc.activeElement, bs[1]);
  assert.ok(r.prevented);
  def.onKey(key('ArrowRight', bs[2]), mkProps());
  assert.strictEqual(doc.activeElement, bs[0], 'wraps, skips disabled check');
  def.onKey(key('ArrowLeft', bs[0]), mkProps());
  assert.strictEqual(doc.activeElement, bs[2], 'wraps back, skips disabled check');
  def.onKey(key('ArrowLeft', bs[2]), mkProps());
  assert.strictEqual(doc.activeElement, bs[1]);
});

test('Up/Down still alias Left/Right', () => {
  const def = load().DojoTypes.get('order');
  const bs = orderDom(false);
  def.onKey(key('ArrowDown', bs[0]), mkProps());
  assert.strictEqual(doc.activeElement, bs[1]);
  def.onKey(key('ArrowUp', bs[1]), mkProps());
  assert.strictEqual(doc.activeElement, bs[0]);
});

test('After a result Left/Right do nothing (session advance stays)', () => {
  const def = load().DojoTypes.get('order');
  const bs = orderDom(false);
  doc.activeElement = null;
  const e = key('ArrowRight', bs[0]);
  def.onKey(e, mkProps({ result: { correct: true } }));
  assert.strictEqual(doc.activeElement, null);
  assert.ok(!e.prevented);
});
