'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

const NOW = 1760000000000;

function items(count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    out.push({ id: 'q' + i, unit: 'u', type: 'gap', prompt: 'P ' + i, answers: ['x'], tags: ['t'] });
  }
  return out;
}

const SECTIONS = [{ title: 'S', count: 10, tags: ['t'] }];
const EXAM = { id: 'm1', passMark: 0.5, sections: SECTIONS, minutes: 30 };

let dojoP;
async function loadDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return await dojoP;
}

function content() {
  const its = items(10);
  const course = { id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }], exams: [EXAM] };
  return { v: 1, version: 't', lock: its.map((i) => i.id), items: its, course: course };
}

function freshDoc() {
  return { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
}

async function setup() {
  const dojo = await loadDojo();
  const doc = freshDoc();
  const clock = { t: NOW };
  const store = { doc, update(fn) { fn(doc); }, noteAnswer() {} };
  const engine = DojoSession.createEngine({ dojo, store, content: content(), now: () => clock.t, today: () => '2025-10-09', random: () => 0.5 });
  return { engine };
}

function loadApp() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  loadBundle(sb, { only: ['types/registry.js', 'types/card.js', 'types/choice.js', 'ui/answer-block.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js', 'ui/catalog-audio.js', 'ui/catalog-detail.js', 'ui/catalog.js', 'ui/group-card.js', 'ui/home.js', 'ui/stimulus.js', 'ui/session-feedback.js', 'ui/session-focus.js', 'ui/session-boundary.js', 'ui/session-panels.js', 'ui/session-screen.js', 'ui/session-finish.js', 'ui/results.js', 'ui/placement.js', 'ui/settings-speech.js', 'ui/settings-unit-dialogs.js', 'ui/settings-sections.js', 'ui/settings-plugin.js', 'ui/settings-dialogs.js', 'ui/settings.js', 'ui/app-screens.js', 'ui/app.js'] });
  return sb.DojoApp;
}

function findId(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = findId(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id || n.props.testid === id) return n;
  return findId(n.props.children, id);
}

function textOf(n) {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (typeof n === 'object') return n.props ? textOf(n.props.children) : '';
  return String(n);
}

// Renders the exam session screen with the session parked on its last question.
function renderOnLast() {
  return setup().then(({ engine }) => {
    const s = engine.start('exam', { examId: 'm1' });
    for (let i = 1; i < 10; i++) s.next();
    const App = loadApp();
    const props = { t: (k) => k, session: s, now: () => NOW, win: {}, course: content().course, byId: {}, dojo: null, onExit: () => {} };
    const sc = new App._SessionScreen(props);
    sc.state = Object.assign({}, sc.state, { cur: s.current() });
    return { s, tree: sc.render(sc.props, sc.state) };
  });
}

test('exam last question: one finish control, the next button carries the finish label', async () => {
  const { tree } = await renderOnLast();
  assert.strictEqual(findId(tree, 'btn-finish'), null, 'no separate finish button on the last question');
  const next = findId(tree, 'btn-next');
  assert.ok(next, 'next button rendered');
  assert.strictEqual(textOf(next.props.children), 'session.finish');
});

test('exam counter shows the position, not the answered count', async () => {
  const { s, tree } = await renderOnLast();
  const counter = findId(tree, 'progress');
  assert.ok(counter, 'counter rendered');
  assert.strictEqual(textOf(counter.props.children), s.current().position + ' / ' + s.current().total);
  assert.strictEqual(s.answered, 0, 'no answer given, so the old answered count would read 0');
});
