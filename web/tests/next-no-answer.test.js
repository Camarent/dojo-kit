'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const NOW = 1760000000000;

function loadApp() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  loadBundle(sb, { only: ['types/registry.js', 'types/card.js', 'types/choice.js', 'ui/answer-block.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js', 'ui/catalog-audio.js', 'ui/catalog-detail.js', 'ui/catalog.js', 'ui/group-card.js', 'ui/home.js', 'ui/stimulus.js', 'ui/session-feedback.js', 'ui/session-focus.js', 'ui/session-boundary.js', 'ui/session-panels.js', 'ui/session-screen.js', 'ui/results.js', 'ui/placement.js', 'ui/settings-speech.js', 'ui/settings-sections.js', 'ui/settings-plugin.js', 'ui/settings-dialogs.js', 'ui/settings.js', 'ui/app-screens.js', 'ui/app.js'] });
  return sb.DojoApp;
}
function walk(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = walk(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id) return n;
  return walk(n.props.children, id);
}
const ITEMS = [
  { id: 'g1', unit: 'u', type: 'gap', prompt: 'P1', answers: ['x'] },
  { id: 'g2', unit: 'u', type: 'gap', prompt: 'P2', answers: ['y'] },
  { id: 'k1', unit: 'u', type: 'card', prompt: 'C1', back: 'B1' }
];

async function setup(courseExtra) {
  const App = loadApp();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc, status: 'ok', update(fn) { fn(doc); }, flush() {}, noteAnswer() {} };
  const course = Object.assign({
    id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], placement: { mode: 'self' },
    exams: [{ id: 'timed', passMark: 0.5, minutes: 10, sections: [{ title: 'A', count: 2, types: ['gap'] }] }]
  }, courseExtra);
  const content = { v: 1, version: 't', lock: ITEMS.map((i) => i.id), items: ITEMS, course };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => '2025-10-09', random: () => 0.5 });
  const t = (k, v) => k + (v ? JSON.stringify(v) : '');
  return { App, engine, doc, course, t };
}
function screen(x, session) {
  const props = { t: x.t, session, now: () => NOW, win: {}, course: x.course, byId: {}, dojo: null };
  const sc = new x.App._SessionScreen(props);
  sc.setState = function (patch) { this.state = Object.assign({}, this.state, typeof patch === 'function' ? patch(this.state) : patch); };
  sc.state = Object.assign({}, sc.state, { cur: session.current() });
  return sc;
}
const view = (sc) => sc.render(sc.props, sc.state);

test('quiz card, course.dontKnow absent: Next enabled and click without answer is a wrong answer, item re-queued', async () => {
  const x = await setup({});
  const s = x.engine.start('practice', { types: ['gap'] });
  const sc = screen(x, s);
  const next = walk(view(sc), 'btn-next');
  assert.ok(next);
  assert.ok(!next.props.disabled, 'Next enabled before any answer');
  assert.strictEqual(walk(view(sc), 'btn-dont-know'), null, 'dont-know button still hidden without course flag');
  const id = sc.state.cur.item.id;
  const before = s.retryCount();
  next.props.onClick();
  assert.strictEqual(sc.state.result.correct, false);
  assert.strictEqual(sc.state.error, null);
  assert.ok(x.doc.items[id], 'answer recorded');
  assert.strictEqual(s.retryCount(), before + 1, 'item re-queued');
});

test('reading card (type card) is self-rated: Next stays disabled before an answer', async () => {
  const x = await setup({ dontKnow: true });
  const sc = screen(x, x.engine.start('practice', { types: ['card'] }));
  assert.strictEqual(walk(view(sc), 'btn-next').props.disabled, true);
});

test('timed exam: Next not disabled and no auto wrong answer', async () => {
  const x = await setup({});
  const s = x.engine.start('exam', { examId: 'timed' });
  const sc = screen(x, s);
  assert.ok(!walk(view(sc), 'btn-next').props.disabled);
  assert.strictEqual(s.canNextWrong(), false);
});
