'use strict';
// Test arrow key navigation in order card
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadBundle } = require('./load-bundle.js');

const web = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');

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
  querySelectorAll(sel) {
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
test('Characterization: order type now has onKey function', () => {
  const def = load().DojoTypes.get('order');
  assert.strictEqual(typeof def.onKey, 'function', 'order now has onKey function');
});

test('onKey guards: result and keyBlocked return null', () => {
  const def = load().DojoTypes.get('order');
  // After implementing onKey, it should exist
  assert.strictEqual(typeof def.onKey, 'function', 'onKey function exists');
  
  const p = mkProps();
  
  // With result, should return null
  const ev1 = key('ArrowDown', new Node_(1, 'BUTTON'));
  const result1 = def.onKey(ev1, mkProps({ result: {} }));
  assert.strictEqual(result1, null, 'with result: returns null');
  
  // With keyBlocked (modifier), should return null
  const ev2 = key('ArrowDown', new Node_(1, 'BUTTON'), { ctrlKey: true });
  const result2 = def.onKey(ev2, p);
  assert.strictEqual(result2, null, 'with modifier: returns null');
});

test('ArrowDown from step 0 focuses step 1; ArrowUp from step 0 wraps to last enabled control', () => {
  const def = load().DojoTypes.get('order');
  const p = mkProps();
  
  // Set up DOM with order container and buttons
  const orderContainer = new Node_(1, 'DIV');
  orderContainer.attrs['data-testid'] = 'order';
  doc.root = orderContainer;
  
  // Create unplaced step buttons
  const step0 = new Node_(1, 'BUTTON');
  step0.attrs['data-testid'] = 'order-item-0';
  orderContainer.appendChild(step0);
  
  const step1 = new Node_(1, 'BUTTON');
  step1.attrs['data-testid'] = 'order-item-1';
  orderContainer.appendChild(step1);
  
  const step2 = new Node_(1, 'BUTTON');
  step2.attrs['data-testid'] = 'order-item-2';
  orderContainer.appendChild(step2);
  
  // Create placed list and other buttons
  const reset = new Node_(1, 'BUTTON');
  reset.attrs['data-testid'] = 'order-reset';
  orderContainer.appendChild(reset);
  
  const check = new Node_(1, 'BUTTON');
  check.attrs['data-testid'] = 'btn-submit';
  check.attrs.disabled = true; // Disabled initially
  orderContainer.appendChild(check);
  
  // Test ArrowDown from step0 -> step1
  const ev1 = key('ArrowDown', step0);
  doc.activeElement = null;
  const result1 = def.onKey(ev1, p);
  assert.strictEqual(result1, null);
  assert.strictEqual(doc.activeElement, step1, 'ArrowDown from step0 focuses step1');
  assert.strictEqual(ev1.prevented, true, 'preventDefault called');
  
  // Test ArrowDown from step1 -> step2
  const ev2 = key('ArrowDown', step1);
  doc.activeElement = null;
  const result2 = def.onKey(ev2, p);
  assert.strictEqual(result2, null);
  assert.strictEqual(doc.activeElement, step2, 'ArrowDown from step1 focuses step2');
  
  // Test ArrowDown from step2 -> reset (wraps around)
  const ev3 = key('ArrowDown', step2);
  doc.activeElement = null;
  const result3 = def.onKey(ev3, p);
  assert.strictEqual(result3, null);
  assert.strictEqual(doc.activeElement, reset, 'ArrowDown from step2 wraps to reset');
  
  // Test ArrowUp from step0 -> reset (wraps to last enabled, which is reset since check is disabled)
  const ev4 = key('ArrowUp', step0);
  doc.activeElement = null;
  const result4 = def.onKey(ev4, p);
  assert.strictEqual(result4, null);
  assert.strictEqual(doc.activeElement, reset, 'ArrowUp from step0 wraps to last enabled (reset, check is disabled)');
});

test('With all tiles placed, ArrowDown reaches placed tiles / reset / check; disabled check is skipped', () => {
  const def = load().DojoTypes.get('order');
  const p = mkProps({ state: { placed: ['a', 'b', 'c'], total: 3 } });
  
  // Set up DOM
  const orderContainer = new Node_(1, 'DIV');
  orderContainer.attrs['data-testid'] = 'order';
  doc.root = orderContainer;
  
  // Placed items
  const placed0 = new Node_(1, 'BUTTON');
  placed0.attrs['data-testid'] = 'order-placed-0';
  orderContainer.appendChild(placed0);
  
  const placed1 = new Node_(1, 'BUTTON');
  placed1.attrs['data-testid'] = 'order-placed-1';
  orderContainer.appendChild(placed1);
  
  const placed2 = new Node_(1, 'BUTTON');
  placed2.attrs['data-testid'] = 'order-placed-2';
  orderContainer.appendChild(placed2);
  
  const reset = new Node_(1, 'BUTTON');
  reset.attrs['data-testid'] = 'order-reset';
  orderContainer.appendChild(reset);
  
  const check = new Node_(1, 'BUTTON');
  check.attrs['data-testid'] = 'btn-submit';
  // check is enabled now (all placed)
  orderContainer.appendChild(check);
  
  // Test navigation through placed items
  const ev1 = key('ArrowDown', placed0);
  doc.activeElement = null;
  const result1 = def.onKey(ev1, p);
  assert.strictEqual(result1, null);
  assert.strictEqual(doc.activeElement, placed1, 'ArrowDown from placed0 goes to placed1');
  
  // Continue to placed2
  const ev2 = key('ArrowDown', placed1);
  doc.activeElement = null;
  const result2 = def.onKey(ev2, p);
  assert.strictEqual(result2, null);
  assert.strictEqual(doc.activeElement, placed2, 'ArrowDown from placed1 goes to placed2');
  
  // Continue to reset
  const ev3 = key('ArrowDown', placed2);
  doc.activeElement = null;
  const result3 = def.onKey(ev3, p);
  assert.strictEqual(result3, null);
  assert.strictEqual(doc.activeElement, reset, 'ArrowDown from placed2 goes to reset');
  
  // Continue to check (enabled)
  const ev4 = key('ArrowDown', reset);
  doc.activeElement = null;
  const result4 = def.onKey(ev4, p);
  assert.strictEqual(result4, null);
  assert.strictEqual(doc.activeElement, check, 'ArrowDown from reset goes to check (enabled)');
});

test('With check disabled (not all placed), disabled check is skipped in navigation', () => {
  const def = load().DojoTypes.get('order');
  const p = mkProps({ state: { placed: ['a', 'b'], total: 3 } });
  
  // Set up DOM
  const orderContainer = new Node_(1, 'DIV');
  orderContainer.attrs['data-testid'] = 'order';
  doc.root = orderContainer;
  
  const placed0 = new Node_(1, 'BUTTON');
  placed0.attrs['data-testid'] = 'order-placed-0';
  orderContainer.appendChild(placed0);
  
  const placed1 = new Node_(1, 'BUTTON');
  placed1.attrs['data-testid'] = 'order-placed-1';
  orderContainer.appendChild(placed1);
  
  const step2 = new Node_(1, 'BUTTON');
  step2.attrs['data-testid'] = 'order-item-2';
  orderContainer.appendChild(step2);
  
  const reset = new Node_(1, 'BUTTON');
  reset.attrs['data-testid'] = 'order-reset';
  orderContainer.appendChild(reset);
  
  const check = new Node_(1, 'BUTTON');
  check.attrs['data-testid'] = 'btn-submit';
  check.attrs.disabled = true; // Disabled
  orderContainer.appendChild(check);
  
  // Test ArrowDown from placed1 - should skip disabled check
  const ev = key('ArrowDown', placed1);
  doc.activeElement = null;
  const result = def.onKey(ev, p);
  assert.strictEqual(result, null);
  // Should go to step2 (next enabled after placed1)
  assert.strictEqual(doc.activeElement, step2, 'skips disabled check button and goes to next enabled');
});

test('After a result is shown, arrows do nothing', () => {
  const def = load().DojoTypes.get('order');
  const p = mkProps({ result: { correct: true } });
  
  const orderContainer = new Node_(1, 'DIV');
  orderContainer.attrs['data-testid'] = 'order';
  doc.root = orderContainer;
  
  const step0 = new Node_(1, 'BUTTON');
  step0.attrs['data-testid'] = 'order-item-0';
  orderContainer.appendChild(step0);
  
  const step1 = new Node_(1, 'BUTTON');
  step1.attrs['data-testid'] = 'order-item-1';
  orderContainer.appendChild(step1);
  
  doc.activeElement = step0;
  
  const ev = key('ArrowDown', step0);
  const result = def.onKey(ev, p);
  assert.strictEqual(result, null);
  assert.strictEqual(doc.activeElement, step0, 'focus does not change after result');
});

test('Shift+ArrowDown and Ctrl+ArrowDown are ignored', () => {
  const def = load().DojoTypes.get('order');
  const p = mkProps();
  
  const orderContainer = new Node_(1, 'DIV');
  orderContainer.attrs['data-testid'] = 'order';
  doc.root = orderContainer;
  
  const step0 = new Node_(1, 'BUTTON');
  step0.attrs['data-testid'] = 'order-item-0';
  orderContainer.appendChild(step0);
  
  const step1 = new Node_(1, 'BUTTON');
  step1.attrs['data-testid'] = 'order-item-1';
  orderContainer.appendChild(step1);
  
  doc.activeElement = step0;
  
  // Shift+ArrowDown
  const ev1 = key('ArrowDown', step0, { shiftKey: true });
  const result1 = def.onKey(ev1, p);
  assert.strictEqual(result1, null);
  assert.strictEqual(doc.activeElement, step0, 'Shift+ArrowDown ignored');
  
  // Ctrl+ArrowDown
  const ev2 = key('ArrowDown', step0, { ctrlKey: true });
  const result2 = def.onKey(ev2, p);
  assert.strictEqual(result2, null);
  assert.strictEqual(doc.activeElement, step0, 'Ctrl+ArrowDown ignored');
});

test('Enter and Space are not handled by onKey (native button behavior)', () => {
  const def = load().DojoTypes.get('order');
  const p = mkProps();
  
  const orderContainer = new Node_(1, 'DIV');
  orderContainer.attrs['data-testid'] = 'order';
  doc.root = orderContainer;
  
  const step0 = new Node_(1, 'BUTTON');
  step0.attrs['data-testid'] = 'order-item-0';
  orderContainer.appendChild(step0);
  
  doc.activeElement = step0;
  
  // Enter on button - should return null (native click)
  const ev1 = key('Enter', step0);
  const result1 = def.onKey(ev1, p);
  assert.strictEqual(result1, null, 'Enter not handled');
  
  // Space on button - should return null (native click)
  const ev2 = key(' ', step0);
  const result2 = def.onKey(ev2, p);
  assert.strictEqual(result2, null, 'Space not handled');
});

test('ArrowDown on a non-button element focuses first button', () => {
  const def = load().DojoTypes.get('order');
  const p = mkProps();
  
  const orderContainer = new Node_(1, 'DIV');
  orderContainer.attrs['data-testid'] = 'order';
  doc.root = orderContainer;
  
  const step0 = new Node_(1, 'BUTTON');
  step0.attrs['data-testid'] = 'order-item-0';
  orderContainer.appendChild(step0);
  
  const step1 = new Node_(1, 'BUTTON');
  step1.attrs['data-testid'] = 'order-item-1';
  orderContainer.appendChild(step1);
  
  const div = new Node_(1, 'DIV');
  orderContainer.appendChild(div);
  
  const ev = key('ArrowDown', div);
  doc.activeElement = null;
  const result = def.onKey(ev, p);
  assert.strictEqual(result, null);
  assert.strictEqual(doc.activeElement, step0, 'focuses first button when target is not a button');
});

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
