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

function loadSb() {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js'] });
  vm.runInContext('self.DojoExt = { text: function (s) { return s; } };', sb);
  loadBundle(sb, { only: ['ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb;
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
  const sb = loadSb();
  const App = sb.DojoApp;
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
  return { sb, App, app, engine, doc, clock };
}

test('app wiring: props the app gives the session screen make btn-flag-clip render', async () => {
  const x = await setup();
  const session = x.engine.start('practice', { unit: 'u', limit: 2 });
  assert.ok(!session.error);
  x.app.setState({ screen: 'session', session });
  const el = x.app.render(x.app.props, x.app.state);
  const boundary = el.props.children;
  const child = Array.isArray(boundary.props.children) ? boundary.props.children[0] : boundary.props.children;
  const props = child.props;
  x.sb.DojoAudio = { heardClip: () => 'c1' };
  const host = { state: {}, isExam: () => false, setState() {} };
  const st = { cur: { stimulus: { id: 'st' } }, result: { correct: false }, audioMark: 0 };
  const btn = x.sb.DojoSessionFeedback.flagButton(host, props, st);
  assert.ok(btn && walk(btn, 'btn-flag-clip') !== undefined && JSON.stringify(btn).includes('btn-flag-clip'));
});
