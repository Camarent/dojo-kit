'use strict';
// Mutation coverage: remove `this.scrollTop()` after the session setState in startMode -> 'start' fails;
// after endSession's setState -> 'results' fails; in go() -> 'home' fails.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const items = [1, 2, 3].map((n) => ({ type: 'choice', id: 'a' + n, unit: 'u1', prompt: 'q' + n, options: ['x', 'y'], answer: 0 }));

async function setup() {
  const win = H.fakeWin([]);
  const calls = [];
  win.scrollTo = (x, y) => calls.push([x, y]);
  const m = await H.mount({ items, win });
  calls.length = 0;
  return { m, calls };
}

test('scroll to top when a session starts', async () => {
  const { m, calls } = await setup();
  m.app.startMode('daily', {});
  assert.strictEqual(m.app.state.screen, 'session');
  assert.deepStrictEqual(calls, [[0, 0]]);
});

test('scroll to top when results show', async () => {
  const { m, calls } = await setup();
  m.app.startMode('daily', {});
  calls.length = 0;
  m.app.endSession({ total: 1 });
  assert.strictEqual(m.app.state.screen, 'results');
  assert.deepStrictEqual(calls, [[0, 0]]);
});

test('scroll to top when returning home', async () => {
  const { m, calls } = await setup();
  m.app.go('catalog');
  m.app.go('home');
  assert.strictEqual(calls.length, 2);
  assert.ok(calls.every((c) => c[0] === 0 && c[1] === 0));
});

test('a window without scrollTo does not break navigation', async () => {
  const m = await H.mount({ items });
  m.app.go('settings');
  assert.strictEqual(m.app.state.screen, 'settings');
});
