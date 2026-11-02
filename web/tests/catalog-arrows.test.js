'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const gap = (id, unit) => ({ id, unit, type: 'gap', prompt: 'Prompt ' + id, answers: ['ans' + id] });

function bus() {
  const win = H.fakeWin([]);
  const subs = [];
  const w = Object.assign(win, {
    addEventListener(n, f) { if (n === 'keydown') subs.push(f); },
    removeEventListener(n, f) { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); },
    fire(ev) { subs.slice().forEach((f) => f(ev)); },
    subs
  });
  return w;
}

const key = (k, target, extra) => {
  const e = Object.assign({ key: k, target: target || {}, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, extra);
  e.preventDefault = () => { e.prevented = true; };
  return e;
};

async function open(items, detailId) {
  const win = bus();
  const m = await H.mount({ items, win });
  m.app.go('catalog');
  const cat = m.screen(m.sb.DojoApp._CatalogScreen);
  cat.componentDidMount();
  if (detailId) cat.setState({ detailItem: cat.topics().find((r) => r.id === detailId).item });
  return { win, cat, id: () => (cat.state.detailItem ? cat.state.detailItem.id : null) };
}

const ABC = [gap('a', 'u1'), gap('b', 'u1'), gap('c', 'u1')];

test('ArrowRight in a detail shows the next topic and prevents default', async () => {
  const c = await open(ABC, 'a');
  const e = key('ArrowRight');
  c.win.fire(e);
  assert.strictEqual(c.id(), 'b');
  assert.strictEqual(e.prevented, true);
});

test('ArrowLeft in a detail shows the previous topic', async () => {
  const c = await open(ABC, 'c');
  c.win.fire(key('ArrowLeft'));
  assert.strictEqual(c.id(), 'b');
});

test('ArrowLeft at the first and ArrowRight at the last topic do nothing', async () => {
  const f = await open(ABC, 'a');
  const e = key('ArrowLeft');
  f.win.fire(e);
  assert.strictEqual(f.id(), 'a');
  assert.notStrictEqual(e.prevented, true);
  const l = await open(ABC, 'c');
  l.win.fire(key('ArrowRight'));
  assert.strictEqual(l.id(), 'c');
});

test('navigation follows the filtered list', async () => {
  const c = await open([gap('a', 'u1'), gap('b', 'u1'), gap('c', 'u1')], 'a');
  c.cat.setState({ search: 'prompt c' });
  c.win.fire(key('ArrowRight'));
  assert.strictEqual(c.id(), 'a');
});

test('keys aimed at INPUT, TEXTAREA or SELECT do nothing', async () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const c = await open(ABC, 'a');
    c.win.fire(key('ArrowRight', { tagName }));
    assert.strictEqual(c.id(), 'a', tagName);
  }
});

test('contentEditable target and modifiers do nothing', async () => {
  const c = await open(ABC, 'a');
  c.win.fire(key('ArrowRight', { isContentEditable: true }));
  for (const m of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) c.win.fire(key('ArrowRight', null, { [m]: true }));
  assert.strictEqual(c.id(), 'a');
});

test('list view without a detail ignores arrows', async () => {
  const c = await open(ABC);
  const e = key('ArrowRight');
  c.win.fire(e);
  assert.strictEqual(c.id(), null);
  assert.notStrictEqual(e.prevented, true);
});

test('other keys do not change the detail', async () => {
  const c = await open(ABC, 'a');
  c.win.fire(key('ArrowUp'));
  c.win.fire(key('Enter'));
  assert.strictEqual(c.id(), 'a');
});

test('the listener is registered on mount and removed on leaving the catalog', async () => {
  const c = await open(ABC, 'a');
  assert.strictEqual(c.win.subs.length, 1);
  c.cat.componentWillUnmount();
  assert.strictEqual(c.win.subs.length, 0);
});

test('Escape closes the catalog detail when open', async () => {
  const c = await open(ABC, 'a');
  assert.strictEqual(c.id(), 'a');
  c.win.fire(key('Escape'));
  assert.strictEqual(c.id(), null);
});

test('Escape without a detail open does nothing', async () => {
  const c = await open(ABC);
  assert.strictEqual(c.id(), null);
  c.win.fire(key('Escape'));
  assert.strictEqual(c.id(), null);
});

test('Escape with modifier does not close the detail', async () => {
  for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    const c = await open(ABC, 'a');
    assert.strictEqual(c.id(), 'a');
    c.win.fire(key('Escape', null, { [mod]: true }));
    assert.strictEqual(c.id(), 'a', mod);
  }
});

test('ArrowRight already prevented by arrow-nav does not switch topic', async () => {
  const c = await open(ABC, 'a');
  c.win.fire(key('ArrowRight', { tagName: 'BUTTON' }, { defaultPrevented: true }));
  assert.strictEqual(c.id(), 'a');
});
