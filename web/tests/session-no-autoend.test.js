'use strict';
const test = require('node:test');
const assert = require('node:assert');
const H = require('./app-harness.js');

const EXAM = { id: 'm1', passMark: 0.5, minutes: 30, sections: [{ title: 'A', count: 3, tags: ['a'] }, { title: 'B', count: 3, tags: ['b'] }] };
const COURSE = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], exams: [EXAM] };

function mkItems(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ id: 'i' + i, unit: 'u', type: 'gap', prompt: 'P' + i, answers: ['x'], tags: [i % 2 ? 'a' : 'b'] });
  return out;
}
function examItems() {
  const out = [];
  ['a', 'b'].forEach((tag) => { for (let i = 1; i <= 3; i++) out.push({ id: tag + i, unit: 'u', type: 'gap', prompt: 'P', answers: ['x'], tags: [tag] }); });
  return out;
}

// Window that records and really dispatches listeners.
function recordingWin() {
  const win = H.fakeWin([]);
  win.document = { visibilityState: 'visible', body: { tagName: 'BODY' } };
  win.addEventListener = (type, f) => { (win.listeners[type] = win.listeners[type] || []).push(f); };
  win.removeEventListener = (type, f) => { win.listeners[type] = (win.listeners[type] || []).filter((g) => g !== f); };
  win.fire = (ev) => { (win.listeners[ev.type] || []).slice().forEach((f) => f(ev)); };
  return win;
}
const key = (k, extra) => Object.assign({ type: 'keydown', key: k, target: { tagName: 'BODY' }, preventDefault() {} }, extra);

// Mounts the real SessionScreen for the session in app state, with timers driven by mock.timers.
async function mountSession(o) {
  const win = recordingWin();
  const timers = { intervals: 0 };
  const m = await H.mount(Object.assign({ win }, o, {
    setup(sb) {
      sb.setInterval = (f, n) => { timers.intervals++; return globalThis.setInterval(f, n); };
      sb.clearInterval = (id) => globalThis.clearInterval(id);
      sb.setTimeout = (f, n) => globalThis.setTimeout(f, n);
    }
  }));
  m.timers = timers;
  m.win = win;
  return m;
}
function openScreen(m) {
  const screen = m.screen(m.sb.DojoApp._SessionScreen);
  screen.props = Object.assign({}, screen.props, { onEnd: (sum) => m.app.endSession(sum) });
  screen.componentDidMount();
  return screen;
}
function spyFinish(session) {
  const calls = { n: 0 };
  const orig = session.finish;
  session.finish = function () { calls.n++; return orig.apply(this, arguments); };
  return calls;
}
function assertStillOnFirst(m, finishCalls, label) {
  assert.strictEqual(m.app.state.screen, 'session', label + ': session screen');
  assert.strictEqual(m.app.state.session.index, 0, label + ': index');
  assert.strictEqual(m.app.state.session.done, false, label + ': done');
  assert.strictEqual(finishCalls.n, 0, label + ': finish() never called');
  assert.strictEqual(m.app.state.summary, null, label + ': no summary');
}

test('practice: no tick timer, keydown listener registered, 120 s idle keeps question 1 open', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: mkItems(10), course: COURSE });
  m.app.startMode('practice', { limit: 10 });
  const session = m.app.state.session;
  assert.strictEqual(session.total, 10);
  assert.strictEqual(session.deadline, undefined);
  const fin = spyFinish(session);
  const screen = openScreen(m);
  assert.strictEqual(m.win.listeners.keydown.length, 1, 'keydown listener registered');
  assert.strictEqual(m.timers.intervals, 0, 'no interval timer on a practice session');
  t.mock.timers.tick(120000);
  assertStillOnFirst(m, fin, 'after 120 s');
  assert.strictEqual(screen.state.result, null);
});

test('practice: visibilitychange hidden and pagehide dispatched on the window do not end the session', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: mkItems(10), course: COURSE });
  m.app.startMode('practice', { limit: 10 });
  const fin = spyFinish(m.app.state.session);
  openScreen(m);
  m.win.document.visibilityState = 'hidden';
  m.win.fire({ type: 'visibilitychange' });
  m.win.fire({ type: 'pagehide' });
  t.mock.timers.tick(120000);
  assertStillOnFirst(m, fin, 'after hide');
});

test('exam: draft-saving listeners are registered, hidden/pagehide save the draft and 120 s idle of the 30 min clock does not finish', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: examItems(), course: COURSE });
  m.app.startMode('exam', { examId: 'm1' });
  const session = m.app.state.session;
  assert.ok(session.deadline !== undefined);
  const fin = spyFinish(session);
  let saves = 0;
  const origSave = session.saveDraft;
  session.saveDraft = function () { saves++; return origSave.apply(this, arguments); };
  openScreen(m);
  assert.strictEqual(m.win.listeners.visibilitychange.length, 1, 'visibilitychange registered');
  assert.strictEqual(m.win.listeners.pagehide.length, 1, 'pagehide registered');
  assert.strictEqual(m.timers.intervals, 1, 'exam owns the single tick interval');
  m.win.fire({ type: 'visibilitychange' });
  assert.strictEqual(saves, 0, 'visible: no save');
  m.win.document.visibilityState = 'hidden';
  m.win.fire({ type: 'visibilitychange' });
  m.win.fire({ type: 'pagehide' });
  assert.strictEqual(saves, 2);
  t.mock.timers.tick(120000);
  assertStillOnFirst(m, fin, 'exam after hide and idle');
});

