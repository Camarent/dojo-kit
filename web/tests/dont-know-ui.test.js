'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const vm = require('node:vm');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;

function loadApp() {
  const sb = { console };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  loadBundle(sb, { only: ['types/registry.js', 'types/card.js', 'types/choice.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
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

test('button shown in practice for gap, click records one wrong and hides button', async () => {
  const x = await setup({ dontKnow: true });
  const s = x.engine.start('practice', { types: ['gap'] });
  const sc = screen(x, s);
  const btn = walk(view(sc), 'btn-dont-know');
  assert.ok(btn);
  btn.props.onClick();
  assert.strictEqual(sc.state.result.correct, false);
  assert.strictEqual(sc.state.error, null);
  assert.strictEqual(walk(view(sc), 'btn-dont-know'), null);
  assert.ok(x.doc.items[sc.state.cur.item.id]);
  assert.strictEqual(s.canOverride(), false);
  assert.strictEqual(s.overrideLast().error, 'no_override');
});

test('button shown in daily and exam training', async () => {
  const x = await setup({ dontKnow: true });
  assert.ok(walk(view(screen(x, x.engine.start('daily', {}))), 'btn-dont-know'));
  const e = x.engine.start('exam', { examId: 'timed', training: true });
  assert.ok(walk(view(screen(x, e)), 'btn-dont-know'));
});

test('button hidden in timed exam, on card items, and when course.dontKnow absent or false', async () => {
  const x = await setup({ dontKnow: true });
  const e = x.engine.start('exam', { examId: 'timed' });
  assert.strictEqual(walk(view(screen(x, e)), 'btn-dont-know'), null);
  const card = x.engine.start('practice', { types: ['card'] });
  assert.strictEqual(walk(view(screen(x, card)), 'btn-dont-know'), null);
  for (const v of [undefined, false]) {
    const y = await setup(v === undefined ? {} : { dontKnow: v });
    assert.strictEqual(walk(view(screen(y, y.engine.start('practice', { types: ['gap'] }))), 'btn-dont-know'), null);
  }
});

test('i18n en and ru carry session.dontKnow', () => {
  for (const l of ['en', 'ru']) {
    const j = JSON.parse(read('i18n/' + l + '.json'));
    assert.ok(j['session.dontKnow'] && j['session.dontKnow'].length > 0);
  }
});
