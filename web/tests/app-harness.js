'use strict';
// Real-App harness: real App/CatalogScreen/SessionScreen/SettingsScreen in a vm, real engine + WASM, fake store and window.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DojoWasm = require('../dojo-wasm.js');
const { checkWasmFresh } = require('./loader.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function loadApp(appSource) {
  const sb = { console: { warn() {}, log: console.log } };
  sb.self = sb;
  vm.createContext(sb);
  ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext.js', 'speech.js', 'session.js'].forEach((f) => vm.runInContext(read(f), sb, { filename: f }));
  ['types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/app.js'].forEach((f) => vm.runInContext(f === 'ui/app.js' && appSource != null ? appSource : read(f), sb, { filename: f }));
  return sb;
}
function expand(n) {
  if (Array.isArray(n)) return n.map(expand);
  if (!n || typeof n !== 'object' || !n.props) return n;
  if (typeof n.type === 'function' && !(n.type.prototype && n.type.prototype.render)) return expand(n.type(Object.assign({}, n.props)));
  const kids = n.props.children;
  return { type: n.type, props: Object.assign({}, n.props, { children: kids === undefined ? kids : expand(kids) }) };
}
function walk(n, fn) {
  if (Array.isArray(n)) { n.forEach((c) => walk(c, fn)); return; }
  if (!n || typeof n !== 'object' || !n.props) return;
  fn(n);
  walk(n.props.children, fn);
}
function find(tree, id) { let r = null; walk(tree, (n) => { if (!r && n.props['data-testid'] === id) r = n; }); return r; }
function findAll(tree, re) { const r = []; walk(tree, (n) => { const id = n.props['data-testid']; if (typeof id === 'string' && re.test(id)) r.push(n); }); return r; }
function text(n) {
  let s = '';
  (function rec(x) {
    if (Array.isArray(x)) return x.forEach(rec);
    if (typeof x === 'string' || typeof x === 'number') { s += x; return; }
    if (x && x.props) rec(x.props.children);
  })(n);
  return s;
}
function fakeWin(voices) {
  const spoken = [];
  const listeners = {};
  const win = { spoken, listeners, addEventListener() {}, removeEventListener() {}, document: {} };
  win.SpeechSynthesisUtterance = function (t) { this.text = t; };
  win.speechSynthesis = {
    getVoices: () => win.voices,
    speak: (u) => spoken.push(u),
    cancel() {},
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener(n, f) { listeners[n] = (listeners[n] || []).filter((x) => x !== f); }
  };
  win.voices = voices || [];
  return win;
}

async function mount(o) {
  o = o || {};
  const sb = loadApp(o.appSource);
  if (o.setup) o.setup(sb);
  const dojo = await DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  const items = o.items;
  const course = Object.assign({ id: 'c', title: 'C', units: [{ id: 'u1', title: 'U1' }, { id: 'u2', title: 'U2' }] }, o.course);
  const content = { v: 1, course, items, stimuli: o.stimuli || [], version: 't', lock: items.map((i) => i.id) };
  if (o.intros) content.intros = o.intros;
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: o.settings || {}, exams: {} };
  const store = { doc, status: 'ok', update(fn) { fn(doc); doc.t = NOW; }, flush() {}, noteAnswer() {}, exportText: () => '' };
  const engine = DojoSession_(sb).createEngine({ dojo, store, content, now: () => NOW, today: () => TODAY, random: () => 0.5 });
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  const t = sb.DojoApp._makeT({ en, ru }, o.lang || 'en');
  const byId = {};
  items.forEach((i) => { byId[i.id] = i; });
  const win = o.win || fakeWin([]);
  const app = new sb.DojoApp._App({ store, engine, dojo, t, content, course, byId, now: () => NOW, today: () => TODAY, win, lang: o.lang || 'en' });
  app.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
  app.go('home');
  const m = { sb, app, engine, store, doc, win, course, t, tree: () => expand(app.render(app.props, app.state)) };
  // Instance of a class screen the App currently renders, with a synchronous setState; view() re-renders it.
  m.screen = (Cls) => {
    let props = null;
    walk(m.tree(), (n) => { if (!props && n.type === Cls) props = n.props; });
    if (!props) throw new Error('screen not rendered: ' + Cls.name);
    const inst = new Cls(props);
    inst.setState = function (p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); };
    inst.view = () => expand(inst.render(inst.props, inst.state));
    return inst;
  };
  return m;
}
function DojoSession_(sb) { return sb.DojoSession; }

module.exports = { read, loadApp, expand, walk, find, findAll, text, fakeWin, mount, NOW, TODAY };