test('practice: stray Enter, ArrowRight, Space, Escape and 30 repeated keydowns on body answer nothing and do not finish', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: mkItems(10), course: COURSE });
  m.app.startMode('practice', { limit: 10 });
  const session = m.app.state.session;
  const fin = spyFinish(session);
  const screen = openScreen(m);
  ['Enter', 'ArrowRight', ' ', 'Escape'].forEach((k) => m.win.fire(key(k)));
  for (let i = 0; i < 30; i++) m.win.fire(key('Enter', { repeat: true }));
  t.mock.timers.tick(120000);
  assertStillOnFirst(m, fin, 'after stray keys');
  assert.strictEqual(screen.state.result, null, 'nothing answered');
  assert.strictEqual(screen.state.answered, 0);
});

function examWithDraft(m, answers) {
  const s = m.engine.start('exam', { examId: 'm1' });
  for (let i = 0; i < answers; i++) { s.answer({ text: 'x' }); s.next(); }
  s.saveDraft();
  s.release && s.release();
  m.app.setState({ home: m.app.homeData() });
  return s;
}

test('resume: a saved draft is not opened or finished by itself; Resume opens the saved question', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: examItems(), course: COURSE });
  examWithDraft(m, 1);
  t.mock.timers.tick(120000);
  assert.strictEqual(m.app.state.screen, 'home');
  assert.ok(H.find(m.tree(), 'resume-box'), 'resume box shown');
  assert.strictEqual(Object.keys(m.doc.exams).length, 0, 'nothing finished');
  H.find(m.tree(), 'btn-resume').props.onClick();
  assert.strictEqual(m.app.state.screen, 'session');
  assert.strictEqual(m.app.state.session.index, 1);
  assert.strictEqual(m.app.state.session.done, false);
  assert.strictEqual(Object.keys(m.doc.exams).length, 0);
});

test('resume: a draft with every question answered stays on home until Resume is pressed, which then shows the results', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: examItems(), course: COURSE });
  examWithDraft(m, 6);
  t.mock.timers.tick(120000);
  assert.strictEqual(m.app.state.screen, 'home', 'no auto results');
  assert.strictEqual(Object.keys(m.doc.exams).length, 0);
  H.find(m.tree(), 'btn-resume').props.onClick();
  assert.strictEqual(m.app.state.screen, 'results');
  assert.strictEqual(Object.keys(m.doc.exams).length, 1);
});

test('resume: a draft whose remaining time is zero stays on home until Resume is pressed', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: examItems(), course: COURSE });
  examWithDraft(m, 1);
  m.doc.examDraft.remainingMs = [0];
  m.app.setState({ home: m.app.homeData() });
  t.mock.timers.tick(120000);
  assert.strictEqual(m.app.state.screen, 'home', 'no auto results');
  assert.strictEqual(Object.keys(m.doc.exams).length, 0);
});

test('double click on the Review button on Home starts exactly one session: the button is gone after the first click', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: mkItems(10), course: COURSE });
  let starts = 0;
  const origStart = m.engine.start;
  m.engine.start = function () { starts++; return origStart.apply(this, arguments); };
  const btn = H.find(m.tree(), 'btn-review');
  assert.ok(btn, 'review button on Home');
  btn.props.onClick();
  assert.strictEqual(H.find(m.tree(), 'btn-review'), null, 'Home button no longer rendered, a second click has no target');
  assert.strictEqual(starts, 1, 'engine.start called once');
  assert.strictEqual(m.app.state.screen, 'session');
  assert.strictEqual(m.app.state.session.index, 0);
});

test('practice limit 10 over 3 items: queue is 3, session stays open with zero answers', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: mkItems(3), course: COURSE });
  m.app.startMode('practice', { limit: 10 });
  const session = m.app.state.session;
  assert.strictEqual(session.total, 3);
  const fin = spyFinish(session);
  openScreen(m);
  t.mock.timers.tick(120000);
  assertStillOnFirst(m, fin, 'short queue');
});

test('daily with nothing due and no new allowed: start reports empty, Home stays, no results screen', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: mkItems(3), course: COURSE, settings: { newPerDay: 0 } });
  m.app.startMode('daily', {});
  assert.strictEqual(m.app.state.screen, 'home');
  assert.strictEqual(m.app.state.session, null);
  assert.ok(m.app.state.notice, 'notice shown');
  assert.strictEqual(Object.keys(m.doc.exams).length, 0);
});

test('practice: answering every item reaches results only through next(), after the last answer', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const m = await mountSession({ items: mkItems(2), course: COURSE });
  m.app.startMode('practice', { limit: 2 });
  const session = m.app.state.session;
  const fin = spyFinish(session);
  const screen = openScreen(m);
  const input = { text: 'x' };
  screen.answer(input);
  assert.strictEqual(fin.n, 0, 'answering does not finish');
  m.win.fire(key('Enter'));
  assert.strictEqual(m.app.state.session.index, 1, 'Enter after an answer advances');
  assert.strictEqual(fin.n, 0);
  screen.answer(input);
  assert.strictEqual(fin.n, 0);
  m.win.fire(key('Enter'));
  assert.strictEqual(fin.n, 1);
  assert.strictEqual(m.app.state.screen, 'results');
});
