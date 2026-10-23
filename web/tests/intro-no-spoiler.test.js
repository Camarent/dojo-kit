'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const DojoWasm = require('../dojo-wasm.js');
const DojoSession = require('../session.js');
const { checkWasmFresh } = require('./loader.js');
const H = require('./app-harness.js');
const { loadBundle } = require('./load-bundle.js');

const ROOT = path.join(__dirname, '..', '..');
const NOW = 1760000000000;
const TODAY = '2025-10-09';
const tr = (k, v) => k + (v ? JSON.stringify(v) : '');

let dojoP;
function getDojo() {
  if (!dojoP) dojoP = DojoWasm.load(fs.readFileSync(checkWasmFresh()));
  return dojoP;
}

function load(markup) {
  const sb = { console: { warn() {}, log: console.log } };
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js'] });
  if (markup) {
    sb.DojoExt.registerMarkup('ruby', { render: (s) => s, plain: (s) => s.replace(/\{([^|}]*)\|[^}]*\}/g, '$1') });
    sb.DojoExt.use('ruby');
  }
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/common.js', 'ui/detail.js'].concat(['ui/catalog.js']).concat(['ui/home.js']).concat(['ui/stimulus.js']).concat(['ui/session-feedback.js']).concat(['ui/session-focus.js']).concat(['ui/session-screen.js']).concat(['ui/results.js']).concat(['ui/placement.js']).concat(['ui/settings-speech.js']).concat(['ui/settings-sections.js']).concat(['ui/settings-dialogs.js']).concat(['ui/settings.js']).concat(['ui/app.js']) });
  return sb;
}

function inst(Cls, props) {
  const i = new Cls(props);
  i.props = props;
  i.setState = function (patch) { i.state = Object.assign({}, i.state, patch); };
  i.view = () => i.render(i.props, i.state);
  return i;
}

async function setup(course, opts) {
  const o = opts || {};
  const doc = { v: 1, t: 0, items: {}, stats: { days: {}, newByDay: {} }, settings: o.settings || {}, exams: {} };
  const clock = { t: NOW };
  const counters = { noted: 0 };
  const store = {
    doc,
    update(fn) { fn(doc); },
    noteAnswer() { counters.noted++; },
    exportText() { return JSON.stringify(doc); }
  };
  const items = o.items || [];
  const stimuli = o.stimuli || [];
  const content = {
    v: 1, version: 't', lock: items.map((i) => i.id), items,
    stimuli,
    course: Object.assign({ id: 'c', title: 'C', units: [{ id: 'u', title: 'U' }] }, course)
  };
  const dojo = o.wrapDojo ? o.wrapDojo(await getDojo()) : await getDojo();
  const engine = DojoSession.createEngine({ dojo, store, content, now: () => clock.t, today: () => TODAY, random: () => 0.5 });
  return { engine, doc, clock, store, content, counters, dojo };
}

// ---- Tests for shouldShowIntro with stimulus and audio ----

test('stimulus item never shows its explanation before answering', async () => {
  const stimuli = [{ id: 'st1', text: 'Stimulus text' }];
  const items = [
    { id: 's1', unit: 'u', type: 'choice', prompt: 'Question with stimulus', options: ['a', 'b'], answer: 0, explanation: 'This is the explanation', stimulus: 'st1' }
  ];
  const t = await setup({ introNew: true }, { items, stimuli });
  const s = t.engine.start('daily');
  const item = s.current().item;
  assert.strictEqual(s.shouldShowIntro(item), false);
});

test('item with audio lines (speak string) never shows its explanation before answering', async () => {
  const items = [
    { id: 'a1', unit: 'u', type: 'choice', prompt: 'Question with audio', options: ['a', 'b'], answer: 0, explanation: 'This is the explanation', speak: 'Listen to this' }
  ];
  const t = await setup({ introNew: true }, { items });
  const s = t.engine.start('daily');
  const item = s.current().item;
  assert.strictEqual(s.shouldShowIntro(item), false);
});

