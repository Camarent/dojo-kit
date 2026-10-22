'use strict';
// Shared mount/drive helpers for the session key-handling tests.
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { NOW, TODAY, Node_, doc, q, loadSandbox: loadFixtureSandbox } = require('./fixtures.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SANDBOX_OPTS = { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js', 'types/registry.js', 'types/card.js', 'types/choice.js', 'types/cloze.js', 'types/gap.js', 'types/match.js', 'types/multi.js', 'types/numeric.js', 'types/order.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings.js']).concat(['ui/app.js']) };
const loadSandbox = () => loadFixtureSandbox(SANDBOX_OPTS);

const mounted = [];

async function mount(items, courseExtra, intros) {
  const { sb, win } = loadSandbox();
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const course = Object.assign({ id: 'c', title: 'C', units: [{ id: 'u' }], markup: 'ja-readings' }, courseExtra);
  const content = { v: 1, course, items, version: 't', lock: items.map((i) => i.id) };
  if (intros) content.intros = intros;
  const d = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: {}, exams: {} };
  const store = { doc: d, status: 'ok', update(fn) { fn(d); d.t = NOW; }, flush() {}, answers: 0, noteAnswer() { store.answers++; } };
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  sb.DojoExt.use(course.markup);
  const en = JSON.parse(read('i18n/en.json'));
  const t = sb.DojoApp._makeT({ en }, 'en');
  const byId = {};
  items.forEach((i) => { byId[i.id] = i; });
  const rootEl = new Node_(1, 'DIV');
  let app = null;
  sb.preact.render(sb.preact.h(sb.DojoApp._App, { ref: (a) => { app = a; }, t, lang: 'en', store, engine, dojo, content, course, byId, now: () => NOW, today: () => TODAY, win }), rootEl);
  const flush = async () => { await new Promise((r) => setTimeout(r, 5)); };
  doc.root = rootEl;
  mounted.push(() => sb.preact.render(null, rootEl));
  return { sb, app, rootEl, engine, win, flush, store };
}

function click(m, id) {
  const b = q(m.rootEl, id);
  if (b) b.fire('click');
  return b;
}

async function startSession(m, mode) {
  m.app.startMode(mode || 'daily', {});
  await m.flush();
}

const key = (k, target, extra) => { const e = Object.assign({ key: k, target, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, extra); e.preventDefault = () => { e.prevented = true; }; return e; };
const cur = (m) => m.app.state.session.current().item.id;
const press = async (m, ev) => { m.win.fire('keydown', ev); await m.flush(); return ev; };
const answered = async (m) => { click(m, 'btn-dont-know'); await m.flush(); };

module.exports = { NOW, TODAY, Node_, doc, q, read, loadSandbox, mounted, mount, click, key, cur, press, answered, startSession };
