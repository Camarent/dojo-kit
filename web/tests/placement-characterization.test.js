'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadBundle } = require('./load-bundle.js');

function load() {
  const sb = { console: { warn() {}, log() {} } };
  sb.setTimeout = (f) => f();
  loadBundle(sb, { only: ['vendor/preact.min.js', 'vendor/htm.umd.js', 'ext/registry.js', 'ext/ruby.js', 'ext/readings.js', 'ext.js'] });
  loadBundle(sb, { only: ['speech.js', 'types/registry.js', 'types/choice.js', 'types/gap.js', 'types/card.js', 'ui/i18n.js', 'ui/play-button.js', 'ui/common.js', 'ui/detail.js', 'ui/catalog-audio.js', 'ui/catalog.js', 'ui/group-card.js', 'ui/home.js', 'ui/stimulus.js', 'ui/session-feedback.js', 'ui/session-focus.js', 'ui/session-screen.js', 'ui/results.js', 'ui/placement.js', 'ui/settings-speech.js', 'ui/settings-sections.js', 'ui/settings-dialogs.js', 'ui/settings.js', 'ui/app.js'] });
  return sb;
}

const ITEM = { id: 'i1', type: 'gap', unit: 'u', tags: [], prompt: 'q', answers: ['a'] };
const CUR = { item: ITEM, view: { prompt: 'q' }, position: 1, total: 2 };

function mk(sb, mode, win) {
  const session = { placementMode: mode, current: () => CUR };
  const p = { t: (k) => k, session, win: win || {}, course: {}, content: { items: [ITEM] }, store: null, onEnd() {}, onExit() {} };
  const i = new sb.DojoApp._PlacementSession(p);
  i.props = p;
  i.setState = function (patch) { i.state = Object.assign({}, i.state, patch); };
  return i;
}
const el = (log, name, extra) => Object.assign({ focus() { log.push(name); } }, extra);

test('self mode focuses known button, else unknown', () => {
  const sb = load();
  const log = [];
  const i = mk(sb, 'self');
  i.focusSoon(); assert.deepStrictEqual(Array.from(log), []);
  i.unknownBtn = el(log, 'unknown'); i.focusSoon();
  i.knownBtn = el(log, 'known'); i.focusSoon();
  assert.deepStrictEqual(Array.from(log), ['unknown', 'known']);
});

test('confirm dialog suppresses focus', () => {
  const sb = load();
  const log = [];
  const i = mk(sb, 'self');
  i.knownBtn = el(log, 'known'); i.state.confirm = 'exit'; i.focusSoon();
  assert.deepStrictEqual(Array.from(log), []);
});

test('check mode focus targets', () => {
  const sb = load();
  const log = [];
  const i = mk(sb, 'check');
  i.input = el(log, 'input');
  i.focusSoon();
  assert.strictEqual(i.lastFocus.cur, CUR); assert.strictEqual(i.lastFocus.answered, false);
  assert.strictEqual(i.hadFocus, true);
  i.focusSoon();
  assert.deepStrictEqual(Array.from(log), ['input']);
  i.state.result = { correct: true }; i.nextBtn = el(log, 'next'); i.focusSoon();
  assert.deepStrictEqual(Array.from(log), ['input', 'next']);
  assert.strictEqual(i.hadFocus, false);
});

test('check mode autofocus fallback', () => {
  const sb = load();
  const log = [];
  const i = mk(sb, 'check');
  i.qbox = { querySelector: (q) => (q === '[data-autofocus]' ? el(log, 'auto') : null) };
  i.focusSoon();
  assert.deepStrictEqual(Array.from(log), ['auto']);
  assert.strictEqual(i.hadFocus, true);
});

test('check mode refocuses when focus lost to body', () => {
  const sb = load();
  const log = [];
  const body = {};
  const win = { document: { body, activeElement: body } };
  const i = mk(sb, 'check', win);
  i.qbox = { contains: () => false, querySelector: (q) => (q === '[data-refocus]' ? el(log, 'refocus') : null) };
  i.lastFocus = { cur: CUR, answered: false };
  i.hadFocus = true;
  i.focusSoon();
  assert.deepStrictEqual(Array.from(log), ['refocus']);
  assert.strictEqual(i.hadFocus, true);
  log.length = 0; i.hadFocus = false; i.focusSoon();
  assert.deepStrictEqual(Array.from(log), []);
  assert.strictEqual(i.hadFocus, false);
  i.hadFocus = true; i.state.result = {}; i.lastFocus = { cur: CUR, answered: true }; i.focusSoon();
  assert.deepStrictEqual(Array.from(log), []);
});

test('check mode tracks focus inside box', () => {
  const sb = load();
  const act = {};
  const win = { document: { body: {}, activeElement: act } };
  const i = mk(sb, 'check', win);
  i.qbox = { contains: (x) => x === act };
  i.lastFocus = { cur: CUR, answered: false };
  i.focusSoon();
  assert.strictEqual(i.hadFocus, true);
});
