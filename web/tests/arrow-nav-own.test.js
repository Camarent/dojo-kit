'use strict';
const test = require('node:test');
const assert = require('node:assert');
const nav = require('../ui/arrow-nav.js');
const reg = require('../types/registry.js');

function el(tag, attrs, top) {
  return {
    tagName: tag, attrs: attrs || {}, childNodes: [], parentNode: null, offsetTop: top,
    get disabled() { return false; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    closest(sel) {
      const m = /^\[([\w-]+)\]$/.exec(sel);
      for (let n = this; n; n = n.parentNode) if (m && n.attrs && n.attrs[m[1]] !== undefined) return n;
      return null;
    },
    focus() { el.active = this; },
    add(c) { c.parentNode = this; this.childNodes.push(c); return c; }
  };
}
const win = (display, dir, cols) => ({ getComputedStyle: () => ({ display, flexDirection: dir, gridTemplateColumns: cols }) });
const press = (k, target, x) => Object.assign({ key: k, target, preventDefault() { this.prevented = true; } }, x);

test('grid: equal offsetTop is horizontal', () => {
  const g = el('DIV');
  const a = g.add(el('BUTTON', {}, 10)), b = g.add(el('BUTTON', {}, 10));
  const w = win('grid', '');
  assert.ok(nav.onKey(press('ArrowRight', a), w));
  assert.strictEqual(el.active, b);
  assert.ok(!nav.onKey(press('ArrowDown', a), w));
});

test('grid: different offsetTop is vertical', () => {
  const g = el('DIV');
  const a = g.add(el('BUTTON', {}, 10)), b = g.add(el('BUTTON', {}, 50));
  assert.ok(nav.onKey(press('ArrowDown', a), win('grid', '')));
  assert.strictEqual(el.active, b);
  assert.ok(!nav.onKey(press('ArrowRight', a), win('grid', '')));
});

test('grid: no offsetTop falls back to template tracks', () => {
  const g = el('DIV');
  const a = g.add(el('BUTTON')), b = g.add(el('BUTTON'));
  assert.ok(nav.onKey(press('ArrowRight', a), win('grid', '', '1fr 1fr')));
  assert.ok(!nav.onKey(press('ArrowRight', a), win('grid', '', '1fr')));
  assert.strictEqual(el.active, b);
});

test('order tile inside data-arrow-own is not handled', () => {
  const o = el('DIV', { 'data-arrow-own': '' });
  const a = o.add(el('BUTTON')); o.add(el('BUTTON'));
  assert.ok(!nav.onKey(press('ArrowDown', a), win('block', '')));
});

test('choice option owned, multi option navigable', () => {
  const ul = el('UL', { 'data-arrow-own': '' });
  const c = [0, 1].map(() => ul.add(el('LI')).add(el('BUTTON')));
  assert.ok(!nav.onKey(press('ArrowDown', c[0]), win('block', '')));
  const ml = el('UL');
  const m = [0, 1].map(() => ml.add(el('LI')).add(el('BUTTON')));
  assert.ok(nav.onKey(press('ArrowDown', m[0]), win('block', '')));
  assert.strictEqual(el.active, m[1]);
});

test('pre-prevented event: arrow-nav false, keyBlocked true', () => {
  const g = el('DIV');
  const a = g.add(el('BUTTON')); g.add(el('BUTTON'));
  const e = press('ArrowRight', a, { defaultPrevented: true });
  assert.ok(!nav.onKey(e, win('flex', 'row')));
  assert.ok((reg.keyBlocked || (globalThis.DojoTypes || {}).keyBlocked)(e));
});