test('item with audio lines (speak.lines array) never shows its explanation before answering', async () => {
  const items = [
    { id: 'a2', unit: 'u', type: 'choice', prompt: 'Question with audio lines', options: ['a', 'b'], answer: 0, explanation: 'This is the explanation', speak: { lines: [{ text: 'First line' }, { text: 'Second line' }] } }
  ];
  const t = await setup({ introNew: true }, { items });
  const s = t.engine.start('daily');
  const item = s.current().item;
  assert.strictEqual(s.shouldShowIntro(item), false);
});

test('plain item with explanation shows intro once then not again', async () => {
  const items = [
    { id: 'p1', unit: 'u', type: 'choice', prompt: 'Plain question', options: ['a', 'b'], answer: 0, explanation: 'This is the explanation' }
  ];
  const t = await setup({ introNew: true }, { items });
  const s = t.engine.start('daily');
  const item = s.current().item;
  assert.strictEqual(s.shouldShowIntro(item), true);
  assert.strictEqual(s.shouldShowIntro(item), false);
});

// ---- App harness tests ----

function sessionScreen(sb, session, course) {
  const win = { addEventListener() {}, removeEventListener() {} };
  return inst(sb.DojoApp._SessionScreen, { t: tr, session, now: () => NOW, win, course: course || {}, onEnd() {}, onExit() {} });
}

test('App: listening item with stimulus has no intro element before answering', async () => {
  const sb = load();
  const stimuli = [{ id: 'st1', text: 'Listen carefully' }];
  const items = [
    { id: 's1', unit: 'u', type: 'choice', prompt: 'What did you hear?', options: ['a', 'b'], answer: 0, explanation: 'Explanation text', stimulus: 'st1' }
  ];
  const t = await setup({ introNew: true }, { items, stimuli });
  const ui = sessionScreen(sb, t.engine.start('daily'));
  assert.strictEqual(H.find(ui.view(), 'intro'), null);
  ui.answer({ index: 0 });
  assert.ok(H.find(ui.view(), 'explanation'));
});

test('App: listening item with speak string has no intro element before answering', async () => {
  const sb = H.loadApp();
  const items = [
    { id: 'a1', unit: 'u', type: 'choice', prompt: 'What did you hear?', options: ['a', 'b'], answer: 0, explanation: 'Explanation text', speak: 'Listen to this audio' }
  ];
  const m = await H.mount({ items, course: { introNew: true } });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  assert.strictEqual(H.find(scr.view(), 'intro'), null);
  scr.answer({ index: 0 });
  assert.ok(H.find(scr.view(), 'explanation'));
});

test('App: listening item with speak.lines has no intro element before answering', async () => {
  const sb = H.loadApp();
  const items = [
    { id: 'a2', unit: 'u', type: 'choice', prompt: 'What did you hear?', options: ['a', 'b'], answer: 0, explanation: 'Explanation text', speak: { lines: [{ text: 'Audio line 1' }] } }
  ];
  const m = await H.mount({ items, course: { introNew: true } });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  assert.strictEqual(H.find(scr.view(), 'intro'), null);
  scr.answer({ index: 0 });
  assert.ok(H.find(scr.view(), 'explanation'));
});

test('App: plain item shows intro element before answering', async () => {
  const sb = H.loadApp();
  const items = [
    { id: 'p1', unit: 'u', type: 'choice', prompt: 'Plain question', options: ['a', 'b'], answer: 0, explanation: 'Explanation text' }
  ];
  const m = await H.mount({ items, course: { introNew: true } });
  m.app.startMode('daily', {});
  const scr = m.screen(m.sb.DojoApp._SessionScreen);
  assert.ok(H.find(scr.view(), 'intro'));
  scr.answer({ index: 0 });
  assert.ok(H.find(scr.view(), 'explanation'));
});
