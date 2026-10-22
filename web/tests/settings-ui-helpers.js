'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const { loadBundle } = require('./load-bundle.js');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const NOW = 1760000000000;
const TODAY = '2025-10-09';

function mkContent(units) {
  const items = [];
  units.forEach((u) => {
    for (let i = 1; i <= 3; i++) {
      items.push({
        id: u.id + '-' + i,
        unit: u.id,
        type: 'gap',
        prompt: 'Q ' + u.id + ' ' + i,
        answers: ['a' + u.id + i],
        explanation: 'e'
      });
    }
  });
  return {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    course: { id: 'c', title: 'C', units: units }
  };
}

function mkI18n() {
  const en = JSON.parse(read('i18n/en.json'));
  const ru = JSON.parse(read('i18n/ru.json'));
  return { en: en, ru: ru };
}

let dojoP;
async function getDojo() {
  if (!dojoP) {
    checkWasmFresh();
    dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  }
  return dojoP;
}

async function setup(content, settings) {
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: settings || {}, exams: {} };
  const clock = { t: NOW };
  const store = {
    doc,
    update(fn) { fn(doc); doc.t = clock.t; },
    noteAnswer() {},
    exportText() { return JSON.stringify(doc); },
    importText() { return { ok: false }; },
    reset() {},
    flush() {},
    attachLifecycle() {},
    onStatus() {},
    onRemoteChange() {}
  };
  const dojo = await getDojo();
  const engine = DojoSession.createEngine({
    dojo, store, content,
    now: () => clock.t,
    today: () => TODAY,
    random: () => 0.5
  });
  return { engine, doc, clock, store, content, dojo };
}

function loadApp() {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb;
}

function find(n, id) {
  if (Array.isArray(n)) { for (const c of n) { const r = find(c, id); if (r) return r; } return null; }
  if (!n || typeof n !== 'object' || !n.props) return null;
  if (n.props['data-testid'] === id || n.props.testid === id) return n;
  return find(n.props.children, id);
}

function inst(Cls, props) {
  const i = new Cls(props);
  i.props = props;
  i.setState = function (patch) { i.state = Object.assign({}, i.state, patch); };
  return i;
}

function renderSettings(sb, engine, content, doc, win, t, onDataChanged) {
  win = win || { addEventListener() {}, removeEventListener() {}, navigator: {}, document: { createElement: () => ({}) } };
  onDataChanged = onDataChanged || function() {};
  t = t || (function(k) { return k; }); // Default to identity function
  const store = {
    doc: doc,
    exportText: function() { return JSON.stringify(doc); },
    update: function(fn) { fn(doc); },
    noteAnswer() {},
    importText() { return { ok: false }; },
    reset() {},
    flush() {},
    attachLifecycle() {},
    onStatus() {},
    onRemoteChange() {}
  };
  return inst(sb.DojoApp._SettingsScreen, {
    t: t,
    course: content.course,
    content: content,
    status: 'local',
    store: store,
    engine: engine,
    win: win,
    now: () => NOW,
    onDataChanged: onDataChanged,
    onPlacement: function() {}
  });
}

function allText(n, out) {
  out = out || [];
  if (Array.isArray(n)) { n.forEach((c) => allText(c, out)); return out; }
  if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return out; }
  if (n && typeof n === 'object' && n.props) {
    ['aria-label', 'title', 'value'].forEach((k) => { if (typeof n.props[k] === 'string') out.push(n.props[k]); });
    allText(n.props.children, out);
  }
  return out;
}

module.exports = { read, NOW, TODAY, mkContent, mkI18n, getDojo, setup, loadApp, find, allText, inst, renderSettings };
