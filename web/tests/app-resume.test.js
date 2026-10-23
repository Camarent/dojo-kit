'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const NOW = 1760000000000;
const SECTIONS = [{ title: 'A', count: 3, tags: ['a'] }, { title: 'B', count: 3, tags: ['b'] }];
const EXAM = { id: 'm1', passMark: 0.5, sections: SECTIONS, minutes: 30 };

function loadApp() {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  loadBundle(sb, { only: ['ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb.DojoApp;
}
function walk(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = walk(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id) return n;
  return walk(n.props.children, id);
}
function mkItems() {
  const out = [];
  ['a', 'b'].forEach((tag) => { for (let i = 1; i <= 3; i++) out.push({ id: tag + i, unit: 'u', type: 'gap', prompt: 'P', answers: ['x'], tags: [tag] }); });
  return out;
}

async function setup() {
  const App = loadApp();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const clock = { t: NOW };
  const store = { doc, status: 'ok', update(fn) { fn(doc); }, flush() { this.flushed = (this.flushed || 0) + 1; }, noteAnswer() {} };
  const its = mkItems();
  const content = { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course: { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], exams: [EXAM] } };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  const t = (k, v) => k + (v ? JSON.stringify(v) : '');
  const app = new App._App({ store, engine, dojo, t, content, course: content.course, now: () => clock.t, today: () => '2025-10-09', win: {}, byId: {} });
  app.setState = function (patch) { this.state = Object.assign({}, this.state, typeof patch === 'function' ? patch(this.state) : patch); };
  return { App, app, engine, doc, clock };
}
function begin(x) {
  const s = x.engine.start('exam', { examId: 'm1' });
  s.answer({ text: 'x' });
  s.saveDraft();
  s.release && s.release();
  x.app.setState({ home: x.app.homeData() });
  return s;
}
const tree = (x) => {
  const root = x.app.render(x.app.props, x.app.state);
  const body = root.props.children;
  return typeof body.type === 'function' && !(body.type.prototype && body.type.prototype.render) ? body.type(body.props) : root;
};

test('home renders resume box with progress when a draft exists, none otherwise', async () => {
  const x = await setup();
  assert.strictEqual(walk(tree(x), 'resume-box'), null);
  begin(x);
  const r = tree(x);
  assert.ok(walk(r, 'resume-box') && walk(r, 'btn-resume') && walk(r, 'btn-startover') && walk(r, 'btn-discard'));
  assert.strictEqual(x.app.state.home.resume.answered, 1);
});

test('Resume opens a session on the saved draft', async () => {
  const x = await setup();
  const old = begin(x);
  walk(tree(x), 'btn-resume').props.onClick();
  assert.strictEqual(x.app.state.screen, 'session');
  assert.strictEqual(x.app.state.session.index, 1);
  assert.notStrictEqual(x.app.state.session, old);
});

test('Discard removes the draft and the box', async () => {
  const x = await setup();
  begin(x);
  walk(tree(x), 'btn-discard').props.onClick();
  assert.strictEqual(x.engine.examDraft(), null);
  assert.strictEqual(walk(tree(x), 'resume-box'), null);
});

test('Start over discards the draft and starts a fresh exam without a confirm loop', async () => {
  const x = await setup();
  const old = begin(x);
  x.clock.t += 5;
  walk(tree(x), 'btn-startover').props.onClick();
  assert.strictEqual(x.app.state.confirmNew, null);
  assert.strictEqual(x.app.state.screen, 'session');
  assert.strictEqual(x.app.state.session.index, 0);
  assert.notStrictEqual(x.app.state.session.id, old.id);
});

test('starting a new exam over a draft asks to confirm; cancel keeps the draft, accept starts', async () => {
  const x = await setup();
  begin(x);
  x.app.startMode('exam', { examId: 'm1' });
  assert.ok(x.app.state.confirmNew);
  assert.strictEqual(tree(x).props.children.props.testid, 'confirm-new-exam');
  tree(x).props.children.props.onCancel();
  assert.strictEqual(x.app.state.confirmNew, null);
  assert.strictEqual(x.app.state.screen, 'home');
  assert.ok(x.engine.examDraft());
  x.app.startMode('exam', { examId: 'm1' });
  tree(x).props.children.props.onConfirm();
  assert.strictEqual(x.app.state.confirmNew, null);
  assert.strictEqual(x.app.state.screen, 'session');
  assert.strictEqual(x.app.state.session.index, 0);
  assert.strictEqual(x.engine.examDraft(), null);
});

test('exitSession abandons the exam session and flushes', async () => {
  const x = await setup();
  const s = x.engine.start('exam', { examId: 'm1' });
  let abandoned = 0;
  const orig = s.abandon;
  s.abandon = function () { abandoned++; return orig.call(s); };
  x.app.setState({ screen: 'session', session: s });
  x.app.exitSession();
  assert.strictEqual(abandoned, 1);
  assert.strictEqual(x.app.state.screen, 'home');
  assert.ok(x.app.props.store.flushed >= 1);
});

test('SessionScreen: hidden and pagehide save the draft, visible does not; listeners removed on unmount', async () => {
  const App = loadApp();
  const proto = App._SessionScreen.prototype;
  const listeners = {};
  const win = {
    document: { visibilityState: 'visible' },
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener(n, f) { listeners[n] = (listeners[n] || []).filter((g) => g !== f); }
  };
  let saves = 0;
  const self = { props: { win, session: { saveDraft() { saves++; }, release() {} } }, onKey() {}, focusSoon() {} };
  proto.componentDidMount.call(self);
  listeners.visibilitychange[0]({ type: 'visibilitychange' });
  assert.strictEqual(saves, 0);
  listeners.pagehide[0]({ type: 'pagehide' });
  assert.strictEqual(saves, 1);
  win.document.visibilityState = 'hidden';
  listeners.visibilitychange[0]({ type: 'visibilitychange' });
  assert.strictEqual(saves, 2);
  proto.componentWillUnmount.call(self);
  assert.strictEqual((listeners.visibilitychange || []).length, 0);
  assert.strictEqual((listeners.pagehide || []).length, 0);
  assert.strictEqual((listeners.keydown || []).length, 0);
});

test('finished_elsewhere also when the sid is only in closedSids', async () => {
  const x = await setup();
  const s = x.engine.start('exam', { examId: 'm1' });
  x.doc.examDraft = { sid: 'other', updatedAt: NOW + 5, closed: 'abandoned', closedSids: [{ sid: s.id, updatedAt: NOW + 1 }] };
  assert.strictEqual(s.finish().error, 'finished_elsewhere');
  assert.strictEqual(Object.keys(x.doc.exams).length, 0);
});
