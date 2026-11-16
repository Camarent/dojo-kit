'use strict';
// Counter and repeats of a practice run: denominator = planned + repeats queued; only repeats change it.
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const COURSE = {
  id: 'c', title: 'C',
  units: [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }, { id: 'u3', title: 'U3' }]
};
// u1 has two questions (a repeat is possible), u2 has one (no repeat), u3 is empty.
const ITEMS = [
  { id: 'a1', unit: 'u1', type: 'gap', prompt: 'A1', answers: ['x'] },
  { id: 'a2', unit: 'u1', type: 'gap', prompt: 'A2', answers: ['x'] },
  { id: 'b1', unit: 'u2', type: 'gap', prompt: 'B1', answers: ['x'] }
];

const key = (k) => ({ type: 'keydown', key: k, target: { tagName: 'BODY' }, preventDefault() {} });

// Real session screen with the window's listeners really dispatched (as in session-finish.test.js).
async function mountRun(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const win = H.fakeWin([]);
  win.document = { visibilityState: 'visible', body: { tagName: 'BODY' } };
  win.addEventListener = (type, f) => { (win.listeners[type] = win.listeners[type] || []).push(f); };
  win.removeEventListener = (type, f) => { win.listeners[type] = (win.listeners[type] || []).filter((g) => g !== f); };
  win.fire = (ev) => { (win.listeners[ev.type] || []).slice().forEach((f) => f(ev)); };
  const m = await H.mount({ win, items: ITEMS, course: COURSE, setup(sb) {
    sb.setInterval = (f, n) => globalThis.setInterval(f, n);
    sb.clearInterval = (id) => globalThis.clearInterval(id);
    sb.setTimeout = (f, n) => globalThis.setTimeout(f, n);
  } });
  m.win = win;
  m.app.startMode('practice', { limit: 3 });
  const screen = m.screen(m.sb.DojoApp._SessionScreen);
  screen.props = Object.assign({}, screen.props, { onEnd: (sum) => m.app.endSession(sum) });
  screen.componentDidMount();
  m.screen = screen;
  return m;
}

function answerAndNext(m, text) {
  m.screen.answer({ text: text });
  m.win.fire(key('Enter'));
}

// Counter text of the rendered session screen, spaces removed: "answered/denominator".
function counterOf(m) {
  return H.text(H.find(m.screen.view(), 'progress')).replace(/\s+/g, '');
}

test('counter starts at 0 / 3 for three planned questions', async (t) => {
  const m = await mountRun(t);
  assert.strictEqual(m.app.state.session.denominator(), 3);
  assert.strictEqual(counterOf(m), '0/3');
  assert.strictEqual(H.find(m.screen.view(), 'repeats'), null, 'no repeats label before a wrong answer');
});

test('a right answer keeps the denominator at 3', async (t) => {
  const m = await mountRun(t);
  answerAndNext(m, 'x');
  assert.strictEqual(m.app.state.session.denominator(), 3);
  assert.strictEqual(counterOf(m), '1/3');
  assert.strictEqual(H.find(m.screen.view(), 'repeats'), null);
});

test('a wrong answer in a two-question unit adds one repeat: denominator 4 and the repeats label', async (t) => {
  const m = await mountRun(t);
  // Which question comes first is set by the plan; the wrong answer goes to whichever is current.
  const unit = m.app.state.session.current().item.unit;
  answerAndNext(m, 'nope');
  if (unit === 'u1') {
    assert.strictEqual(m.app.state.session.denominator(), 4);
    assert.strictEqual(counterOf(m), '1/4');
    assert.strictEqual(H.text(H.find(m.screen.view(), 'repeats')), 'error repeats: 1');
  } else {
    assert.strictEqual(m.app.state.session.denominator(), 3, 'single-question unit: no repeat');
    assert.strictEqual(counterOf(m), '1/3');
    assert.strictEqual(H.find(m.screen.view(), 'repeats'), null);
  }
});

test('a single-question unit is not re-queued: the denominator stays 3', async (t) => {
  const m = await mountRun(t);
  // Answer every question; the wrong one must be the single-question unit u2 (b1).
  const order = [];
  for (let i = 0; i < 3 && m.app.state.session; i++) {
    const cur = m.app.state.session.current();
    if (!cur) break;
    order.push(cur.item.id);
    answerAndNext(m, cur.item.id === 'b1' ? 'nope' : 'x');
  }
  assert.ok(order.includes('b1'), 'b1 was asked');
  assert.strictEqual(m.app.state.summary.finish.denominator, 3, 'denominator unchanged by the single-question wrong answer');
});
