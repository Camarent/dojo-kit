'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const COURSE = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] };
const tr = (k) => k;

function mkItems(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ id: 'i' + i, unit: 'u', type: 'gap', prompt: 'P' + i, answers: ['x'] });
  return out;
}

const key = (k) => ({ type: 'keydown', key: k, target: { tagName: 'BODY' }, preventDefault() {} });

// Real session screen with the window's listeners really dispatched (as in session-no-autoend.test.js).
async function mountPractice(t, items, limit) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const win = H.fakeWin([]);
  win.document = { visibilityState: 'visible', body: { tagName: 'BODY' } };
  win.addEventListener = (type, f) => { (win.listeners[type] = win.listeners[type] || []).push(f); };
  win.removeEventListener = (type, f) => { win.listeners[type] = (win.listeners[type] || []).filter((g) => g !== f); };
  win.fire = (ev) => { (win.listeners[ev.type] || []).slice().forEach((f) => f(ev)); };
  const m = await H.mount({ win, items, course: COURSE, setup(sb) {
    sb.setInterval = (f, n) => globalThis.setInterval(f, n);
    sb.clearInterval = (id) => globalThis.clearInterval(id);
    sb.setTimeout = (f, n) => globalThis.setTimeout(f, n);
  } });
  m.win = win;
  m.app.startMode('practice', { limit: limit });
  const screen = m.screen(m.sb.DojoApp._SessionScreen);
  screen.props = Object.assign({}, screen.props, { onEnd: (sum) => m.app.endSession(sum) });
  screen.componentDidMount();
  m.screen = screen;
  return m;
}

// Answers the current item with the given text, then presses Enter to move on.
function answerAndNext(m, text) {
  m.screen.answer({ text: text });
  m.win.fire(key('Enter'));
}

test('finish: after the last answer the run shows the four numbers', async (t) => {
  const m = await mountPractice(t, mkItems(2), 2);
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.screen, 'session', 'one answer left: still in the session');
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.screen, 'results', 'queue empty: finish screen');
  const fin = m.app.state.summary.finish;
  assert.strictEqual(fin.answered, 2);
  assert.strictEqual(fin.right, 2);
  assert.strictEqual(fin.weakLeft, 0);
  assert.strictEqual(fin.denominator, 2);
  const v = m.sb.DojoApp._Results({ t: tr, byId: { i1: mkItems(2)[0], i2: mkItems(2)[1] }, go() {}, onAgain() {}, summary: m.app.state.summary });
  assert.ok(H.find(v, 'session-finish'), 'finish block rendered');
  assert.ok(H.text(H.find(v, 'finish-answered')).includes('2'), 'answered shows 2');
  assert.ok(H.text(H.find(v, 'finish-right')).includes('2'), 'right shows 2');
  assert.ok(H.text(H.find(v, 'finish-weak-left')).includes('0'), 'weak left shows 0');
  assert.ok(H.find(v, 'finish-next-due'), 'next due shown');
});

test('finish: no new round starts by itself after the last answer', async (t) => {
  const m = await mountPractice(t, mkItems(2), 2);
  answerAndNext(m, 'x');
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.screen, 'results');
  t.mock.timers.tick(60000);
  t.mock.timers.tick(600000);
  assert.strictEqual(m.app.state.screen, 'results', 'still on finish after waiting');
  assert.strictEqual(m.app.state.session, null, 'no session started again');
  assert.strictEqual(m.app.state.summary.answered, 2, 'no extra answers recorded');
});

test('finish: a wrong answer re-queues once, then the run finishes', async (t) => {
  const m = await mountPractice(t, mkItems(2), 2);
  answerAndNext(m, 'nope');
  assert.strictEqual(m.app.state.screen, 'session', 'wrong answer: the repeat keeps the run open');
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.screen, 'session', 'repeat still pending');
  answerAndNext(m, 'nope');
  assert.strictEqual(m.app.state.screen, 'results', 'a second wrong answer on the repeat does not re-queue again');
  // Repeat answers are not in the review: answered counts the first answer of each item.
  const fin = m.app.state.summary.finish;
  assert.strictEqual(fin.answered, 2);
  assert.strictEqual(fin.right, 1);
  assert.strictEqual(fin.denominator, 3, 'planned 2 plus one repeat');
});
