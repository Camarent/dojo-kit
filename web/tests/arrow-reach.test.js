'use strict';
// Arrow reach for every button group in .work/improvements-5/task-14-list.md.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const nav = require('../ui/arrow-nav.js');

const web = path.join(__dirname, '..');
const src = (p) => fs.readFileSync(path.join(web, p), 'utf8');

// axis: row = Left/Right, col = Up/Down. `file` must still render every testid.
const GROUPS = [
  ['home resume', 'ui/home.js', 'row', ['btn-resume', 'btn-startover', 'btn-discard']],
  ['home more-new', 'ui/home.js', 'row', ['btn-more-5', 'btn-more-10', 'btn-more-20']],
  ['home secondary', 'ui/home.js', 'row', ['btn-settings', 'btn-catalog']],
  ['practice setup actions', 'ui/placement.js', 'row', ['btn-back', 'btn-start']],
  ['placement known/unknown', 'ui/placement.js', 'row', ['placement-known', 'placement-unknown']],
  ['card again/known', 'types/card.js', 'row', ['btn-again', 'btn-known']],
  ['match reset/submit', 'types/match.js', 'row', ['match-reset', 'btn-submit']],
  ['results actions', 'ui/results.js', 'col', ['btn-again-session', 'btn-home']],
  ['settings reset', 'ui/settings-sections.js', 'row', ['btn-reset', 'btn-reset-cancel', 'btn-reset-confirm']],
  ['settings copy/import', 'ui/settings-sections.js', 'row', ['btn-copy', 'btn-import']],
  ['session crash', 'ui/session-screen.js', 'row', ['btn-continue', 'btn-crash-exit']],
  ['dialog exit', 'ui/common.js', 'row', ['-cancel', '-confirm']],
  ['multi options', 'types/multi.js', 'col', ['option-0', 'option-1', 'option-2']]
];

function el(tag, attrs) {
  return {
    tagName: tag, attrs: attrs || {}, childNodes: [], parentNode: null,
    get disabled() { return !!this.attrs.disabled; },
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
const winFor = (display, dir) => ({ getComputedStyle: () => ({ display, flexDirection: dir }) });
const press = (k, target) => ({ key: k, target, preventDefault() { this.prevented = true; } });

for (const [name, file, axis, ids] of GROUPS) {
  test('arrow reach: ' + name, () => {
    const s = src(file);
    for (const id of ids) assert.ok(s.includes(id.replace(/-\d+$/, '')), id + ' rendered in ' + file);
    const parent = el('DIV');
    const bs = ids.map((id) => parent.add(el('BUTTON', { 'data-testid': id })));
    const win = winFor('flex', axis === 'row' ? 'row' : 'column');
    const [fwd, back, wrong] = axis === 'row' ? ['ArrowRight', 'ArrowLeft', 'ArrowDown'] : ['ArrowDown', 'ArrowUp', 'ArrowRight'];
    assert.ok(nav.onKey(press(fwd, bs[0]), win));
    assert.strictEqual(el.active, bs[1]);
    assert.ok(nav.onKey(press(back, bs[0]), win));
    assert.strictEqual(el.active, bs[bs.length - 1], 'wraps');
    assert.ok(!nav.onKey(press(wrong, bs[0]), win), 'other axis ignored');
  });
}

test('disabled skipped; inputs, modifiers, own-handler buttons ignored', () => {
  const p = el('DIV');
  const a = p.add(el('BUTTON')), b = p.add(el('BUTTON', { disabled: true })), c = p.add(el('BUTTON'));
  const win = winFor('flex', 'row');
  nav.onKey(press('ArrowRight', a), win);
  assert.strictEqual(el.active, c);
  const inp = p.add(el('INPUT'));
  assert.ok(!nav.onKey(press('ArrowRight', inp), win));
  const m = press('ArrowRight', a); m.shiftKey = true;
  assert.ok(!nav.onKey(m, win));
  const n = p.add(el('BUTTON', { 'data-testid': 'btn-next', 'data-arrow-own': '' }));
  assert.ok(!nav.onKey(press('ArrowRight', n), win), 'btn-next keeps session advance');
});

test('list-item buttons (multi) group across li siblings', () => {
  const ul = el('UL');
  const bs = [0, 1].map(() => ul.add(el('LI')).add(el('BUTTON', { class: 'opt multi-opt' })));
  nav.onKey(press('ArrowDown', bs[0]), winFor('block', ''));
  assert.strictEqual(el.active, bs[1]);
});

test('landing: Up/Down reach buttons inside row containers in DOM order', () => {
  const actions = el('DIV', { class: 'actions' });
  const placement = actions.add(el('BUTTON', { 'data-testid': 'btn-placement' }));
  const review = actions.add(el('BUTTON', { 'data-testid': 'btn-review' }));
  const row1 = actions.add(el('DIV', { class: 'row wrap' }));
  const practice = row1.add(el('BUTTON', { 'data-testid': 'btn-practice' }));
  const row2 = actions.add(el('DIV', { class: 'row' }));
  const settings = row2.add(el('BUTTON', { 'data-testid': 'btn-settings' }));
  const catalog = row2.add(el('BUTTON', { 'data-testid': 'btn-catalog' }));
  const win = { getComputedStyle: (n) => (n === actions ? { display: 'flex', flexDirection: 'column' } : { display: 'flex', flexDirection: 'row' }) };
  assert.ok(nav.onKey(press('ArrowDown', review), win));
  assert.strictEqual(el.active, practice, 'Practice reached from Repeat');
  const order = [placement, review, practice, settings, catalog];
  let cur = placement;
  for (let i = 1; i <= order.length; i++) {
    nav.onKey(press('ArrowDown', cur), win);
    cur = el.active;
    assert.strictEqual(cur, order[i % order.length]);
  }
  nav.onKey(press('ArrowUp', placement), win);
  assert.strictEqual(el.active, catalog);
  assert.ok(nav.onKey(press('ArrowRight', settings), win));
  assert.strictEqual(el.active, catalog, 'Left/Right row unchanged');
});
