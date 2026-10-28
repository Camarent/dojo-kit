'use strict';
// Pins which handler owns the arrow keys: every data-arrow-own marker must stop arrow-nav on the document.
const test = require('node:test');
const assert = require('node:assert');
const { Node_, doc, q, mounted, mount, key, press, startSession } = require('./keys-helpers.js');
const nav = require('../ui/arrow-nav.js');

test.after(() => mounted.forEach((f) => f()));

const hasOwn = (n) => { for (; n; n = n.parentNode) if (n.attrs && n.attrs['data-arrow-own'] !== undefined) return true; return false; };
function sel(n, s) {
  const m = /^\[data-testid="([^"]+)"\]$/.exec(s);
  if (m) return n.attrs && n.attrs['data-testid'] === m[1];
  return s === '[data-arrow-own]' ? !!(n.attrs && n.attrs['data-arrow-own'] !== undefined) : (n.nodeName || '').toLowerCase() === s;
}
Node_.prototype.closest = function (s) { for (let n = this; n; n = n.parentNode) if (sel(n, s)) return n; return null; };
Node_.prototype.querySelectorAll = function (s) {
  const out = [];
  const walk = (n) => n.childNodes.forEach((c) => { if (sel(c, s)) out.push(c); walk(c); });
  walk(this);
  out.forEach((b) => { b.disabled = b.attrs.disabled !== undefined; });
  return out;
};

const ORDER = { id: 'o1', unit: 'u', type: 'order', prompt: 'Sort', steps: ['a', 'b', 'c'], answer: ['a', 'b', 'c'] };
const SENTENCE = Object.assign({}, ORDER, { id: 'o2', prompt: 'X ___ Y ___ Z ___ W' });
const CHOICE = { id: 'c1', unit: 'u', type: 'choice', prompt: 'Pick', options: ['A', 'B', 'C'], answer: 0 };
const GAP = { id: 'g1', unit: 'u', type: 'gap', prompt: 'Fill', answers: ['t'] };
const GAP2 = { id: 'g2', unit: 'u', type: 'gap', prompt: 'Fill2', answers: ['t'] };

// Row layout so arrow-nav would act on Left/Right; column layout for Up/Down.
const styleFor = (k) => () => (k === 'ArrowLeft' || k === 'ArrowRight' ? { display: 'flex', flexDirection: 'row' } : { display: 'block' });

// Mirrors the browser: document listener (arrow-nav) runs before the window handlers.
async function arrow(m, k, target) {
  m.win.getComputedStyle = styleFor(k);
  doc.activeElement = target;
  const ev = key(k, target);
  nav.onKey(ev, m.win);
  if (ev.prevented) { ev.defaultPrevented = true; await m.flush(); return ev; }
  return press(m, ev);
}
const start = async (m) => { await startSession(m); await m.flush(); await m.flush(); };
const withExtraBtn = (n) => { const b = new Node_(1, 'BUTTON'); b.attrs['data-testid'] = 'extra'; n.parentNode.appendChild(b); return b; };

async function answerGap(m) {
  q(m.rootEl, 'gap-input').fire('input', { target: { value: 't' } });
  await m.flush();
  q(m.rootEl, 'gap-form').fire('submit', { preventDefault() {} });
  await m.flush();
  await m.flush();
}

for (const item of [ORDER, SENTENCE]) test('order ' + item.id + ': ArrowDown from last pool tile leaves the pool (owner), not wraps (arrow-nav)', async () => {
  const m = await mount([item]);
  await start(m);
  const root = q(m.rootEl, 'order');
  assert.ok(hasOwn(root), 'order marked');
  const btns = root.querySelectorAll('button').filter((b) => !b.disabled);
  const last = btns.filter((b) => b.parentNode === btns[0].parentNode).pop();
  const before = btns.indexOf(last);
  await arrow(m, 'ArrowDown', last);
  const after = btns.indexOf(doc.activeElement);
  assert.strictEqual(after, (before + 1) % btns.length, 'moved exactly one button in container order');
  assert.notStrictEqual(doc.activeElement.parentNode, last.parentNode, 'left the pool group');
});

test('choice: ArrowDown selects next option once, no arrow-nav second move', async () => {
  const m = await mount([CHOICE]);
  await start(m);
  const o2 = q(m.rootEl, 'option-2');
  await arrow(m, 'ArrowUp', o2);
  assert.strictEqual(doc.activeElement, q(m.rootEl, 'option-1'), 'ArrowUp moves exactly one option');
  const o0 = q(m.rootEl, 'option-0');
  await arrow(m, 'ArrowUp', o0);
  assert.strictEqual(doc.activeElement, q(m.rootEl, 'option-2'), 'wrap goes to last option');
  const ev = await arrow(m, 'ArrowRight', q(m.rootEl, 'option-0'));
  assert.strictEqual(ev.defaultPrevented, undefined, 'ArrowRight is not taken by arrow-nav');
  assert.strictEqual(doc.activeElement, q(m.rootEl, 'option-0'), 'ArrowRight does not move focus');
});

test('session-screen btn-next: ArrowRight advances exactly once', async () => {
  const m = await mount([GAP, GAP2]);
  await start(m);
  await answerGap(m);
  const next = q(m.rootEl, 'btn-next');
  assert.ok(hasOwn(next), 'btn-next marked');
  withExtraBtn(next);
  const before = m.app.state.session.current().item.id;
  const ev = await arrow(m, 'ArrowRight', next);
  assert.strictEqual(ev.defaultPrevented, undefined, 'arrow-nav did not take the key');
  await m.flush();
  assert.notStrictEqual(m.app.state.session.current().item.id, before, 'advanced to next item');
  assert.strictEqual(m.app.state.session.current().item.id, 'g2', 'advanced exactly once');
});

test('session-screen btn-intro-done: ArrowRight stays with the owner (no arrow-nav move)', async () => {
  const m = await mount([Object.assign({ entity: 'e1' }, GAP)], { introNew: true }, [{ id: 'e1', title: 'Intro', text: 'Hello' }]);
  await start(m);
  const btn = q(m.rootEl, 'btn-intro-done');
  assert.ok(btn, 'intro card shown');
  assert.ok(hasOwn(btn), 'btn-intro-done marked');
  const extra = withExtraBtn(btn);
  const ev = await arrow(m, 'ArrowRight', btn);
  assert.strictEqual(ev.defaultPrevented, undefined, 'arrow-nav did not take the key');
  assert.notStrictEqual(doc.activeElement, extra, 'focus not moved to the sibling');
});

for (const mode of ['check', 'self']) {
  test('placement ' + mode + ' btn-next: ArrowRight is not taken by arrow-nav', async () => {
    const m = await mount([GAP, GAP2], { placement: { mode } });
    m.app.startPlacement();
    await m.flush();
    await m.flush();
    if (mode === 'check') await answerGap(m);
    else { q(m.rootEl, 'placement-known').fire('click'); await m.flush(); }
    const next = q(m.rootEl, 'btn-next');
    assert.ok(next && hasOwn(next), 'btn-next marked');
    const extra = withExtraBtn(next);
    const ev = await arrow(m, 'ArrowRight', next);
    assert.strictEqual(ev.defaultPrevented, undefined, 'arrow-nav did not take the key');
    assert.notStrictEqual(doc.activeElement, extra, 'focus not moved to the sibling');
  });
}
